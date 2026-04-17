# PROMPTS.md — AI Prompts Used During Development

This document records all AI prompts used during the development of the StudyBuddy AI Study Assistant, as required by the Cloudflare AI assignment.

---

## 1. Project Planning & Architecture

### Prompt 1.1 — Initial Project Plan
```
Build Agents on Cloudflare

Most AI applications today are stateless — they process a request, return a response, and forget everything. Real agents need more. They need to remember conversations, act on schedules, call tools, coordinate with other agents, and stay connected to users in real-time. The Agents SDK gives you all of this as a TypeScript class.

Each agent runs on a Durable Object — a stateful micro-server with its own SQL database, WebSocket connections, and scheduling. Deploy once and Cloudflare runs your agents across its global network, scaling to tens of millions of instances.

[Full starter template documentation was provided as context]

Make a plan for building an AI-powered study assistant with memory, flashcards, and scheduling.
```

**Purpose**: Generate an implementation plan covering architecture, features, and deployment strategy.

---

## 2. Server-Side Agent Development

### Prompt 2.1 — Study Assistant Agent Design
```
Transform the starter agent into a StudyAssistant agent (extending AIChatAgent) with:
- Memory: Implement persistent storage using the built-in SQLite database to store user preferences and "known facts"
- LLM: Configure to use meta/llama-3.3-70b-instruct on Workers AI
- Tools: remember(key, value), recall(query), forget(key), createFlashcard, reviewFlashcards, markFlashcardReviewed, createStudySession, getStudyStats, scheduleTask
- Keep MCP support and scheduling from the starter
```

**Purpose**: Design the core agent logic with study-specific tools, SQL schema, and spaced repetition algorithm.

### Prompt 2.2 — System Prompt for StudyBuddy
The following system prompt is used at runtime to instruct the LLM:

```
You are StudyBuddy, an intelligent AI study assistant. You help students learn effectively by:

1. **Remembering** important facts, preferences, and context about the student using the remember/recall tools
2. **Creating flashcards** for spaced repetition study
3. **Scheduling study sessions** and sending reminders
4. **Summarizing** complex topics into digestible explanations
5. **Answering questions** about any academic subject with clear, educational explanations

You are encouraging, patient, and thorough. When explaining concepts, use analogies and examples. When creating flashcards, make them specific and testable.

Always check your memory for relevant user context before answering.
```

**Purpose**: Runtime system prompt that defines the agent's personality, capabilities, and behavioral guidelines.

---

## 3. Frontend UI Development

### Prompt 3.1 — Premium Study UI
```
Create a premium, responsive chat interface for a study assistant with:
- Study assistant branding with violet/indigo color theme
- Memory/flashcard/session sidebar panel with tabs
- Study-themed prompt suggestions (flashcards, memory, scheduling)
- Gradient user message bubbles
- Animated sidebar with slide-in transition
- Flipable flashcard cards in the sidebar
```

**Purpose**: Design and implement the React frontend with study-specific UI components.

---

## 4. Documentation

### Prompt 4.1 — README Generation
```
Write a comprehensive README.md with:
- Architecture diagram (ASCII)
- Feature list with emoji icons
- Getting started / deployment instructions
- Usage examples for memory, flashcards, scheduling
- Tools reference table
- Project structure
```

**Purpose**: Generate professional documentation for the GitHub repository.

---

## 5. Tools & Technologies Used

| Tool | Version | Purpose |
|------|---------|---------|
| Cloudflare Agents SDK | ^0.11.1 | Agent framework with Durable Objects |
| @cloudflare/ai-chat | ^0.4.4 | AIChatAgent base class |
| Workers AI | — | LLM inference (Llama 3.3 70B) |
| Vercel AI SDK | ^6.0.164 | Streaming, tool calling, message handling |
| React | ^19.2.5 | Frontend UI framework |
| Vite | ^8.0.8 | Build tool and dev server |
| TailwindCSS | ^4.2.2 | Utility-first CSS framework |
| Zod | ^4.3.6 | Tool input schema validation |
| @cloudflare/kumo | ^1.18.0 | Cloudflare design system components |

---

## 6. AI-Assisted Development Notes

- **Code Generation**: AI was used to scaffold the initial agent tools, SQL schema, and React components from the starter template.
- **Iteration**: The system prompt was refined through testing to ensure the agent reliably uses tools (especially `remember` and `createFlashcard`) rather than just responding with text.
- **Debugging**: AI assisted with resolving TypeScript type issues related to the Durable Object SQL API and the AI SDK's message format.
- **Documentation**: README, architecture diagrams, and this PROMPTS.md file were AI-assisted.

All generated code was reviewed, tested, and modified by a human developer before submission.
