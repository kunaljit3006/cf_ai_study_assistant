# 📚 StudyBuddy — AI Study Assistant

> An AI-powered study assistant built on Cloudflare's Agents SDK. StudyBuddy remembers your learning context, creates flashcards with spaced repetition, schedules study sessions, and helps you master any subject — all powered by stateful Durable Objects running on Cloudflare's global network.

[![Built with Cloudflare Agents](https://img.shields.io/badge/Built%20with-Cloudflare%20Agents-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/agents/)
[![Powered by Workers AI](https://img.shields.io/badge/Powered%20by-Workers%20AI-7C3AED?style=for-the-badge&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers-ai/)

---

## ✨ Features

### 🧠 Persistent Memory
StudyBuddy remembers everything about you — your name, subjects, learning goals, and preferences. State is stored in the Durable Object's built-in SQLite database and survives restarts, deploys, and hibernation.

### 🃏 Flashcards & Spaced Repetition
Create flashcards on any topic and review them using a built-in spaced repetition algorithm. Cards you get right appear less frequently; cards you miss come back sooner.

### ⏰ Study Scheduling & Reminders
Schedule study sessions and reminders using natural language. The agent uses Cloudflare's scheduling API to wake itself up at the right time — no cron jobs or external schedulers needed.

### 💬 Streaming AI Chat
Real-time streaming responses powered by **Llama 3.3 70B** via Workers AI. Messages are automatically persisted and streams resume on disconnect.

### 🔌 MCP Integration
Connect external tools and services via the Model Context Protocol (MCP). Add MCP servers directly from the UI.

### 🖼️ Image Understanding
Drag-and-drop or paste images into the chat. StudyBuddy can analyze diagrams, handwritten notes, and textbook images.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Cloudflare Edge                       │
│                                                          │
│  ┌─────────────┐    WebSocket     ┌──────────────────┐  │
│  │   React UI  │ ◄──────────────► │   ChatAgent      │  │
│  │  (Vite SPA) │                  │  (Durable Object) │  │
│  └─────────────┘                  │                    │  │
│                                   │  ┌──────────────┐ │  │
│                                   │  │  SQLite DB   │ │  │
│                                   │  │  - memories  │ │  │
│                                   │  │  - flashcards│ │  │
│                                   │  │  - sessions  │ │  │
│                                   │  └──────────────┘ │  │
│                                   │                    │  │
│                                   │  ┌──────────────┐ │  │
│                                   │  │  Workers AI  │ │  │
│                                   │  │  (Llama 3.3) │ │  │
│                                   │  └──────────────┘ │  │
│                                   │                    │  │
│                                   │  ┌──────────────┐ │  │
│                                   │  │  Scheduler   │ │  │
│                                   │  │  (Alarms)    │ │  │
│                                   │  └──────────────┘ │  │
│                                   └──────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Agent** | Cloudflare Durable Object | Stateful AI agent with SQL storage, WebSocket, scheduling |
| **LLM** | Workers AI (Llama 3.3 70B) | Natural language understanding and generation |
| **Frontend** | React + Vite + TailwindCSS | Premium chat UI with study dashboard sidebar |
| **State** | Durable Object SQLite | Persistent storage for memories, flashcards, sessions |
| **Scheduling** | Durable Object Alarms | Autonomous task execution and reminders |
| **Communication** | WebSocket | Real-time bidirectional streaming |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [npm](https://www.npmjs.com/) v9+
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)

### Local Development

```bash
# Clone the repository
git clone https://github.com/kunaljit3006/cf_ai_study_assistant.git
cd cf_ai_study_assistant

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`. No API keys required — it uses Workers AI by default.

### Deploy to Cloudflare

```bash
# Login to Cloudflare (if not already)
npx wrangler login

# Build and deploy
npm run deploy
```

---

## 🎯 Usage Examples

### Memory
```
"Remember my name is Alex and I'm studying Computer Science"
"What do you know about me?"
"Forget my major"
```

### Flashcards
```
"Create flashcards for the water cycle"
"Make 5 flashcards about photosynthesis"
"Quiz me on my Biology flashcards"
"How many flashcards do I have?"
```

### Scheduling
```
"Remind me in 30 minutes to review my flashcards"
"Schedule a study session for tomorrow at 3pm"
"What reminders do I have?"
```

### Learning
```
"Explain quantum entanglement in simple terms"
"Summarize Chapter 3 of my textbook" (with image attachment)
"What's the difference between mitosis and meiosis?"
```

---

## 🛠️ Tools Reference

| Tool | Type | Description |
|------|------|-------------|
| `remember` | Server | Store facts about the student in SQL |
| `recall` | Server | Search stored memories |
| `forget` | Server | Remove a specific memory |
| `createFlashcard` | Server | Create a Q&A flashcard |
| `reviewFlashcards` | Server | Get cards due for spaced repetition review |
| `markFlashcardReviewed` | Server | Update a card's review status |
| `createStudySession` | Server | Plan a study session |
| `getStudyStats` | Server | Get learning progress statistics |
| `scheduleTask` | Server | Schedule a reminder/task |
| `getScheduledTasks` | Server | List all scheduled reminders |
| `cancelScheduledTask` | Server | Cancel a scheduled reminder |
| `getUserTimezone` | Client | Get the user's browser timezone |

---

## 📁 Project Structure

```
cf_ai_study_assistant/
├── src/
│   ├── server.ts          # Agent logic: LLM, tools, memory, scheduling
│   ├── app.tsx             # React UI: chat, sidebar, flashcards
│   ├── client.tsx          # React entry point
│   └── styles.css          # TailwindCSS + custom animations
├── public/                 # Static assets
├── index.html              # HTML shell with SEO meta
├── wrangler.jsonc           # Cloudflare Workers config
├── vite.config.ts          # Vite build config
├── package.json            # Dependencies and scripts
├── PROMPTS.md              # AI prompts used during development
└── README.md               # This file
```

---

## 🔧 Configuration

### Swap LLM Provider

The agent uses Workers AI by default. To use a different provider, modify `src/server.ts`:

```typescript
// OpenAI
import { openai } from "@ai-sdk/openai";
const model = openai("gpt-4o");

// Anthropic
import { anthropic } from "@ai-sdk/anthropic";
const model = anthropic("claude-sonnet-4-20250514");
```

Add the corresponding API key as a secret:
```bash
npx wrangler secret put OPENAI_API_KEY
```

---

## 📄 License

MIT — see [LICENSE](./LICENSE) for details.

---

<p align="center">
  Built with ❤️ using <a href="https://developers.cloudflare.com/agents/">Cloudflare Agents SDK</a>
</p>
