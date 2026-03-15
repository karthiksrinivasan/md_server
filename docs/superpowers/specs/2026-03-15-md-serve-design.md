# md-serve Design Spec

A lightweight, CLI-invoked local server that renders markdown files from a directory tree in a browser with excellent reading UX. Designed for AI-driven workflows that generate large volumes of `.md` files.

## 1. Architecture

### Stack

- **Runtime**: Node.js / TypeScript
- **Framework**: Next.js (App Router, `output: "standalone"`)
- **Markdown**: react-markdown + remark/rehype plugin chain
- **Styling**: Tailwind CSS + `@tailwindcss/typography`
- **File watching**: chokidar
- **Search**: MiniSearch (in-memory full-text)
- **CLI**: commander

### High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│  CLI Entry Point (bin/md-serve.js)               │
│  Parses args: path, --port, --open, filters      │
└──────────────┬──────────────────────────────────┘
               │ spawns
┌──────────────▼──────────────────────────────────┐
│  Next.js Server (standalone mode)                │
│                                                  │
│  API Routes:                                     │
│    /api/tree     → file tree (md files only)     │
│    /api/file     → raw markdown + frontmatter    │
│    /api/search   → full-text search              │
│    /api/events   → SSE live-reload stream        │
│    /api/asset    → relative images/assets         │
│                                                  │
│  React Frontend (App Router):                    │
│    Layout: FileTree | Content | Outline          │
│    Markdown renderer (react-markdown)            │
│    Theme toggle (dark/light)                     │
│                                                  │
│  File Watcher (chokidar):                        │
│    Watches target dir for .md changes            │
│    Pushes events via SSE                         │
└──────────────────────────────────────────────────┘
```

### Project Structure

```
md-serve/
├── bin/
│   └── md-serve.js              # CLI entry (#!/usr/bin/env node)
├── src/
│   ├── cli/
│   │   └── index.ts             # Arg parsing (commander), server bootstrap
│   ├── server/
│   │   ├── watcher.ts           # Chokidar file watcher
│   │   ├── tree.ts              # Directory scanner (md files only)
│   │   ├── search.ts            # Full-text search index (MiniSearch)
│   │   └── assets.ts            # Relative asset resolution + security
│   ├── app/                     # Next.js App Router
│   │   ├── layout.tsx           # Root layout (theme provider, panels)
│   │   ├── page.tsx             # Landing/welcome page
│   │   ├── [[...path]]/
│   │   │   └── page.tsx         # Dynamic catch-all for file viewing
│   │   └── api/
│   │       ├── tree/route.ts
│   │       ├── file/route.ts
│   │       ├── search/route.ts
│   │       ├── events/route.ts
│   │       └── asset/route.ts
│   ├── components/
│   │   ├── file-tree.tsx        # Collapsible file tree sidebar
│   │   ├── markdown-renderer.tsx # Core renderer with all plugins
│   │   ├── outline-panel.tsx    # Heading-based TOC sidebar
│   │   ├── search-dialog.tsx    # Cmd+K search overlay
│   │   ├── theme-toggle.tsx     # Dark/light switch
│   │   ├── toast.tsx            # Live-reload notification
│   │   └── code-block.tsx       # Syntax-highlighted code + copy button
│   ├── hooks/
│   │   ├── use-file-tree.ts     # File tree data + expand/collapse state
│   │   ├── use-sse.ts           # SSE connection for live reload
│   │   └── use-outline.ts       # Extract headings → outline data
│   └── lib/
│       ├── markdown.ts          # remark/rehype plugin pipeline config
│       └── theme.ts             # Theme persistence (localStorage)
├── package.json
├── tsconfig.json
├── next.config.ts
└── tailwind.config.ts
```

### Key Dependencies

| Purpose | Package |
|---|---|
| Framework | `next`, `react`, `react-dom` |
| Markdown | `react-markdown`, `remark-gfm`, `remark-math`, `remark-frontmatter` |
| Heading anchors | `rehype-slug`, `rehype-autolink-headings` |
| Syntax highlighting | `rehype-pretty-code`, `shiki` |
| Math | `rehype-katex`, `katex` |
| Mermaid | `mermaid` (lazy-loaded from CDN) |
| Frontmatter parsing | `gray-matter` |
| Styling | `tailwindcss`, `@tailwindcss/typography` |
| File watching | `chokidar` |
| CLI | `commander` |
| Search | `minisearch` |
| Theme | `next-themes` |
| Glob matching | `picomatch` |
| MIME types | `mime-types` |

## 2. CLI Interface

```bash
md-serve <path> [options]

Options:
  -p, --port <number>       Port number (default: 3030)
  -o, --open                Open browser automatically
  --include <glob...>       Include files matching glob (repeatable)
  --exclude <glob...>       Exclude files matching glob (repeatable)
  --filter <regex>          Filter filenames by regex
  --no-watch                Disable file watching
  --host <string>           Bind address (default: localhost)
  -v, --version             Show version
  -h, --help                Show help
```

### Default Filters

- **Include**: all `*.md` files recursively
- **Exclude**: `node_modules/**`, `.git/**`, `.*/**` (hidden directories)

### Filter Resolution Order

Include globs (whitelist) → Exclude globs (blacklist) → Regex filter on filename. All flags accept multiple values.

### Examples

```bash
md-serve .
md-serve ./docs --port 8080 --open
md-serve ./project --exclude "drafts/**" --include "docs/**/*.md"
md-serve ./notes --filter "/meeting/i" --no-watch
```

## 3. UI Layout & Interaction

### Layout: Two-Panel with Collapsible File Tree and Outline

```
┌──────────────────────────────────────────────────────────┐
│  ┌─ Header ────────────────────────────────────────────┐ │
│  │ [≡] md-serve    /path/to/docs    [🔍 Cmd+K] [🌓]  │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─────────┬───────────────────────────────┬───────────┐ │
│  │ File    │  Content                      │ Outline   │ │
│  │ Tree    │                               │           │ │
│  │         │  # Heading 1                  │ • Heading1│ │
│  │ [filter]│                               │   • Sub1  │ │
│  │ 📁 docs │  Rendered markdown content    │   • Sub2  │ │
│  │  📄 foo │  with full styling...         │ • Heading2│ │
│  │  📄 bar │                               │   • Sub3  │ │
│  │ 📁 specs│                               │           │ │
│  │  📄 baz │                               │           │ │
│  └─────────┴───────────────────────────────┴───────────┘ │
└──────────────────────────────────────────────────────────┘
```

Both file tree and outline panel are collapsible, maximizing reading space.

### Header Bar

- **Hamburger [≡]**: toggles file tree sidebar
- **Title**: "md-serve" + root directory path
- **Search [Cmd+K]**: command-palette-style search dialog (full-text across all files, results show file + matching line preview)
- **Theme toggle [🌓]**: dark/light, persisted in localStorage

### File Tree (Left, Collapsible)

- Collapsed via hamburger or drag-to-resize
- **Filter input** at top: client-side filtering by filename as you type
- Nested folder structure, only showing `.md` files (respecting CLI include/exclude/filter)
- Folders auto-collapse if they contain no matching files
- Current file highlighted
- Click navigates SPA-style (no reload)
- Remembers expand/collapse state per session

### Content Area (Center)

- Rendered markdown with `@tailwindcss/typography` prose styling
- **Frontmatter** rendered as a subtle metadata card at the top (filename, tags, date if present in YAML)
- **Code blocks** with Shiki syntax highlighting + copy button + language label
- **Mermaid blocks** rendered as interactive diagrams (lazy-loaded)
- **Math** rendered via KaTeX (inline `$...$` and block `$$...$$`)
- **Images** resolved from relative paths, served via `/api/asset`
- **Internal links** (relative `.md` references) navigate SPA-style; external links open new tab
- **Tables** styled with horizontal scroll on overflow
- **Live-reload toast**: subtle bottom-right notification "File updated" with timestamp, auto-dismisses after 3s

### Outline Panel (Right, Collapsible)

- Extracted from rendered headings (h1-h6)
- Nested indentation reflecting heading hierarchy
- Click scrolls to section (smooth scroll + URL hash update)
- **Active heading highlighted** as you scroll (intersection observer)
- Collapsible via toggle button
- Hides automatically if document has no headings

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `Cmd+K` / `Ctrl+K` | Open search |
| `Cmd+B` / `Ctrl+B` | Toggle file tree |
| `Cmd+Shift+O` | Toggle outline |
| `Escape` | Close search / collapse panels |
| `↑ / ↓` in search | Navigate results |
| `Enter` in search | Open selected result |

### Responsive Behavior

- **< 768px**: File tree and outline hidden by default (overlay mode when toggled)
- **768-1200px**: File tree visible, outline collapsed
- **> 1200px**: All three panels visible

## 4. Markdown Rendering Pipeline

### Plugin Chain

```
Source .md file
  │
  ▼
remark-frontmatter     → extract YAML frontmatter, remove from AST
  │
  ▼
remark-gfm             → tables, task lists, strikethrough, autolinks, footnotes
  │
  ▼
remark-math            → detect $inline$ and $$block$$ math
  │
  ▼
remark-heading-id      → add custom IDs to headings (for outline anchors)
  │
  ▼
── AST transform ──    → extract headings array → feed to outline panel
  │
  ▼
rehype (markdown → HTML AST)
  │
  ▼
rehype-pretty-code     → Shiki syntax highlighting (VS Code themes)
  │                      line numbers, line highlighting, code titles
  ▼
rehype-katex           → render math nodes to KaTeX HTML
  │
  ▼
rehype-slug            → add id attributes to headings
  │
  ▼
rehype-autolink-headings → add anchor links to headings
  │
  ▼
react-markdown renders → React components
```

### Custom Component Overrides

| Element | Custom Behavior |
|---|---|
| `a` (links) | Internal `.md` links → SPA navigation via `router.push()`. External links → `target="_blank" rel="noopener"` |
| `img` | Rewrite relative `src` to `/api/asset?path=<resolved>`. Lazy loading. Click to zoom (lightbox). |
| `code` (block) | Language `mermaid` → render with Mermaid.js (lazy-loaded). Otherwise → Shiki-highlighted block + copy button + language label. |
| `code` (inline) | Styled inline code span |
| `table` | Wrapped in horizontal-scroll container for wide tables |
| `h1-h6` | Anchor link + `id` for outline scroll-to |
| `input[type=checkbox]` | Styled task list checkboxes (read-only) |

### Frontmatter Handling

Parsed with `gray-matter` on the server side. Returned as structured metadata alongside the raw markdown. Displayed as a subtle card above content:

```
┌─────────────────────────────────────────┐
│ title: Design Spec                      │
│ date: 2026-03-14  •  tags: spec, draft  │
└─────────────────────────────────────────┘
```

Only shown if frontmatter exists. Primary fields: `title`, `date`, `author`, `tags`, `description`. Additional fields collapsed under "more".

### Syntax Highlighting Themes

- **Light mode**: `github-light` (Shiki built-in)
- **Dark mode**: `github-dark` (Shiki built-in)
- Switches with app theme toggle via `rehype-pretty-code` dual-theme support

### Mermaid Rendering

- Detected by fenced code block with language `mermaid`
- `mermaid` loaded lazily from CDN (~2MB, not bundled)
- Rendered client-side into SVG
- Respects dark/light theme
- Error state: invalid syntax shows raw code block with error banner

### Large File Performance

- Markdown parsing on the server (API route), returns content for client rendering
- Images lazy-load (`loading="lazy"`)
- Mermaid lazy-loads
- Heading extraction works on large files (scans for `#` lines)

## 5. Server & File Watching

### API Routes

| Route | Method | Purpose | Response |
|---|---|---|---|
| `/api/tree` | GET | File tree of `.md` files | `{ tree: TreeNode[] }` — nested with `name`, `path`, `type`, `children` |
| `/api/file?path=<rel>` | GET | Raw markdown + frontmatter | `{ content: string, frontmatter: object, size: number }` |
| `/api/search?q=<query>` | GET | Full-text search | `{ results: { path, title, matches: { line, text, highlight }[] }[] }` |
| `/api/events` | GET | SSE live-reload stream | Events: `file:changed`, `file:added`, `file:removed`, `tree:updated` |
| `/api/asset?path=<rel>` | GET | Serve images/assets | Binary with correct content-type |

### File Watcher

- **chokidar** watches target directory for `.md` changes
- Respects same include/exclude/filter rules as tree scanner
- Events:
  - `file:changed` → client re-fetches file content, shows toast
  - `file:added` → client re-fetches tree, shows toast
  - `file:removed` → client re-fetches tree, redirects if viewing deleted file
  - `tree:updated` → sent alongside add/remove for tree refresh
- **Debounced** at 300ms to avoid flooding during rapid saves
- SSE auto-reconnects on disconnect (exponential backoff, max 5s)

### Search Index

- **MiniSearch** builds in-memory index on startup
- Indexes: file path, filename, frontmatter title, full text content
- Incremental rebuild on file add/change/remove
- Top 20 results ranked by relevance
- Each result includes 2-3 matching line snippets with highlighted query term
- Index build is async and non-blocking during startup

### Asset Serving

- `/api/asset?path=<relative>` resolves relative to the `.md` file's directory
- **Security**: path sanitized, must resolve within target root (no `../` traversal)
- Serves: png, jpg, gif, svg, webp, pdf
- `Content-Type` via `mime-types` package
- 304 caching via `ETag` / `If-None-Match`

### Server Bootstrap Sequence

1. Parse CLI args (commander)
2. Resolve and validate target directory
3. Apply include/exclude/filter → compute file list
4. Build search index (async, non-blocking)
5. Start chokidar watcher
6. Start Next.js server on configured port
7. Print `md-serve running at http://localhost:<port>`
8. Open browser (if `--open` flag)

## 6. Packaging & Distribution

### npm Package

```json
{
  "name": "md-serve",
  "bin": {
    "md-serve": "./bin/md-serve.js"
  },
  "files": [
    "bin/",
    "dist/",
    ".next/standalone/"
  ]
}
```

Next.js `output: "standalone"` produces a self-contained server bundle. Users get the pre-built artifact — no `next build` needed.

**Install paths:**
```bash
npx md-serve ./docs           # No install
npm install -g md-serve        # Global install
md-serve ./docs
```

### Homebrew

Published via a `homebrew-tap` repo:
```bash
brew tap <user>/tap
brew install md-serve
```

Formula wraps the npm package, depends on `node`.

### Install Size Target

- npm standalone bundle: < 30MB
- Mermaid loaded from CDN (not bundled)
- Shiki: bundle commonly-used grammars only (JS, TS, Python, Go, Rust, Java, C/C++, Shell, JSON, YAML, HTML, CSS, SQL, Markdown, Diff)

### CI Pipeline (GitHub Actions)

On tag push:
1. `tsc --noEmit` — type check
2. `eslint` — lint
3. `next build` — standalone bundle
4. Smoke test: start server with fixture dir, fetch `/api/tree`, verify response
5. `npm publish`
6. Update Homebrew formula SHA

### Versioning

- Semantic versioning
- `npm version patch|minor|major` → auto-tags
- Conventional commits recommended
