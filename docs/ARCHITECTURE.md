# Architecture

This document describes the architecture of the Office Template Library: a template gallery for **DOCX documents** (Product 1) and **PPTX presentations** (Product 2), built as one shared platform.

## 1. Goals and guiding decisions

| Goal | Decision |
| --- | --- |
| Two products, one codebase | A single platform. Templates and documents carry a `type` (`docx` or `pptx`); the gallery UI and the API are shared. |
| Template files are never modified | **Copy-on-use**: using a template copies its file to a new, uniquely named document. The document service only receives a read-only view of the template store. |
| Add templates without UI changes | **Manifest-driven catalog**: a template is a folder with `manifest.json`, a file and preview images. The API imports it on start (and `pnpm seed` does it by hand). Admin uploads go through the same importer. |
| Extend to other Office types later | A **`DocTypeHandler`** registry. Supporting XLSX means adding one handler. |
| Less JavaScript for the user | TanStack Start with SSR, route-level code splitting, a lazily loaded editor chunk, and deferred hydration (`<Hydrate when={never()}>`) for purely static markup. |
| Runs on a reviewer's machine | No external services. SQLite and local file storage. LibreOffice is optional. |

## 2. System overview

```
Browser ──► web  (TanStack Start, Node, SSR)  :3000
              ├── pages / SSR loaders ──► API (server-to-server, visitor cookie forwarded)
              └── /api/*  (server route src/routes/api.$.ts) ──► API
                                   API  (Hono, Node)  :3001 ──► SQLite · storage/
```

- **One origin.** The browser only talks to the web app. The server route `routes/api.$.ts` forwards `/api/*` to `API_INTERNAL_URL` and streams uploads and downloads. The anonymous session cookie is `httpOnly`, `SameSite=Lax`, and needs no CORS configuration. In development a Vite proxy does the same job (see the note in `vite.config.ts`).
- **The server owns all data**: database, template files, document files, preview generation.
- **The client owns presentation only**: it has no database or file-processing code.

## 3. Repository layout

```
office-template/
├─ client/apps/web/        TanStack Start application (UI + SSR)
│  ├─ src/
│  │  ├─ routes/           file-based routes (+ api.$.ts gateway)
│  │  ├─ features/         templates · documents · admin
│  │  ├─ components/       layout, states (loading, error, empty, 404), UI primitives
│  │  └─ lib/              api client, formatting
│  ├─ e2e/                 Playwright tests
│  └─ scripts/             analyze-bundle.mjs
├─ server/                 Hono API
│  ├─ src/
│  │  ├─ server.ts · app.ts · app-type.ts
│  │  ├─ modules/          health · templates · documents · admin
│  │  ├─ doctypes/         DocTypeHandler + docx + pptx + registry
│  │  ├─ infra/            db · storage · preview
│  │  ├─ contracts/        zod schemas shared with the client
│  │  └─ shared/           config, errors, middlewares, utils
│  ├─ templates/           source catalog: <type>/<slug>/{manifest.json, file, previews}
│  ├─ scripts/             generate-templates · seed
│  ├─ drizzle/             SQL migrations
│  └─ tests/               Vitest
├─ docs/                   this documentation
├─ docker-compose.yml
└─ pnpm-workspace.yaml
```

### Boundary rules

- The client may import only `@office-template/server/contracts` (zod schemas and inferred types, no server dependencies) and `@office-template/server/app-type` (type-only, used by the typed Hono client). The package `exports` map exposes nothing else.
- The server never imports from the client.
- Two storage areas exist under `STORAGE_DIR`: `templates/` (written only by the template importer) and `documents/` (written only by the document service).

## 4. Backend

The server follows the feature-based conventions of [ServerCN](https://servercn.vercel.app/), ported to Hono:

| Convention | Implementation |
| --- | --- |
| `ApiError` with static factories | `shared/errors/api-error.ts`, handled once in `app.onError` |
| Uniform envelope | Success: `{ success: true, data }`. Error: `{ success: false, message, statusCode, errors? }` |
| Env validation with zod | `shared/configs/env.ts` fails fast on invalid configuration |
| Pino logging with redaction | `shared/utils/logger.ts` redacts `authorization` and `cookie` |
| Request validation | zod schemas on **body, query and params** through `@hono/zod-openapi` |
| Health check, graceful shutdown, Swagger | `/api/health`, `shared/utils/shutdown.ts`, `/api/docs` |

Controllers are merged into route files. Hono infers request and response types from the route definition, and the typed client (`hc<AppType>`) depends on that inference. Route handlers stay thin and call a service; services use repositories.

### 4.1 Modules

| Module | Responsibility |
| --- | --- |
| `templates` | Query the catalog, return template detail, stream template images (thumbnail and preview pages). Contains the manifest loader and the **template importer**. |
| `documents` | Create a document from a template (copy-on-use), list the session's documents, read and write editor content, download. |
| `admin` | Upload a new template (validated file, generated preview), protected by `x-admin-token`. |
| `health` | Liveness check. |

### 4.2 DocType handlers

Every supported document type implements one interface:

```ts
interface DocTypeHandler {
  type: 'docx' | 'pptx';
  mimeType: string;
  extension: string;
  editor: 'richtext' | 'slides';
  validate(file: Buffer): Promise<void>;                       // magic bytes + package structure
  // Rich-text types (DOCX)
  toEditorContent?(file: Buffer): Promise<{ html: string; defaults?: … }>;  // DOCX → HTML (mammoth + styles.xml)
  fromEditorContent?(c: { html: string }): Promise<Buffer>;                  // HTML → DOCX
  // Slide types (PPTX)
  readSlides?(file: Buffer): Promise<Deck>;                    // slide XML → render-ready model
  applySlideEdits?(file: Buffer, edits: SlideEdits): Promise<Buffer>;
  duplicateSlide?(file: Buffer, index: number): Promise<Buffer>;
  deleteSlide?(file: Buffer, index: number): Promise<Buffer>;
}
```

Services never branch on the type; they ask the registry. `detectDocType` identifies uploads from their bytes, never from the client-supplied file name. Adding XLSX means adding `doctypes/xlsx/` and registering it.

### 4.3 Storage

`FileStore` is an interface (`read`, `openStream`, `stat`, `exists`, `write`, `remove`, `asReadOnly`). The shipped implementation is `LocalFileStore`. Every key is resolved against the store root to rule out path traversal, and writes go to a temporary file first so a failed write never leaves a truncated document. Replacing the implementation with S3 touches one file.

`DocumentsService` is constructed with `templateStore.asReadOnly()`, a view with no write or remove methods, so there is no code path from a document operation to a template file. Only `TemplateImporter` holds the writable template store.

### 4.3.1 Worker thread for document conversions

DOCX and PPTX operations are CPU-bound (unzip, XML parsing, HTML conversion, sanitizing) and run on a single thread. Measured on the API: saving a DOCX blocked the event loop for 44 ms at 150 paragraphs and 137 ms at 600, growing linearly, so one large save would stall every other request.

`infra/workers/DocumentPool` runs them in `worker_threads` (`DOC_WORKERS`, default 1; `0` runs inline, which is what the unit tests use by default). `doctypes/pooled.ts` returns a view of the handlers whose heavy methods (`validate`, `toEditorContent`, `fromEditorContent`, `readSlides`, `applySlideEdits`, `duplicateSlide`, `deleteSlide`) are proxied to the pool, and `DocumentsService` receives that view through its constructor. Properties of the pool:

- Requests go to the least busy worker; `ApiError` status codes survive the thread boundary; Buffers are restored on both sides and results are transferred without copying.
- A worker that crashes is replaced and only its in-flight requests fail (500).
- After the change the worst `/api/health` latency during a save is 1–2 ms (was 44 and 137 ms). The save itself takes about 70–90 ms longer because the document is copied across threads, which is the price of keeping the API responsive.

A worker for the browser was considered and **not** added: measured in real Chrome with a 4x CPU slowdown, a 9,000-word document and a 60-slide deck, typing, scrolling and slide switching produced no long task and 60 FPS, so there was no main-thread cost to move (see 7.6).

### 4.4 Preview generation

- **Seed templates** ship with pre-rendered thumbnail and slide/page images created by `pnpm generate:templates` from the same specification that produces the template files (SVG rendered to PNG). They are committed, so a reviewer needs no extra tooling.
- **Admin uploads** are rendered by LibreOffice when available (`soffice` → PDF, then `pdftoppm` → PNG). If it is not installed, or conversion fails, a neutral placeholder preview is generated and a warning is logged. The Docker image installs LibreOffice and poppler.

## 5. Data model

**Template**

| Field | Notes |
| --- | --- |
| `id` | slug, primary key |
| `type` | `docx` or `pptx` |
| `name`, `category`, `description` | display metadata |
| `version` | integer, increased only when the file's SHA-256 changes |
| `hidden` | boolean. Hidden templates are reachable by id (and usable) but not listed or searched; used by the blank starters |
| `filePath` | key in the managed template store |
| `thumbnailPath`, `previewPages` | keys of the preview images |
| `checksum` | SHA-256 of the template file |
| `createdAt`, `updatedAt` | ISO timestamps |

**Document**

| Field | Notes |
| --- | --- |
| `id` | UUID, primary key |
| `templateId`, `templateVersion` | provenance of the copy |
| `type`, `title` | |
| `ownerSessionId` | anonymous session that owns the document |
| `filePath` | key in the managed document store |
| `sizeBytes` | |
| `createdAt`, `updatedAt` | ISO timestamps |

The API never returns storage keys; it returns URLs (`thumbnailUrl`, `previewUrls`, `downloadUrl`).

There is no account system. A random UUID in an `httpOnly` cookie scopes "My files". A document belonging to another session is indistinguishable from a missing one (404). Authentication is a documented extension point.

## 6. Key flows

### 6.1 Adding a template (no UI change)

1. Add `server/templates/<type>/<slug>/` with `manifest.json`, the file, a thumbnail and preview images (or upload through `POST /api/admin/templates`).
2. Start (or restart) the API, or run `pnpm seed`. On start the API compares the catalog with the database: an empty database gets everything imported, a seeded one only picks up what is new or changed, and when nothing changed it just starts (`AUTO_SEED=false` disables this).
3. The manifest is validated with zod (and must match its folder), the file is checked by its `DocTypeHandler`, the checksum is computed, files are copied into the managed template store, and the row is upserted. Unchanged templates are skipped; the version increases only when the file changes.

### 6.1.1 Blank files

"Blank document" and "Blank presentation" are ordinary templates with `hidden: true` (ids `blank-document` and `blank-presentation`, category "Blank"), generated by `pnpm generate:templates` and seeded like the rest. The gallery's "Start from scratch" tiles call `POST /api/templates/{id}/use` for them, so blank files get exactly the same copy-on-use, ownership and editing behaviour as any other document; no special API or code path exists. The blank deck's two boxes are empty text boxes: the PPTX reader treats an empty, unfilled, unoutlined shape as an editable text box, and the writer gives newly typed text the formatting recorded in the paragraph's `a:endParaRPr` (which is what PowerPoint does), so typed text has the intended size in the saved file.

### 6.2 Using a template (copy-on-use)

```
POST /api/templates/:id/use
  → load the template row (404 if missing)
  → copyBetween(read-only template store → documents/<uuid>.<ext>)
  → insert Document { templateId, templateVersion, ownerSessionId }
  → return { id }
The client navigates to /documents/:id
```

Everything after this point touches only the copy. Tests hash every file in the template store before and after using and editing a document and require the snapshots to be identical.

### 6.3 Editing a DOCX

1. `GET /documents/:id/content`: the server converts the DOCX to sanitized HTML with `mammoth`, bakes the template's heading colours and sizes (read from `styles.xml`) into inline styles, and returns the body font as `defaults`.
2. The client edits the HTML in the TipTap-based Word-style editor.
3. `PUT /documents/:id/content`: the server sanitizes the HTML (allow-list, including a short list of inline CSS properties), converts it to DOCX with `html-to-docx`, validates the result, and overwrites **the copy**. It also stores the sanitized HTML next to the document (`<id>.editor.json`).
4. Reopening returns that stored HTML, so formatting that the DOCX writer cannot round-trip is never lost in the editor. The DOCX itself carries fonts, sizes, colours, alignment, lists and tables as real Word properties (checked by tests that read `word/document.xml`).
5. `GET /documents/:id/download` streams the DOCX.

Round-trip scope is documented in [LIMITATIONS.md](./LIMITATIONS.md).

### 6.4 Editing a PPTX

PPTX is edited on its own XML, not rebuilt from another format.

1. `GET /documents/:id/slides`: `pptx-reader` parses the package (`@xmldom/xmldom` + JSZip) into a render-ready model: shapes with pixel positions (resolved from the slide layout and master for placeholders), fills, text paragraphs and runs with formatting, inlined pictures, and labelled placeholders for tables, charts and groups.
2. The client draws the slide at its real size and scales it. Text boxes are `contentEditable`; the DOM is parsed back into paragraphs and runs on input.
3. `PUT /documents/:id/slides` sends only the shapes that changed. `pptx-writer` rewrites the paragraphs of those shapes and nothing else, so layouts, themes, images and other slides are preserved byte for byte.
4. `POST …/slides/:index/duplicate` and `DELETE …/slides/:index` edit `presentation.xml`, its relationships and `[Content_Types].xml`.
5. Every result is validated, and a test opens an edited, duplicated and shortened deck in real LibreOffice to prove the file is still a valid presentation.

## 7. Frontend

TanStack Start (React 19, SSR, no React Server Components) with TanStack Router, TanStack Form (admin form) and TipTap (DOCX editor). Routing and data loading use Router loaders; library state lives in the URL. TanStack Query is intentionally not used: loaders cover reads, and the few mutations (create copy, save) are simple awaited calls.

### 7.1 Routes and rendering

| Route | Rendering | Notes |
| --- | --- | --- |
| `/` | SSR, per visitor | The home gallery: templates of every type, plus the visitor's four most recent files (cookie forwarded during SSR; a failure there never breaks the page) |
| `/docx`, `/pptx` | SSR | The same gallery filtered by type. Loader driven by validated search params (`q`, `category`, `page`). Works without JavaScript through real links (including `?q=` URLs). |
| `/docx/$templateId`, `/pptx/$templateId` | SSR | Preview with page or slide images. `head()` sets `og:title`, `og:description`, `og:image`. Unknown id, or an id of the other type, returns HTTP 404. |
| `/documents` | SSR, per visitor | Session cookie forwarded to the API during SSR |
| `/documents/$documentId` | `ssr: 'data-only'` | The loader runs on the server (the document, plus the editor HTML for DOCX or the slide model for PPTX); the editor renders on the client as a full-window Office-style surface. Each editor is a separately loaded chunk. |
| `/admin/templates` | `ssr: false` | Upload form (TanStack Form) |

### 7.0 Layout (Dia style) and beUI components

The window is a tinted backdrop with two things on it: the navigation rail (no panel, no divider) and the page as one rounded floating panel (`#main-panel`) that scrolls on its own; the window itself never scrolls. The rail holds a search box that opens the beUI **command palette** (Cmd/Ctrl+K works anywhere): it searches the visitor's own files and every template by name, category, description and type words. The palette filters locally over lists fetched each time it opens (up to 100 files and 50 templates). The **Documents** and **Presentations** rows each carry a plus-circle: it creates a blank file of that kind in one click and opens the editor (the row itself still opens the library; the plus is a sibling of the link, not nested in it). The palette's code loads when the browser is idle, or earlier when the pointer, focus or the shortcut reaches for it, so it is off the critical path. On small screens the rail becomes a compact top bar and the panel fills the screen.

Controls come from [beUI](https://beui.dev) (MIT), vendored under `src/components/motion` (see its README for the local changes): **Button** everywhere (including ribbon buttons), **Input** (gallery search, admin form, document title), **Tabs** (gallery type switch, ribbon tabs), **Select** (font size) and **Combobox** (font family) and **Command Palette** (sidebar search). Router links styled as buttons reuse the same classes through `buttonClass`. Animations use `LazyMotion` with the lightweight `m` components; the feature bundle loads asynchronously.

Behaviours worth knowing: ribbon controls keep the text selection (a `mousedown` is not allowed to move focus, and the editors restore the last selection), the ribbon wraps instead of scrolling because the Select list is not portaled, and **saving flushes every pending text edit of the slide editor first** (a beUI Select returns focus to its trigger, so a quick Ctrl+S could otherwise miss a format change that was still waiting on its debounce timer). **The PowerPoint-style editor also autosaves on click-away**: a capture-phase `pointerdown` listener on the document saves whenever a press lands outside a slide text box (the same idea as a form's click-away handler), without blurring the box, so the caret and the ribbon's selection are kept. Saves run one at a time through a queue, so a click-away save and a Save/Download press never send the same edits twice, and a save removes only the edits it sent (text changed while the request was in flight stays unsaved). The status reads "Unsaved changes" from the first keystroke, not after the 200 ms debounce.

### 7.1.1 Gallery design

The library follows a "modern gallery" style (hero banner, type tabs, category chips, soft-shadow cards) inside an app shell with a left sidebar (a compact top bar with scrollable pills on small screens). The editors keep their Office look.

- **Sidebar "Recent"** lists the visitor's 20 latest files. The root route's loader fetches them (`GET /api/documents?limit=20`, with the visitor's cookie, so it is server-rendered) and a failure just leaves the list empty. Renaming from My files calls `router.invalidate()`, which refreshes that list too.
- **Buttons** show a pointer cursor and animate only on press (a small scale); there is no hover animation, only the colour change.
- **Cards** show DOCX pages like a sheet of paper peeking out of a tinted frame and PPTX slides whole. Actions (Use template, Preview) appear on hover or focus on large screens and are always visible on small ones.
- **Quick preview** is a native `<dialog>` (focus trap, Escape, inert background for free). A plain click on "Preview" opens it; a modified click (Ctrl/Cmd/Shift) or a request without JavaScript follows the real link to the template's own page, so every template keeps a shareable, server-rendered URL. For decks the arrow keys and a filmstrip move between slides; "Open full page" links to the dedicated route.
- **Search** lives in the sidebar's command palette (needs JavaScript). The gallery has no search box of its own, but its `q` search param still works as a plain URL (`/docx?q=invoice`) and is filtered on the server, so a search link works without JavaScript.
- The decorative duplicate link on each thumbnail is `aria-hidden` and not focusable, so keyboard and screen-reader users see one "Preview" link per card.

### 7.2 Reducing JavaScript

SSR improves first paint, SEO and link previews but does **not** by itself reduce JavaScript, because React still hydrates the page. The measures used are:

1. **Route code splitting** (automatic). Each editor is loaded with `lazy()` only for its document type. The Word editor chunk is the largest on the site (about 466 KB raw, 145 KB gzip), the PowerPoint editor about 18 KB raw (7 KB gzip) on top of shared code; neither is downloaded by the library pages.
2. **Deferred hydration** (`<Hydrate when={never()}>`, TanStack Start's experimental API) for the site footer, which is static markup rendered on the server and never hydrated. It is deliberately *not* used for content that can appear after a client-side navigation: such a boundary only keeps the server HTML of the first page load, and wrapping the preview images in it left them blank when the preview was opened from the library (found by testing, now covered by an end-to-end test).
3. **Static components stay simple.** Cards and grids receive props from loaders; there are no per-card hooks or data libraries. Only the "Use template" button and the search box are interactive.
4. **URL as state.** Search and filters are search params, so no client-side cache library is needed.
5. **Measured.** `pnpm --filter @office-template/web analyze` fetches each page of a running build, collects the script, modulepreload and stylesheet files, and reports gzip sizes against a budget (default 150 KB of JavaScript per page). Current result: about 170 KB gzip on the template pages, 190 KB on My files and 199 KB on the gallery pages (budget 210 KB). The framework baseline (React, router, Start runtime) is about 115 KB; beUI's animation runtime (`motion`) adds about 30 KB on content pages and about 55 KB on the gallery (segmented tabs, input), even with `LazyMotion` moving the feature bundle (about 19 KB) out of the initial load. The budget was 150 KB before beUI was adopted: that is the cost of the animation library, accepted on purpose and measured here.

### 7.3 Office-style editors

Both editors share one chrome (`features/documents/office/`): a coloured title bar (Word blue, PowerPoint red) with back button, document title, save state and actions; a tabbed ribbon with labelled groups; a status bar. They cover the full window above the site header.

- **Word style** (`DocxEditor.tsx`): Home (undo/redo, font family and size, bold/italic/underline/strike, highlight and font colour, bullets, numbering, indent, alignment, a styles gallery), Insert (table grid, link, horizontal line), a contextual **Table Layout** tab that appears while the cursor is in a table, and View (zoom, ruler). The document is a Letter-size paper sheet on a grey canvas with a ruler and page-break bands; the status bar shows the page the caret is on, the page count, the word count and a zoom slider. Pagination is an approximation: the page count is derived from content height (see limitations).
- **PowerPoint style** (`PptxEditor.tsx`): thumbnail pane, slide canvas, Home (undo/redo, New Slide, Delete, font, size, bold/italic/underline, colour, bullets, alignment), Slide Show and View tabs, a full-screen slide show. Text is edited in place; formatting commands act on the selected text through the browser's editing commands, and ribbon state follows the selection.

### 7.4 API access

`lib/api.ts` exposes one isomorphic client built on `hc<AppType>`. In the browser it calls `/api` on the page origin. During SSR it calls `API_INTERNAL_URL` directly and forwards the request's cookie header. Network failures become a readable `ApiClientError` instead of a bare `fetch failed`.

### 7.6 Measured performance

`pnpm --filter @office-template/web perf` drives real Chrome against a running build and records every animation frame and every long task (>50 ms) while it performs the heaviest interactions on large content: scrolling the gallery, opening the quick preview, switching tabs, typing 300 characters in a ~9,000-word document and scrolling it, typing in and switching between the slides of a 60-slide deck. Results on the development machine with a **4x CPU slowdown**, before and after the beUI and layout change:

| Scenario | Before p95 / max frame | After p95 / max frame | Long tasks |
| --- | --- | --- | --- |
| Gallery: scroll | 16.8 / 16.8 ms | 16.7 / 16.8 ms in steady state (first scroll 33–50 ms while the compositor warms up) | 0 |
| Quick preview x5, tabs x6 | 16.8 / 66.6 ms and 16.7 / 33.3 ms | 16.8 / 33.4 ms and 16.7 / 33.4 ms | 0 |
| Word (9k words): type 300 chars, scroll | 16.7 / 16.8 ms | 16.7 / 16.8 ms | 0 |
| Deck (60 slides): type, switch slides | 16.7 / 16.8 ms | 16.7 / 16.8 ms | 0 |

Frames are capped at 60 FPS (16.7 ms), so equal numbers mean no regression. A single 250 ms frame was seen once while the lazily loaded chunks were being evaluated at 4x slowdown; it did not reproduce in repeated runs. Numbers from a headless run are only meaningful relative to each other.

### 7.5 Error and loading states

Every route has pending, error and not-found handling (defaults in `router.tsx`; the library uses a skeleton grid). Server-side not-found returns HTTP 404. The library shows an empty state with "Clear filters", and error views offer a retry that re-runs the loader. Buttons show progress and inline errors.

## 8. Error handling and security

| Concern | Measure |
| --- | --- |
| Uniform errors | `ApiError` → JSON envelope with the correct HTTP status |
| Input validation | zod on body, query, params; environment validated at startup |
| Uploads | Size limit (body limit + file size), ZIP signature and package-structure check per type, type detected from content |
| Path traversal | Storage keys are generated server-side and resolved against a fixed root; manifest paths are checked to stay inside their folder |
| XSS | Editor HTML is sanitized with an allow-list (`sanitize-html`) on read and on write; preview SVGs are served with a locked-down CSP |
| Session | Random UUID in an `httpOnly`, `SameSite=Lax` cookie; documents are scoped by owner in the query itself |
| Template immutability | The document service holds a read-only store view; verified by test |
| Admin | `x-admin-token` compared in constant time; required in production |
| Headers | `secureHeaders` on all responses; downloads use `Content-Disposition: attachment` and `nosniff` |
| LIKE injection | `%` and `_` in search text are escaped |

## 9. Testing

| Level | Scope |
| --- | --- |
| Unit and integration (Vitest, in-process Hono, in-memory SQLite) | Hidden blank starters (not listed, usable, typed content saved), catalog queries, 404s, validation envelope, image caching (ETag), copy-on-use, template store snapshot unchanged, ownership isolation, DOCX round trip including fonts/colours/alignment in the saved XML, CSS and HTML sanitizing, PPTX slide model for every sample deck, text edits that touch only listed shapes, duplicate/delete slide, XML-illegal characters, admin auth, upload validation (type, size), re-upload versioning, path safety, env validation, manifest loader, preview generation (placeholder, failing converter, and real LibreOffice when installed, including opening an edited deck) |
| End-to-end (Playwright against a production build with its own API and database) | Create-blank tiles and blank editors, JavaScript-disabled SSR checks (content, `?q=` search URL, category links, `og:image`), HTTP 404s, images load (including previews opened by client-side navigation), browse/search/filter, Word editor (ribbon, ruler, page, formatting that survives reload and download, table tab), PowerPoint editor (edit, format, save, reload, download, new/delete slide, slide show), My files, cross-session isolation, admin upload and wrong token |

## 10. Extension points

- **New document type** (for example XLSX): add a `DocTypeHandler`, a `type` value, and a viewer or editor entry in the client's document route.
- **Full-fidelity editing**: embed OnlyOffice Document Server or Collabora Online behind the document route and a storage-backed callback endpoint (shapes, images, animations, real pagination). Mind their licenses (AGPL, MPL). The built-in slide editor can grow the same way: moving and resizing shapes, inserting text boxes and pictures, and reordering slides are additions to `pptx-writer` and `SlideView`.
- **Object storage**: implement `FileStore` for S3.
- **Authentication**: replace the session middleware; `ownerSessionId` becomes a user id.
- **Higher fidelity DOCX editing**: swap the TipTap editor for a full document editor while keeping the document endpoints.
