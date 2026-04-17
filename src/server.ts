import { createWorkersAI } from "workers-ai-provider";
import { callable, routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  tool,
  type ModelMessage
} from "ai";
import { z } from "zod";

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * The AI SDK's downloadAssets step runs `new URL(data)` on every file
 * part's string data. Data URIs parse as valid URLs, so it tries to
 * HTTP-fetch them and fails. Decode to Uint8Array so the SDK treats
 * them as inline data instead.
 */
function inlineDataUrls(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "user" || typeof msg.content === "string") return msg;
    return {
      ...msg,
      content: msg.content.map((part) => {
        if (part.type !== "file" || typeof part.data !== "string") return part;
        const match = part.data.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return part;
        const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
        return { ...part, data: bytes, mediaType: match[1] };
      })
    };
  });
}

// ── SQL table init ────────────────────────────────────────────────────

function ensureTables(sql: SqlStorage) {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  sql.exec(`
    CREATE TABLE IF NOT EXISTS flashcards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      subject TEXT DEFAULT 'general',
      difficulty INTEGER DEFAULT 1,
      times_reviewed INTEGER DEFAULT 0,
      last_reviewed TEXT,
      next_review TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  sql.exec(`
    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT 25,
      scheduled_at TEXT NOT NULL,
      status TEXT DEFAULT 'scheduled',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ── Study Assistant Agent ─────────────────────────────────────────────

export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 100;

  onStart() {
    // Initialise study tables
    ensureTables(this.sql);

    // Configure OAuth popup behavior for MCP servers that require authentication
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" },
            status: 200
          });
        }
        return new Response(
          `Authentication Failed: ${result.authError || "Unknown error"}`,
          { headers: { "content-type": "text/plain" }, status: 400 }
        );
      }
    });
  }

  // ── RPC callables ─────────────────────────────────────────────────

  @callable()
  async addServer(name: string, url: string) {
    return await this.addMcpServer(name, url);
  }

  @callable()
  async removeServer(serverId: string) {
    await this.removeMcpServer(serverId);
  }

  /** Expose memories to the frontend sidebar */
  @callable()
  getMemories() {
    ensureTables(this.sql);
    const rows = this.sql
      .exec(
        "SELECT key, value, category, created_at FROM memories ORDER BY created_at DESC LIMIT 50"
      )
      .toArray();
    return rows;
  }

  /** Expose flashcards to the frontend sidebar */
  @callable()
  getFlashcards() {
    ensureTables(this.sql);
    const rows = this.sql
      .exec(
        "SELECT id, question, answer, subject, difficulty, times_reviewed, next_review FROM flashcards ORDER BY next_review ASC LIMIT 50"
      )
      .toArray();
    return rows;
  }

  /** Expose study sessions to the frontend */
  @callable()
  getStudySessions() {
    ensureTables(this.sql);
    const rows = this.sql
      .exec(
        "SELECT id, subject, duration_minutes, scheduled_at, status, notes FROM study_sessions ORDER BY scheduled_at DESC LIMIT 20"
      )
      .toArray();
    return rows;
  }

  // ── Chat handler ──────────────────────────────────────────────────

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = this.mcp.getAITools();
    const workersai = createWorkersAI({ binding: this.env.AI });

    // Gather current memories for context
    let memoryContext = "";
    try {
      const mems = this.sql
        .exec(
          "SELECT key, value, category FROM memories ORDER BY created_at DESC LIMIT 20"
        )
        .toArray();
      if (mems.length > 0) {
        memoryContext =
          "\n\nUser's stored memories:\n" +
          mems
            .map((m: any) => `- [${m.category}] ${m.key}: ${m.value}`)
            .join("\n");
      }
    } catch {
      /* tables may not exist yet */
    }

    const result = streamText({
      model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        sessionAffinity: this.sessionAffinity
      }),
      system: `You are StudyBuddy, an intelligent AI study assistant. You help students learn effectively by:

1. **Remembering** important facts, preferences, and context about the student using the remember/recall tools
2. **Creating flashcards** for spaced repetition study
3. **Scheduling study sessions** and sending reminders
4. **Summarizing** complex topics into digestible explanations
5. **Answering questions** about any academic subject with clear, educational explanations

You are encouraging, patient, and thorough. When explaining concepts, use analogies and examples. When creating flashcards, make them specific and testable.

Always check your memory for relevant user context before answering.
${memoryContext}

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a study session or set a reminder, use the scheduleTask tool.`,
      messages: pruneMessages({
        messages: inlineDataUrls(await convertToModelMessages(this.messages)),
        toolCalls: "before-last-2-messages"
      }),
      tools: {
        // MCP tools from connected servers
        ...mcpTools,

        // ── Memory tools ──────────────────────────────────────────

        remember: tool({
          description:
            "Store an important fact, preference, or piece of information about the student. Use this to remember things like their name, subjects they're studying, learning goals, etc.",
          inputSchema: z.object({
            key: z
              .string()
              .describe(
                "Short label for the memory (e.g. 'name', 'major', 'goal')"
              ),
            value: z.string().describe("The information to remember"),
            category: z
              .enum(["personal", "academic", "preference", "general"])
              .describe("Category of the memory")
              .default("general")
          }),
          execute: async ({ key, value, category }) => {
            ensureTables(this.sql);
            this.sql.exec(
              "INSERT INTO memories (key, value, category) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, category = excluded.category",
              key,
              value,
              category
            );
            // Broadcast state update so sidebar refreshes
            this.broadcast(JSON.stringify({ type: "memory-updated" }));
            return { success: true, message: `Remembered: ${key} = ${value}` };
          }
        }),

        recall: tool({
          description:
            "Search stored memories about the student. Use this to recall things you've previously remembered.",
          inputSchema: z.object({
            query: z.string().describe("Search term to look for in memories")
          }),
          execute: async ({ query }) => {
            ensureTables(this.sql);
            const rows = this.sql
              .exec(
                "SELECT key, value, category FROM memories WHERE key LIKE ? OR value LIKE ? ORDER BY created_at DESC LIMIT 10",
                `%${query}%`,
                `%${query}%`
              )
              .toArray();
            if (rows.length === 0) {
              return {
                found: false,
                message: "No memories found matching that query."
              };
            }
            return { found: true, memories: rows };
          }
        }),

        forget: tool({
          description: "Remove a specific memory by its key.",
          inputSchema: z.object({
            key: z.string().describe("The key of the memory to forget")
          }),
          execute: async ({ key }) => {
            ensureTables(this.sql);
            this.sql.exec("DELETE FROM memories WHERE key = ?", key);
            this.broadcast(JSON.stringify({ type: "memory-updated" }));
            return { success: true, message: `Forgot: ${key}` };
          }
        }),

        // ── Flashcard tools ───────────────────────────────────────

        createFlashcard: tool({
          description:
            "Create a flashcard for spaced repetition study. Use this when the student wants to memorize a concept, definition, formula, etc.",
          inputSchema: z.object({
            question: z.string().describe("The question side of the flashcard"),
            answer: z.string().describe("The answer side of the flashcard"),
            subject: z
              .string()
              .describe("The subject/topic (e.g. 'Biology', 'Calculus')")
              .default("general"),
            difficulty: z
              .number()
              .min(1)
              .max(5)
              .describe("Difficulty 1-5")
              .default(1)
          }),
          execute: async ({ question, answer, subject, difficulty }) => {
            ensureTables(this.sql);
            this.sql.exec(
              "INSERT INTO flashcards (question, answer, subject, difficulty) VALUES (?, ?, ?, ?)",
              question,
              answer,
              subject,
              difficulty
            );
            this.broadcast(JSON.stringify({ type: "flashcard-updated" }));
            return {
              success: true,
              message: `Flashcard created for ${subject}: "${question}"`
            };
          }
        }),

        reviewFlashcards: tool({
          description:
            "Get flashcards that are due for review. Uses spaced repetition — cards answered correctly are shown less often.",
          inputSchema: z.object({
            subject: z
              .string()
              .describe("Filter by subject, or 'all' for all subjects")
              .default("all"),
            limit: z.number().describe("Number of cards to review").default(5)
          }),
          execute: async ({ subject, limit }) => {
            ensureTables(this.sql);
            const query =
              subject === "all"
                ? "SELECT id, question, answer, subject, difficulty, times_reviewed FROM flashcards WHERE next_review <= datetime('now') ORDER BY next_review ASC LIMIT ?"
                : "SELECT id, question, answer, subject, difficulty, times_reviewed FROM flashcards WHERE subject = ? AND next_review <= datetime('now') ORDER BY next_review ASC LIMIT ?";
            const rows =
              subject === "all"
                ? this.sql.exec(query, limit).toArray()
                : this.sql.exec(query, subject, limit).toArray();
            if (rows.length === 0) {
              return {
                message:
                  "No flashcards due for review! Great job staying on top of your studies. 🎉"
              };
            }
            return { cards: rows, count: rows.length };
          }
        }),

        markFlashcardReviewed: tool({
          description:
            "Mark a flashcard as reviewed after the student has practiced it. Adjusts the next review time based on difficulty.",
          inputSchema: z.object({
            cardId: z.number().describe("The flashcard ID"),
            correct: z.boolean().describe("Whether the student got it right")
          }),
          execute: async ({ cardId, correct }) => {
            ensureTables(this.sql);
            // Simple spaced repetition: correct → longer delay, wrong → sooner
            const delayDays = correct
              ? "CAST(POWER(2, MIN(times_reviewed, 7)) AS INTEGER)"
              : "0";
            this.sql.exec(
              `UPDATE flashcards 
               SET times_reviewed = times_reviewed + 1,
                   last_reviewed = datetime('now'),
                   next_review = datetime('now', '+' || ${delayDays} || ' days')
               WHERE id = ?`,
              cardId
            );
            this.broadcast(JSON.stringify({ type: "flashcard-updated" }));
            return {
              success: true,
              message: correct
                ? "Nice work! Card will reappear later. 🌟"
                : "No worries — we'll review this one again soon! 💪"
            };
          }
        }),

        // ── Study session tools ───────────────────────────────────

        createStudySession: tool({
          description:
            "Create a study session plan. This helps the student organize their study time.",
          inputSchema: z.object({
            subject: z.string().describe("Subject to study"),
            durationMinutes: z
              .number()
              .describe("Duration in minutes (default 25 for Pomodoro)")
              .default(25),
            notes: z
              .string()
              .describe("Any notes or focus areas for this session")
              .optional()
          }),
          execute: async ({ subject, durationMinutes, notes }) => {
            ensureTables(this.sql);
            const scheduledAt = new Date().toISOString();
            this.sql.exec(
              "INSERT INTO study_sessions (subject, duration_minutes, scheduled_at, notes) VALUES (?, ?, ?, ?)",
              subject,
              durationMinutes,
              scheduledAt,
              notes || null
            );
            this.broadcast(JSON.stringify({ type: "session-updated" }));
            return {
              success: true,
              message: `Study session created: ${subject} for ${durationMinutes} minutes`
            };
          }
        }),

        getStudyStats: tool({
          description:
            "Get overview statistics about the student's study progress.",
          inputSchema: z.object({}),
          execute: async () => {
            ensureTables(this.sql);
            const memCount = this.sql
              .exec("SELECT COUNT(*) as count FROM memories")
              .toArray()[0] as any;
            const cardCount = this.sql
              .exec("SELECT COUNT(*) as count FROM flashcards")
              .toArray()[0] as any;
            const dueCards = this.sql
              .exec(
                "SELECT COUNT(*) as count FROM flashcards WHERE next_review <= datetime('now')"
              )
              .toArray()[0] as any;
            const sessionCount = this.sql
              .exec("SELECT COUNT(*) as count FROM study_sessions")
              .toArray()[0] as any;
            const subjects = this.sql
              .exec("SELECT DISTINCT subject FROM flashcards")
              .toArray()
              .map((r: any) => r.subject);

            return {
              totalMemories: memCount.count,
              totalFlashcards: cardCount.count,
              flashcardsDueForReview: dueCards.count,
              totalStudySessions: sessionCount.count,
              subjects
            };
          }
        }),

        // ── Scheduling ────────────────────────────────────────────

        scheduleTask: tool({
          description:
            "Schedule a study reminder or task for later. Use this when the student asks to be reminded about something or wants to schedule study time.",
          inputSchema: scheduleSchema,
          execute: async ({ when, description }) => {
            if (when.type === "no-schedule") {
              return "Not a valid schedule input";
            }
            const input =
              when.type === "scheduled"
                ? when.date
                : when.type === "delayed"
                  ? when.delayInSeconds
                  : when.type === "cron"
                    ? when.cron
                    : null;
            if (!input) return "Invalid schedule type";
            try {
              this.schedule(input, "executeTask", description, {
                idempotent: true
              });
              return `Study reminder scheduled: "${description}" (${when.type}: ${input})`;
            } catch (error) {
              return `Error scheduling: ${error}`;
            }
          }
        }),

        getScheduledTasks: tool({
          description: "List all scheduled study reminders and tasks.",
          inputSchema: z.object({}),
          execute: async () => {
            const tasks = this.getSchedules();
            return tasks.length > 0 ? tasks : "No scheduled reminders found.";
          }
        }),

        cancelScheduledTask: tool({
          description: "Cancel a scheduled study reminder by its ID.",
          inputSchema: z.object({
            taskId: z.string().describe("The ID of the task to cancel")
          }),
          execute: async ({ taskId }) => {
            try {
              this.cancelSchedule(taskId);
              return `Reminder ${taskId} cancelled.`;
            } catch (error) {
              return `Error cancelling: ${error}`;
            }
          }
        }),

        // ── Client-side tool ──────────────────────────────────────

        getUserTimezone: tool({
          description:
            "Get the user's timezone from their browser. Use this when you need to know the user's local time.",
          inputSchema: z.object({})
        })
      },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }

  async executeTask(description: string, _task: Schedule<string>) {
    console.log(`Executing scheduled task: ${description}`);

    this.broadcast(
      JSON.stringify({
        type: "scheduled-task",
        description,
        timestamp: new Date().toISOString()
      })
    );
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
