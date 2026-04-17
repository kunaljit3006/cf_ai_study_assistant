import { Suspense, useCallback, useState, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { MCPServersState } from "agents";
import type { ChatAgent } from "./server";
import {
  Badge,
  Button,
  Empty,
  InputArea,
  Surface,
  Switch,
  Text
} from "@cloudflare/kumo";
import { Toasty, useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import {
  PaperPlaneRightIcon,
  StopIcon,
  TrashIcon,
  GearIcon,
  ChatCircleDotsIcon,
  CircleIcon,
  MoonIcon,
  SunIcon,
  CheckCircleIcon,
  XCircleIcon,
  BrainIcon,
  CaretDownIcon,
  BugIcon,
  PlugsConnectedIcon,
  PlusIcon,
  SignInIcon,
  XIcon,
  WrenchIcon,
  PaperclipIcon,
  ImageIcon,
  BookOpenIcon,
  LightbulbIcon,
  ClockIcon,
  CardsIcon,
  NotePencilIcon,
  GraduationCapIcon,
  StackIcon,
  ArrowCounterClockwiseIcon
} from "@phosphor-icons/react";

// ── Attachment helpers ────────────────────────────────────────────────

interface Attachment {
  id: string;
  file: File;
  preview: string;
  mediaType: string;
}

function createAttachment(file: File): Attachment {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    preview: URL.createObjectURL(file),
    mediaType: file.type || "application/octet-stream"
  };
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Types ─────────────────────────────────────────────────────────────

interface Memory {
  key: string;
  value: string;
  category: string;
  created_at: string;
}

interface Flashcard {
  id: number;
  question: string;
  answer: string;
  subject: string;
  difficulty: number;
  times_reviewed: number;
  next_review: string;
}

interface StudySession {
  id: number;
  subject: string;
  duration_minutes: number;
  scheduled_at: string;
  status: string;
  notes: string | null;
}

// ── Small components ──────────────────────────────────────────────────

function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );

  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
    const mode = next ? "dark" : "light";
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    localStorage.setItem("theme", mode);
  }, [dark]);

  return (
    <Button
      variant="secondary"
      shape="square"
      icon={dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      onClick={toggle}
      aria-label="Toggle theme"
    />
  );
}

// ── Study Sidebar ─────────────────────────────────────────────────────

function StudySidebar({
  isOpen,
  onClose,
  agent
}: {
  isOpen: boolean;
  onClose: () => void;
  agent: any;
}) {
  const [activeTab, setActiveTab] = useState<
    "memory" | "flashcards" | "sessions"
  >("memory");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(false);
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());

  const loadData = useCallback(async () => {
    if (!agent?.stub) return;
    setLoading(true);
    try {
      const [mems, cards, sess] = await Promise.all([
        agent.stub.getMemories(),
        agent.stub.getFlashcards(),
        agent.stub.getStudySessions()
      ]);
      setMemories(mems || []);
      setFlashcards(cards || []);
      setSessions(sess || []);
    } catch (e) {
      console.error("Failed to load sidebar data:", e);
    } finally {
      setLoading(false);
    }
  }, [agent]);

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen, loadData]);

  const toggleFlip = (id: number) => {
    setFlippedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 z-40 flex flex-col bg-kumo-base border-l border-kumo-line shadow-2xl animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-kumo-line bg-gradient-to-r from-violet-600/10 to-indigo-600/10">
        <div className="flex items-center gap-2">
          <GraduationCapIcon size={20} className="text-violet-500" />
          <Text size="sm" bold>
            Study Dashboard
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            shape="square"
            size="sm"
            icon={<ArrowCounterClockwiseIcon size={14} />}
            onClick={loadData}
            aria-label="Refresh"
          />
          <Button
            variant="ghost"
            shape="square"
            size="sm"
            icon={<XIcon size={14} />}
            onClick={onClose}
            aria-label="Close sidebar"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-kumo-line">
        {(
          [
            {
              key: "memory",
              label: "Memory",
              icon: <BrainIcon size={14} />,
              count: memories.length
            },
            {
              key: "flashcards",
              label: "Cards",
              icon: <CardsIcon size={14} />,
              count: flashcards.length
            },
            {
              key: "sessions",
              label: "Sessions",
              icon: <ClockIcon size={14} />,
              count: sessions.length
            }
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all ${
              activeTab === tab.key
                ? "text-violet-500 border-b-2 border-violet-500 bg-violet-500/5"
                : "text-kumo-subtle hover:text-kumo-default hover:bg-kumo-control"
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-violet-500/15 text-violet-500 font-semibold">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeTab === "memory" ? (
          memories.length === 0 ? (
            <Empty
              icon={<BrainIcon size={28} />}
              title="No memories yet"
              contents={
                <Text size="xs" variant="secondary">
                  Ask StudyBuddy to remember things about you!
                </Text>
              }
            />
          ) : (
            memories.map((mem) => (
              <Surface
                key={mem.key}
                className="p-3 rounded-xl ring ring-kumo-line hover:ring-violet-500/30 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Text size="xs" bold>
                        {mem.key}
                      </Text>
                      <Badge variant="secondary">{mem.category}</Badge>
                    </div>
                    <Text size="xs" variant="secondary">
                      {mem.value}
                    </Text>
                  </div>
                </div>
              </Surface>
            ))
          )
        ) : activeTab === "flashcards" ? (
          flashcards.length === 0 ? (
            <Empty
              icon={<CardsIcon size={28} />}
              title="No flashcards yet"
              contents={
                <Text size="xs" variant="secondary">
                  Ask StudyBuddy to create flashcards from your study material!
                </Text>
              }
            />
          ) : (
            flashcards.map((card) => (
              <Surface
                key={card.id}
                className="rounded-xl ring ring-kumo-line overflow-hidden hover:ring-violet-500/30 transition-all cursor-pointer"
                onClick={() => toggleFlip(card.id)}
              >
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary">{card.subject}</Badge>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: card.difficulty }).map((_, i) => (
                        <span key={i} className="text-amber-400 text-xs">
                          ★
                        </span>
                      ))}
                    </div>
                  </div>
                  <Text size="xs" bold className="mb-1">
                    Q: {card.question}
                  </Text>
                  {flippedCards.has(card.id) && (
                    <div className="mt-2 pt-2 border-t border-kumo-line">
                      <Text size="xs" variant="secondary">
                        A: {card.answer}
                      </Text>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-kumo-line">
                    <Text size="xs" variant="secondary">
                      Reviewed {card.times_reviewed}x
                    </Text>
                    <Text size="xs" variant="secondary">
                      {flippedCards.has(card.id)
                        ? "Click to hide"
                        : "Click to reveal"}
                    </Text>
                  </div>
                </div>
              </Surface>
            ))
          )
        ) : sessions.length === 0 ? (
          <Empty
            icon={<ClockIcon size={28} />}
            title="No study sessions"
            contents={
              <Text size="xs" variant="secondary">
                Ask StudyBuddy to create a study plan for you!
              </Text>
            }
          />
        ) : (
          sessions.map((sess) => (
            <Surface
              key={sess.id}
              className="p-3 rounded-xl ring ring-kumo-line hover:ring-violet-500/30 transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <Text size="xs" bold>
                  {sess.subject}
                </Text>
                <Badge
                  variant={
                    sess.status === "completed" ? "primary" : "secondary"
                  }
                >
                  {sess.status}
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <Text size="xs" variant="secondary">
                  ⏱ {sess.duration_minutes}min
                </Text>
                <Text size="xs" variant="secondary">
                  📅 {new Date(sess.scheduled_at).toLocaleDateString()}
                </Text>
              </div>
              {sess.notes && (
                <Text size="xs" variant="secondary" className="mt-1 italic">
                  {sess.notes}
                </Text>
              )}
            </Surface>
          ))
        )}
      </div>
    </div>
  );
}

// ── Tool rendering ────────────────────────────────────────────────────

function ToolPartView({
  part,
  addToolApprovalResponse
}: {
  part: UIMessage["parts"][number];
  addToolApprovalResponse: (response: {
    id: string;
    approved: boolean;
  }) => void;
}) {
  if (!isToolUIPart(part)) return null;
  const toolName = getToolName(part);

  // Map tool names to study-specific icons
  const getToolIcon = (name: string) => {
    if (
      name.includes("remember") ||
      name.includes("recall") ||
      name.includes("forget")
    )
      return <BrainIcon size={14} className="text-violet-400" />;
    if (name.includes("flashcard") || name.includes("Flashcard"))
      return <CardsIcon size={14} className="text-amber-400" />;
    if (name.includes("study") || name.includes("Study"))
      return <BookOpenIcon size={14} className="text-emerald-400" />;
    if (name.includes("schedule") || name.includes("Schedule"))
      return <ClockIcon size={14} className="text-blue-400" />;
    return <GearIcon size={14} className="text-kumo-inactive" />;
  };

  // Completed
  if (part.state === "output-available") {
    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
          <div className="flex items-center gap-2 mb-1">
            {getToolIcon(toolName)}
            <Text size="xs" variant="secondary" bold>
              {toolName}
            </Text>
            <Badge variant="secondary">Done</Badge>
          </div>
          <div className="font-mono">
            <Text size="xs" variant="secondary">
              {JSON.stringify(part.output, null, 2)}
            </Text>
          </div>
        </Surface>
      </div>
    );
  }

  // Needs approval
  if ("approval" in part && part.state === "approval-requested") {
    const approvalId = (part.approval as { id?: string })?.id;
    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-3 rounded-xl ring-2 ring-kumo-warning">
          <div className="flex items-center gap-2 mb-2">
            {getToolIcon(toolName)}
            <Text size="sm" bold>
              Approval needed: {toolName}
            </Text>
          </div>
          <div className="font-mono mb-3">
            <Text size="xs" variant="secondary">
              {JSON.stringify(part.input, null, 2)}
            </Text>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<CheckCircleIcon size={14} />}
              onClick={() => {
                if (approvalId) {
                  addToolApprovalResponse({ id: approvalId, approved: true });
                }
              }}
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<XCircleIcon size={14} />}
              onClick={() => {
                if (approvalId) {
                  addToolApprovalResponse({ id: approvalId, approved: false });
                }
              }}
            >
              Reject
            </Button>
          </div>
        </Surface>
      </div>
    );
  }

  // Rejected / denied
  if (
    part.state === "output-denied" ||
    ("approval" in part &&
      (part.approval as { approved?: boolean })?.approved === false)
  ) {
    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
          <div className="flex items-center gap-2">
            <XCircleIcon size={14} className="text-kumo-danger" />
            <Text size="xs" variant="secondary" bold>
              {toolName}
            </Text>
            <Badge variant="secondary">Rejected</Badge>
          </div>
        </Surface>
      </div>
    );
  }

  // Executing
  if (part.state === "input-available" || part.state === "input-streaming") {
    return (
      <div className="flex justify-start">
        <Surface className="max-w-[85%] px-4 py-2.5 rounded-xl ring ring-kumo-line">
          <div className="flex items-center gap-2">
            <div className="animate-spin">{getToolIcon(toolName)}</div>
            <Text size="xs" variant="secondary">
              Running {toolName}...
            </Text>
          </div>
        </Surface>
      </div>
    );
  }

  return null;
}

// ── Main chat ─────────────────────────────────────────────────────────

function Chat() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toasts = useKumoToastManager();
  const [mcpState, setMcpState] = useState<MCPServersState>({
    prompts: [],
    resources: [],
    servers: {},
    tools: []
  });
  const [showMcpPanel, setShowMcpPanel] = useState(false);
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [isAddingServer, setIsAddingServer] = useState(false);
  const mcpPanelRef = useRef<HTMLDivElement>(null);

  const agent = useAgent<ChatAgent>({
    agent: "ChatAgent",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback(
      (error: Event) => console.error("WebSocket error:", error),
      []
    ),
    onMcpUpdate: useCallback((state: MCPServersState) => {
      setMcpState(state);
    }, []),
    onMessage: useCallback(
      (message: MessageEvent) => {
        try {
          const data = JSON.parse(String(message.data));
          if (data.type === "scheduled-task") {
            toasts.add({
              title: "📚 Study Reminder",
              description: data.description,
              timeout: 0
            });
          }
          // Refresh sidebar on state changes
          if (
            data.type === "memory-updated" ||
            data.type === "flashcard-updated" ||
            data.type === "session-updated"
          ) {
            // Sidebar will auto-refresh via its own useEffect
          }
        } catch {
          // Not JSON or not our event
        }
      },
      [toasts]
    )
  });

  // Close MCP panel when clicking outside
  useEffect(() => {
    if (!showMcpPanel) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        mcpPanelRef.current &&
        !mcpPanelRef.current.contains(e.target as Node)
      ) {
        setShowMcpPanel(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMcpPanel]);

  const handleAddServer = async () => {
    if (!mcpName.trim() || !mcpUrl.trim()) return;
    setIsAddingServer(true);
    try {
      await agent.stub.addServer(mcpName.trim(), mcpUrl.trim());
      setMcpName("");
      setMcpUrl("");
    } catch (e) {
      console.error("Failed to add MCP server:", e);
    } finally {
      setIsAddingServer(false);
    }
  };

  const handleRemoveServer = async (serverId: string) => {
    try {
      await agent.stub.removeServer(serverId);
    } catch (e) {
      console.error("Failed to remove MCP server:", e);
    }
  };

  const serverEntries = Object.entries(mcpState.servers);
  const mcpToolCount = mcpState.tools.length;

  const {
    messages,
    sendMessage,
    clearHistory,
    addToolApprovalResponse,
    stop,
    status
  } = useAgentChat({
    agent,
    onToolCall: async (event) => {
      if (
        "addToolOutput" in event &&
        event.toolCall.toolName === "getUserTimezone"
      ) {
        event.addToolOutput({
          toolCallId: event.toolCall.toolCallId,
          output: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            localTime: new Date().toLocaleTimeString()
          }
        });
      }
    }
  });

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Re-focus the input after streaming ends
  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setAttachments((prev) => [...prev, ...images.map(createAttachment)]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att) URL.revokeObjectURL(att.preview);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    },
    [addFiles]
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isStreaming) return;
    setInput("");

    const parts: Array<
      | { type: "text"; text: string }
      | { type: "file"; mediaType: string; url: string }
    > = [];
    if (text) parts.push({ type: "text", text });

    for (const att of attachments) {
      const dataUri = await fileToDataUri(att.file);
      parts.push({ type: "file", mediaType: att.mediaType, url: dataUri });
    }

    for (const att of attachments) URL.revokeObjectURL(att.preview);
    setAttachments([]);

    sendMessage({ role: "user", parts });
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, attachments, isStreaming, sendMessage]);

  return (
    <div
      className={`flex flex-col h-screen bg-kumo-elevated relative transition-all duration-300 ${showSidebar ? "mr-96" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-kumo-elevated/80 backdrop-blur-sm border-2 border-dashed border-violet-500 rounded-xl m-2 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-violet-500">
            <ImageIcon size={40} />
            <Text variant="heading3">Drop images here</Text>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="px-5 py-4 bg-kumo-base border-b border-kumo-line">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-kumo-default flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm">
                <GraduationCapIcon size={18} weight="bold" />
              </span>
              StudyBuddy
            </h1>
            <Badge variant="secondary">
              <LightbulbIcon size={12} weight="bold" className="mr-1" />
              AI Study Assistant
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <CircleIcon
                size={8}
                weight="fill"
                className={connected ? "text-kumo-success" : "text-kumo-danger"}
              />
              <Text size="xs" variant="secondary">
                {connected ? "Connected" : "Disconnected"}
              </Text>
            </div>
            <div className="flex items-center gap-1.5">
              <BugIcon size={14} className="text-kumo-inactive" />
              <Switch
                checked={showDebug}
                onCheckedChange={setShowDebug}
                size="sm"
                aria-label="Toggle debug mode"
              />
            </div>
            <ThemeToggle />
            <Button
              variant={showSidebar ? "primary" : "secondary"}
              icon={<BookOpenIcon size={16} />}
              onClick={() => setShowSidebar(!showSidebar)}
            >
              Study
            </Button>
            <div className="relative" ref={mcpPanelRef}>
              <Button
                variant="secondary"
                icon={<PlugsConnectedIcon size={16} />}
                onClick={() => setShowMcpPanel(!showMcpPanel)}
              >
                MCP
                {mcpToolCount > 0 && (
                  <Badge variant="primary" className="ml-1.5">
                    <WrenchIcon size={10} className="mr-0.5" />
                    {mcpToolCount}
                  </Badge>
                )}
              </Button>

              {/* MCP Dropdown Panel */}
              {showMcpPanel && (
                <div className="absolute right-0 top-full mt-2 w-96 z-50">
                  <Surface className="rounded-xl ring ring-kumo-line shadow-lg p-4 space-y-4">
                    {/* Panel Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PlugsConnectedIcon
                          size={16}
                          className="text-kumo-accent"
                        />
                        <Text size="sm" bold>
                          MCP Servers
                        </Text>
                        {serverEntries.length > 0 && (
                          <Badge variant="secondary">
                            {serverEntries.length}
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        shape="square"
                        aria-label="Close MCP panel"
                        icon={<XIcon size={14} />}
                        onClick={() => setShowMcpPanel(false)}
                      />
                    </div>

                    {/* Add Server Form */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAddServer();
                      }}
                      className="space-y-2"
                    >
                      <input
                        type="text"
                        value={mcpName}
                        onChange={(e) => setMcpName(e.target.value)}
                        placeholder="Server name"
                        className="w-full px-3 py-1.5 text-sm rounded-lg border border-kumo-line bg-kumo-base text-kumo-default placeholder:text-kumo-inactive focus:outline-none focus:ring-1 focus:ring-kumo-accent"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={mcpUrl}
                          onChange={(e) => setMcpUrl(e.target.value)}
                          placeholder="https://mcp.example.com"
                          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-kumo-line bg-kumo-base text-kumo-default placeholder:text-kumo-inactive focus:outline-none focus:ring-1 focus:ring-kumo-accent font-mono"
                        />
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          icon={<PlusIcon size={14} />}
                          disabled={
                            isAddingServer || !mcpName.trim() || !mcpUrl.trim()
                          }
                        >
                          {isAddingServer ? "..." : "Add"}
                        </Button>
                      </div>
                    </form>

                    {/* Server List */}
                    {serverEntries.length > 0 && (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {serverEntries.map(([id, server]) => (
                          <div
                            key={id}
                            className="flex items-start justify-between p-2.5 rounded-lg border border-kumo-line"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-kumo-default truncate">
                                  {server.name}
                                </span>
                                <Badge
                                  variant={
                                    server.state === "ready"
                                      ? "primary"
                                      : server.state === "failed"
                                        ? "destructive"
                                        : "secondary"
                                  }
                                >
                                  {server.state}
                                </Badge>
                              </div>
                              <span className="text-xs font-mono text-kumo-subtle truncate block mt-0.5">
                                {server.server_url}
                              </span>
                              {server.state === "failed" && server.error && (
                                <span className="text-xs text-red-500 block mt-0.5">
                                  {server.error}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              {server.state === "authenticating" &&
                                server.auth_url && (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    icon={<SignInIcon size={12} />}
                                    onClick={() =>
                                      window.open(
                                        server.auth_url as string,
                                        "oauth",
                                        "width=600,height=800"
                                      )
                                    }
                                  >
                                    Auth
                                  </Button>
                                )}
                              <Button
                                variant="ghost"
                                size="sm"
                                shape="square"
                                aria-label="Remove server"
                                icon={<TrashIcon size={12} />}
                                onClick={() => handleRemoveServer(id)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Tool Summary */}
                    {mcpToolCount > 0 && (
                      <div className="pt-2 border-t border-kumo-line">
                        <div className="flex items-center gap-2">
                          <WrenchIcon size={14} className="text-kumo-subtle" />
                          <span className="text-xs text-kumo-subtle">
                            {mcpToolCount} tool
                            {mcpToolCount !== 1 ? "s" : ""} available from MCP
                            servers
                          </span>
                        </div>
                      </div>
                    )}
                  </Surface>
                </div>
              )}
            </div>
            <Button
              variant="secondary"
              icon={<TrashIcon size={16} />}
              onClick={clearHistory}
            >
              Clear
            </Button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-6 shadow-lg shadow-violet-500/25">
                <GraduationCapIcon
                  size={40}
                  weight="bold"
                  className="text-white"
                />
              </div>
              <Text variant="heading3" className="mb-2">
                Welcome to StudyBuddy
              </Text>
              <Text variant="secondary" className="mb-8 text-center max-w-md">
                Your AI-powered study companion. I can create flashcards,
                remember your study preferences, schedule sessions, and help you
                learn any subject.
              </Text>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  {
                    icon: <BrainIcon size={14} />,
                    text: "Remember my name is..."
                  },
                  {
                    icon: <CardsIcon size={14} />,
                    text: "Create flashcards for photosynthesis"
                  },
                  {
                    icon: <BookOpenIcon size={14} />,
                    text: "Explain quantum entanglement simply"
                  },
                  {
                    icon: <ClockIcon size={14} />,
                    text: "Remind me in 30 min to review notes"
                  },
                  {
                    icon: <LightbulbIcon size={14} />,
                    text: "Quiz me on my flashcards"
                  },
                  {
                    icon: <NotePencilIcon size={14} />,
                    text: "Summarize the water cycle"
                  }
                ].map((prompt) => (
                  <Button
                    key={prompt.text}
                    variant="outline"
                    size="sm"
                    icon={prompt.icon}
                    disabled={isStreaming}
                    onClick={() => {
                      sendMessage({
                        role: "user",
                        parts: [{ type: "text", text: prompt.text }]
                      });
                    }}
                  >
                    {prompt.text}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message: UIMessage, index: number) => {
            const isUser = message.role === "user";
            const isLastAssistant =
              message.role === "assistant" && index === messages.length - 1;

            return (
              <div key={message.id} className="space-y-2">
                {showDebug && (
                  <pre className="text-[11px] text-kumo-subtle bg-kumo-control rounded-lg p-3 overflow-auto max-h-64">
                    {JSON.stringify(message, null, 2)}
                  </pre>
                )}

                {/* Tool parts */}
                {message.parts.filter(isToolUIPart).map((part) => (
                  <ToolPartView
                    key={part.toolCallId}
                    part={part}
                    addToolApprovalResponse={addToolApprovalResponse}
                  />
                ))}

                {/* Reasoning parts */}
                {message.parts
                  .filter(
                    (part) =>
                      part.type === "reasoning" &&
                      (part as { text?: string }).text?.trim()
                  )
                  .map((part, i) => {
                    const reasoning = part as {
                      type: "reasoning";
                      text: string;
                      state?: "streaming" | "done";
                    };
                    const isDone = reasoning.state === "done" || !isStreaming;
                    return (
                      <div key={i} className="flex justify-start">
                        <details className="max-w-[85%] w-full" open={!isDone}>
                          <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-sm select-none">
                            <BrainIcon size={14} className="text-violet-400" />
                            <span className="font-medium text-kumo-default">
                              Thinking
                            </span>
                            {isDone ? (
                              <span className="text-xs text-kumo-success">
                                Complete
                              </span>
                            ) : (
                              <span className="text-xs text-violet-400">
                                Thinking...
                              </span>
                            )}
                            <CaretDownIcon
                              size={14}
                              className="ml-auto text-kumo-inactive"
                            />
                          </summary>
                          <pre className="mt-2 px-3 py-2 rounded-lg bg-kumo-control text-xs text-kumo-default whitespace-pre-wrap overflow-auto max-h-64">
                            {reasoning.text}
                          </pre>
                        </details>
                      </div>
                    );
                  })}

                {/* Image parts */}
                {message.parts
                  .filter(
                    (part): part is Extract<typeof part, { type: "file" }> =>
                      part.type === "file" &&
                      (part as { mediaType?: string }).mediaType?.startsWith(
                        "image/"
                      ) === true
                  )
                  .map((part, i) => (
                    <div
                      key={`file-${i}`}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <img
                        src={part.url}
                        alt="Attachment"
                        className="max-h-64 rounded-xl border border-kumo-line object-contain"
                      />
                    </div>
                  ))}

                {/* Text parts */}
                {message.parts
                  .filter((part) => part.type === "text")
                  .map((part, i) => {
                    let text = (part as { type: "text"; text: string }).text;
                    if (!text) return null;

                    let hasLeakedTool = false;
                    let leakedName = "";
                    let leakedArgs: any = {};

                    // Intercept leaked JSON tool calls to convert them to actual text
                    try {
                      const trimmed = text.trim();
                      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                        const parsed = JSON.parse(trimmed);
                        if (parsed.type === "function" && parsed.name) {
                          hasLeakedTool = true;
                          leakedName = parsed.name;
                          leakedArgs = parsed.parameters || {};
                          if (parsed.name === "createFlashcard") {
                            text = `*(Auto-captured Flashcard)*\n\n**Q:** ${leakedArgs.question}\n\n**A:** ${leakedArgs.answer}`;
                          } else {
                            text = `*(Auto-captured ${parsed.name})*\n\n\`\`\`json\n${JSON.stringify(leakedArgs, null, 2)}\n\`\`\``;
                          }
                        }
                      }
                    } catch (e) {
                      // Normal text, do nothing
                    }

                    if (isUser) {
                      return (
                        <div key={i} className="flex justify-end">
                          <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-gradient-to-r from-violet-600 to-indigo-600 text-white leading-relaxed shadow-lg shadow-violet-500/10">
                            {text}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={i} className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-kumo-base text-kumo-default leading-relaxed group">
                          <Streamdown
                            className="sd-theme rounded-2xl rounded-bl-md p-3"
                            plugins={{ code }}
                            controls={false}
                            isAnimating={isLastAssistant && isStreaming}
                          >
                            {text}
                          </Streamdown>
                          
                          {/* Fallback execution button for leaked tools */}
                          {hasLeakedTool && !isStreaming && (
                            <div className="px-3 pb-3">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  icon={<BrainIcon size={14} className="text-violet-500" />}
                                  onClick={() => {
                                      agent.stub.runLeakedTool(leakedName, leakedArgs).then(() => {
                                         toasts.add({ title: "Success", description: "Tool successfully saved to database!", timeout: 3000 });
                                      });
                                  }}
                                >
                                  Execute Manually to Database
                                </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-kumo-line bg-kumo-base">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="max-w-3xl mx-auto px-5 py-4"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {attachments.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="relative group rounded-lg border border-kumo-line bg-kumo-control overflow-hidden"
                >
                  <img
                    src={att.preview}
                    alt={att.file.name}
                    className="h-16 w-16 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="absolute top-0.5 right-0.5 rounded-full bg-kumo-contrast/80 text-kumo-inverse p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove ${att.file.name}`}
                  >
                    <XIcon size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-3 rounded-xl border border-kumo-line bg-kumo-base p-3 shadow-sm focus-within:ring-2 focus-within:ring-violet-500/50 focus-within:border-transparent transition-shadow">
            <Button
              type="button"
              variant="ghost"
              shape="square"
              aria-label="Attach images"
              icon={<PaperclipIcon size={18} />}
              onClick={() => fileInputRef.current?.click()}
              disabled={!connected || isStreaming}
              className="mb-0.5"
            />
            <InputArea
              ref={textareaRef}
              value={input}
              onValueChange={setInput}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              onPaste={handlePaste}
              placeholder={
                attachments.length > 0
                  ? "Add a message or send images..."
                  : "Ask me anything about your studies..."
              }
              disabled={!connected || isStreaming}
              rows={1}
              className="flex-1 ring-0! focus:ring-0! shadow-none! bg-transparent! outline-none! resize-none max-h-40"
            />
            {isStreaming ? (
              <Button
                type="button"
                variant="secondary"
                shape="square"
                aria-label="Stop generation"
                icon={<StopIcon size={18} />}
                onClick={stop}
                className="mb-0.5"
              />
            ) : (
              <Button
                type="submit"
                variant="primary"
                shape="square"
                aria-label="Send message"
                disabled={
                  (!input.trim() && attachments.length === 0) || !connected
                }
                icon={<PaperPlaneRightIcon size={18} />}
                className="mb-0.5"
              />
            )}
          </div>
        </form>
      </div>

      {/* Study Sidebar */}
      <StudySidebar
        isOpen={showSidebar}
        onClose={() => setShowSidebar(false)}
        agent={agent}
      />
    </div>
  );
}

export default function App() {
  return (
    <Toasty>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen text-kumo-inactive">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center animate-pulse">
                <GraduationCapIcon
                  size={24}
                  weight="bold"
                  className="text-white"
                />
              </div>
              <Text variant="secondary">Loading StudyBuddy...</Text>
            </div>
          </div>
        }
      >
        <Chat />
      </Suspense>
    </Toasty>
  );
}
