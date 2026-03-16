# Agent Integration for md_server

**Date:** 2026-03-15
**Status:** Approved

## Overview

Add coding agent integration to md_server — a read-only markdown file viewer — enabling AI-powered summarization, editing, and session history tracking. The system detects installed coding agents (Claude Code, Codex, Aider, OpenCode), invokes them via CLI for document operations, and indexes session history to show which agent sessions created or modified each file.

## Architecture: Layered Modules within Next.js

All new functionality lives as modular services under `src/server/`, following the existing pattern of `tree.ts`, `search.ts`, `watcher.ts`. No separate processes or sidecars.

### New Modules

| Module | File | Purpose |
|--------|------|---------|
| Agent Registry | `src/server/agent-registry.ts` | Agent detection, config, CLI templates |
| Agent Executor | `src/server/agent-executor.ts` | Spawns agent CLI processes for operations |
| Session Indexer | `src/server/session-indexer.ts` | Parses provider sessions, builds file→session index |
| Session Index Singleton | `src/server/session-indexer-singleton.ts` | Global singleton for index state |

### New API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/agents` | GET | List detected/available agents |
| `/api/agent/summarize` | POST | Invoke agent to summarize a file |
| `/api/agent/edit` | POST | Invoke agent to edit a file (full or selection) |
| `/api/sessions` | GET | Get sessions that touched a specific file |

---

## Module 1: Agent Registry

**File:** `src/server/agent-registry.ts`

### Agent Config Schema

```ts
interface AgentConfig {
  id: string;                // "claude", "codex", "aider", "opencode"
  name: string;              // "Claude Code"
  binary: string;            // "claude"
  detectArgs: string[];      // ["--version"]
  summarizeArgs: string[];   // ["--print", "Summarize this markdown file: {file}"]
  editArgs: string[];        // ["--print", "In file {file}, find the section containing: {selection}. Apply this edit: {prompt}"]
  resumeArgs: string[];      // ["--resume", "{sessionId}"]
  sessionPaths: string[];    // e.g. ["~/.claude/projects/"]
  stdinContent?: string;     // optional: pipe file content via stdin instead of {file} placeholder
}
```

Templates use `{file}`, `{prompt}`, `{selection}`, `{sessionId}` placeholders which are string-replaced in args array elements before passing to `child_process.spawn(binary, args)`. This avoids shell interpretation entirely — no shell escaping needed since `spawn` bypasses the shell.

### Built-in Agent Configs

Ships with configs for:
- **Claude Code** — `claude` binary, `--print` mode for non-interactive use, `--resume` for session resume, sessions in `~/.claude/projects/`
- **Codex CLI** — `codex` binary, sessions in `~/.codex/sessions/` and `~/.codex/archived_sessions/`
- **Aider** — `aider` binary, session history in `.aider.chat.history.md` and `~/.aider.history/`
- **OpenCode** — `opencode` binary, sessions in `~/.local/share/opencode/`

### Custom Agent Support

Users can add or override agents via `.md_server/agents.json`:
```json
[
  {
    "id": "my-agent",
    "name": "My Custom Agent",
    "binary": "my-agent",
    "detectArgs": ["--version"],
    "summarizeArgs": ["summarize", "{file}"],
    "editArgs": ["edit", "{file}", "--prompt", "{prompt}"],
    "resumeArgs": ["resume", "{sessionId}"],
    "sessionPaths": []
  }
]
```

### Detection

At server startup, runs `which <binary>` for each known + custom agent. Caches results. Returns only available agents via `GET /api/agents`.

---

## Module 2: Agent Executor

**File:** `src/server/agent-executor.ts`

### Operations

**Summarize** (`POST /api/agent/summarize`)
- Input: `{ agentId: string, filePath: string }`
- Reads agent config, interpolates placeholders in `summarizeArgs` array
- Spawns CLI via `child_process.spawn(binary, interpolatedArgs)`, captures stdout
- Returns: `{ summary: string }` or `{ error: string }`

**Edit** (`POST /api/agent/edit`)
- Input: `{ agentId: string, filePath: string, prompt: string, selection?: string }`
- If `selection` provided: interpolates `editArgs` with `{selection}` containing the selected text and `{prompt}` containing the user's instruction
- If no `selection`: interpolates `editArgs` with `{selection}` as empty string
- Spawns CLI via `child_process.spawn(binary, interpolatedArgs)`, agent modifies file on disk
- File change detected by chokidar → SSE pushes `file:changed` → UI re-renders automatically
- Returns: `{ success: boolean, error?: string }`

### Execution Details

- Non-blocking: uses `spawn` with promise wrapper, no shell (`shell: false` default)
- Configurable timeout per agent (default: 120s), kills process on timeout
- Captures stderr for error reporting
- Placeholder interpolation is simple string replacement within args array elements — no shell escaping needed since `spawn` bypasses the shell
- Working directory set to the markdown root

---

## Module 3: Session Indexer

**File:** `src/server/session-indexer.ts`

### Index Structure

Stored at `.md_server/session-index.json`:

```ts
interface SessionIndex {
  version: number;
  lastUpdated: string;           // ISO 8601
  providerState: Record<string, ProviderScanState>;
  files: Record<string, FileSessionEntry>;  // keyed by absolute file path
}

interface ProviderScanState {
  sessionFiles: Record<string, {
    mtime: number;
    size: number;
    md5: string;
  }>;
}

interface FileSessionEntry {
  sessions: SessionRef[];
}

interface SessionRef {
  provider: string;          // "claude", "codex", "aider", "opencode"
  sessionId: string;
  sessionFile: string;       // path to the JSONL/session file
  timestamp: string;         // when the file was touched
  summary?: string;          // first user message or session summary
  action: "created" | "modified" | "read";
  resumeCommand: string;     // pre-built resume command string
}
```

### Provider-Specific Parsers

Each provider has a parser function that extracts file references from session data. All parsers implement a common interface:

```ts
interface SessionParser {
  parseSessionFile(filePath: string, mdRoot: string): SessionRef[];
}
```

**Claude Code** (`src/server/session-parsers/claude.ts`):
- Location: `~/.claude/projects/<encoded-project-path>/<timestamp>.jsonl`
- Format: JSONL — one JSON object per line, each with `type`, `message`, optional `tool_use`
- Extraction: scan for lines where `message.content` array contains items with `type: "tool_use"` and `name` in `["Write", "Edit", "Read"]`. The `input.file_path` field contains the absolute file path. Match against MD files in the served directory.
- Session ID: the `sessionId` field from the first message line
- Summary: the `message.content` text from the first `type: "user"` line, or the first `type: "summary"` line if present

**Codex CLI** (`src/server/session-parsers/codex.ts`):
- Location: `~/.codex/sessions/` and `~/.codex/archived_sessions/`, files named `rollout-*.jsonl`
- Format: JSONL — each line has `type`, `role`, optional tool use data
- Extraction: scan for lines with file-modifying tool calls. The `cwd` field in session metadata gives the project directory. File paths in tool calls may be relative to `cwd`.
- Session ID: derived from the filename (`rollout-<id>.jsonl`)

**Aider** (`src/server/session-parsers/aider.ts`):
- Location: `.aider.chat.history.md` in project roots, and `~/.aider.history/`
- Format: Markdown chat logs with `#### <timestamp>` delimiters between sessions
- Extraction: parse for file paths mentioned in `/add`, `/edit`, and code fence headers. Aider explicitly lists files it modifies in its output.
- Session ID: derived from the timestamp delimiter

**OpenCode** (`src/server/session-parsers/opencode.ts`):
- Location: `~/.local/share/opencode/sessions/`
- Format: JSON files with session metadata and message arrays
- Extraction: scan message arrays for tool use entries with file path references
- Session ID: from the session file's metadata

**Note:** Parsers for Codex, Aider, and OpenCode are best-effort based on known formats. Each parser gracefully handles format variations — if a session file can't be parsed, it's skipped with a warning log, not a crash.

### Indexing Flow

**Startup:**
1. Load `.md_server/session-index.json` if exists
2. For each available agent's `sessionPaths`, scan for session files
3. Compare session file mtime/size against cached `providerState`
4. Only re-parse changed/new session files (incremental update)
5. Extract file references, match against MD files in served directory
6. Write updated index to `.md_server/session-index.json`

**Incremental updates:**
- Track session file mtime and size in `providerState`
- On subsequent startups, skip unchanged files
- MD5 checksum of parsed data ensures integrity

**Live updates after agent invocations:**
- After the Agent Executor completes an edit or summarize operation, it notifies the Session Indexer to re-scan the relevant provider's session directory
- The re-scan is debounced (5s delay) to allow the agent CLI to finalize its session file
- Only the provider that was just invoked is re-scanned, not all providers
- Updated index is written to disk and the in-memory cache is refreshed
- This ensures the sessions panel reflects the latest agent interaction without a server restart

### API

`GET /api/sessions?file=<relative-path>` → returns `SessionRef[]` sorted by timestamp descending.

---

## Module 4: Frontend Components

### New Components

| Component | File | Purpose |
|-----------|------|---------|
| Agent Toolbar | `src/components/agent-toolbar.tsx` | Toolbar above content with Summarize, Edit, Sessions buttons |
| Agent Picker | `src/components/agent-picker.tsx` | Dropdown to select which agent to use |
| Agent Badges | `src/components/agent-badges.tsx` | Header badges showing detected agents |
| Selection Edit Bar | `src/components/selection-edit-bar.tsx` | Floating prompt bar on text selection |
| Sessions Panel | `src/components/sessions-panel.tsx` | Right sidebar panel showing sessions for current file |
| Summary Modal | `src/components/summary-modal.tsx` | Modal displaying AI-generated summary |

### Layout Integration

- **Header bar**: Agent badges added next to existing search/theme buttons
- **Agent toolbar**: Inserted between header and markdown content area
- **Selection edit bar**: Floating element positioned near text selection
- **Sessions panel**: Added below the outline panel in right sidebar

### State Management

New context or additions to `LayoutContext`:
- `availableAgents: AgentConfig[]` — detected agents, fetched once at startup
- `selectedAgent: string` — currently selected agent ID, defaults to the first detected agent
- `isAgentWorking: boolean` — loading state during agent invocation
- `fileSessions: SessionRef[]` — sessions for the currently viewed file

### Text Selection Flow

1. User selects text in the rendered markdown
2. `mouseup`/`selectionchange` event handler captures the selected **rendered text** (plain text from the DOM, without HTML tags)
3. If selection is non-empty, position the floating edit bar near the selection
4. User types instruction, optionally picks agent from dropdown
5. On submit: `POST /api/agent/edit` with `selection` parameter containing the rendered text
6. The agent receives the file path and the selected rendered text as context in its prompt. The prompt instructs the agent: "In the file {file}, find the section that contains the following text: {selection}. Apply this edit: {prompt}". The agent is responsible for locating the corresponding source markdown and making the edit. This works because coding agents already understand markdown and can match rendered text to source.
7. Show loading indicator, bar stays visible
8. On completion: file watcher handles the UI refresh, dismiss the bar

### Session Resume Flow

1. Sessions panel shows `SessionRef[]` for current file
2. Each entry shows: provider badge, timestamp, summary, action type
3. "Resume cmd" button copies the pre-built `resumeCommand` to clipboard
4. Toast notification confirms copy

---

## Data Flow

### Startup Sequence

```
Server starts
├─ Agent Registry: detect installed agents (which <binary>)
├─ Session Indexer: load/rebuild .md_server/session-index.json
├─ Tree Scanner: scan markdown files (existing)
├─ Search Indexer: build search index (existing)
└─ File Watcher: start chokidar (existing)
```

### Edit Operation Flow

```
User selects text → types prompt → picks agent → submits
  ↓
POST /api/agent/edit { agentId, filePath, prompt, selection }
  ↓
Agent Executor: interpolate template → spawn CLI process
  ↓
Agent CLI modifies file on disk
  ↓
Chokidar detects file change → SSE pushes file:changed
  ↓
Frontend receives SSE → re-fetches file → re-renders markdown
```

### Session Lookup Flow

```
User navigates to a markdown file
  ↓
Frontend calls GET /api/sessions?file=README.md
  ↓
Session Indexer looks up file in cached index
  ↓
Returns SessionRef[] with provider, timestamp, summary, resumeCommand
  ↓
Sessions panel renders entries with copy-to-clipboard resume buttons
```

---

## File System Layout

```
.md_server/                        # Created in served directory root
├── session-index.json             # Cached session→file index
└── agents.json                    # Optional custom agent configs

src/server/
├── agent-registry.ts              # Agent detection & config
├── agent-executor.ts              # CLI invocation
├── session-indexer.ts             # Session parsing & indexing
├── session-indexer-singleton.ts   # Global singleton
└── session-parsers/               # Provider-specific session parsers
    ├── claude.ts
    ├── codex.ts
    ├── aider.ts
    └── opencode.ts

src/app/api/
├── agents/route.ts                # GET /api/agents
├── agent/
│   ├── summarize/route.ts         # POST /api/agent/summarize
│   └── edit/route.ts              # POST /api/agent/edit
└── sessions/route.ts              # GET /api/sessions

src/components/
├── agent-toolbar.tsx
├── agent-picker.tsx
├── agent-badges.tsx
├── selection-edit-bar.tsx
├── sessions-panel.tsx
└── summary-modal.tsx
```

---

## Security Considerations

- **Shell injection prevention**: Agent CLI commands use `child_process.spawn(binary, argsArray)` with `shell: false`. User input (prompts, selections) is interpolated into args array elements, never concatenated into a shell command string.
- **Path traversal prevention**: File paths passed to agents must be validated to stay within the served directory root. Reject paths containing `..` or absolute paths outside the root.
- **Localhost-only by default**: md_server binds to `localhost` by default (existing behavior via `MD_SERVE_HOST`). Agent mutation endpoints (`/api/agent/edit`, `/api/agent/summarize`) are only available when the server is bound to localhost. If the user binds to `0.0.0.0` or another non-loopback address, agent endpoints return 403 unless explicitly enabled via `MD_SERVE_ALLOW_REMOTE_AGENTS=true` environment variable. This prevents unintended remote access to agent invocation.
- **File tree exclusion**: The `.md_server/` directory is added to default excludes so it doesn't appear in the file tree or search results. The existing watcher's dot-prefix ignore pattern already covers this.

## Testing Strategy

- Unit tests for agent registry detection logic
- Unit tests for template interpolation and shell safety
- Unit tests for session index parsing (mock JSONL fixtures per provider)
- Integration tests for API endpoints with mock agent binaries
- Frontend component tests for selection handling and sessions panel
