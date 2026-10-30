# Office Template Library

A working template gallery for Office documents. Pick a **Word (DOCX)** or **PowerPoint (PPTX)** template, preview it, and create your own copy. Both types open in an editor modelled on Word and PowerPoint (ribbon, page or slide canvas, status bar) and download as standard Office files. The original templates are never modified.

- **Blank files**: "Start from scratch" tiles create a blank document (an empty Word-style page) or a blank presentation (one slide with empty title and content boxes).
- **Layout**: a Dia-style window: a tinted backdrop with the navigation rail directly on it (including an address-bar style search box that jumps to a template or starts a blank file), and the page as one rounded floating panel.
- **Gallery**: a modern template gallery: sidebar navigation, a hero with a large search, All / Documents / Presentations tabs, category chips, rounded thumbnail cards with hover actions, a quick-preview modal, and a "continue where you left off" row of your recent files.
- **Documents**: 6 sample templates, searchable and filterable, edited in a Word-style editor (fonts, sizes, colours, alignment, lists, tables, ruler, page count, zoom).
- **Presentations**: 4 sample decks with slide-by-slide preview, edited in a PowerPoint-style editor (thumbnails, in-place text editing and formatting, new/delete slide, slide show).
- **One platform** behind both: a `type` field, a shared API, and a registry that makes new Office types an additive change.

| | |
| --- | --- |
| Frontend | TanStack Start (React 19, SSR), TanStack Router and Form, TipTap, Tailwind CSS, [beUI](https://beui.dev) components (Button, Input, Tabs, Select, Combobox) |
| Backend | Hono on Node, zod, OpenAPI/Swagger |
| Data | SQLite (Drizzle ORM), local file storage |
| Tests | Vitest (82), Playwright (29) |

## Quick start

Requirements: **Node 22+** (developed on 24) and **pnpm 10**.

```bash
pnpm install
pnpm start       # builds the web app, then runs the API on :3001 and the web app on :3000
```

Open <http://localhost:3000>. API docs: <http://localhost:3000/api/docs>.

**No separate seed step.** When the API starts it checks the database against the template catalog in `server/templates/`: on the first run (empty database) it imports all sample templates; on later runs it finds everything already imported and just starts. The check is idempotent, so templates you add or change in `server/templates/` are picked up on the next start too. The log says which case it was (`Template catalog imported: …` or `Template catalog already imported (…)`). Set `AUTO_SEED=false` to turn this off.

DOCX/PPTX conversions run in a worker thread (`DOC_WORKERS`, default 1; `0` runs them on the main thread), so saving a big document never stalls the API for other visitors.

For development with hot reload, use `pnpm dev` instead of `pnpm start`.

**Optional: real previews for uploaded templates.** The sample templates ship with pre-rendered previews. Templates uploaded through the admin API get real page images when LibreOffice and poppler are on your `PATH`; otherwise they get a placeholder image. On macOS: `brew install --cask libreoffice && brew install poppler`. On Debian/Ubuntu: `apt install libreoffice-writer libreoffice-impress poppler-utils`. The server logs which mode it is in at start-up.

### With Docker

```bash
docker compose up --build
```

Open <http://localhost:3000>. The API image includes LibreOffice (used to render previews of uploaded templates). The compose file uses a demo `ADMIN_TOKEN`; set your own with `ADMIN_TOKEN=... docker compose up`. See the note in [docs/LIMITATIONS.md](docs/LIMITATIONS.md): the images were not built in the authoring environment.

## Try it

1. For a blank file, click **Blank document** or **Blank presentation** under "Start from scratch" on the gallery. Otherwise, on the home gallery, hover a card (or use the type tabs and category chips), click **Preview** for a quick look in a modal (arrow keys move through slides), then **Use this template**. **Open full page** gives each template its own shareable URL.
2. In the Word-style editor, select text and change the font, size, colour or alignment on the **Home** tab; click in a table to get the **Table Layout** tab. Press **Save** (or Ctrl/Cmd+S), then **Download DOCX**.
3. **Presentations** → **Modern Pitch Deck** → **Use this template**. Click any text on the slide to edit it in place, format it on the **Home** tab, use **New Slide** / **Delete**, try **Present** (arrow keys, Esc to exit), then **Download PPTX**.
4. **My files** lists everything created in this browser session; the pencil next to a name renames it (Enter saves, Escape cancels). The sidebar's **Recent** list shows your 20 latest files.
5. Prove the original is untouched: use the same template again; the new copy starts without your edits.
6. Add a template: <http://localhost:3000/admin/templates> (token `dev-admin-token` in development).
7. Turn JavaScript off: the library, search (a plain GET form), filters and preview pages still work, because they are server-rendered.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm start` | Build the web app and run API + web (the API imports the template catalog on start if needed) |
| `pnpm dev` | Run API and web with hot reload |
| `pnpm seed` | Import `server/templates/**` by hand (the API does this automatically on start) |
| `pnpm generate:templates` | Regenerate the sample templates and previews |
| `pnpm test` | Server unit and integration tests |
| `pnpm test:e2e` | Playwright end-to-end tests (needs Google Chrome; builds the app on ports 4000/4001) |
| `pnpm typecheck` | Type-check both packages |
| `pnpm build` | Production build of the web app |
| `pnpm --filter @office-template/web analyze` | JS/CSS size per page of a running build |
| `pnpm --filter @office-template/web perf` | Frame times and long tasks in Chrome for the heaviest interactions (a ~9k-word document, a 60-slide deck); add `--throttle=4` to emulate a slower CPU |

`pnpm start` runs in development mode (admin token `dev-admin-token`). For a hardened production run, start the API with `NODE_ENV=production` and `ADMIN_TOKEN` set (`pnpm --filter @office-template/server start`) and the web app (`pnpm --filter @office-template/web start`) with `API_INTERNAL_URL` pointing at the API.

## Add a template without touching the UI

1. Create `server/templates/docx/my-template/` (or `pptx/`) containing `manifest.json`, the file, a thumbnail and preview images. See the format in [docs/API.md](docs/API.md#manifest-format).
2. Restart the API (`pnpm start`), or run `pnpm seed` while it is running.

It appears in the library immediately. Or upload a file through `/admin/templates` or `POST /api/admin/templates`.

## How the copy stays independent

`POST /api/templates/:id/use` reads the template through a **read-only view** of the template store and writes a new file, `documents/<uuid>.<ext>`, owned by the visitor's session. Editing and downloading touch only that file. A test snapshots every template file before and after using and editing a document and requires the snapshots to be identical.

## Documentation

| Document | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Design, data model, flows, SSR and bundle strategy, security, testing |
| [docs/API.md](docs/API.md) | Endpoints, errors, manifest format (and live Swagger at `/api/docs`) |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | What is done, what is not, technical limits, extension paths |
| [docs/LICENSES.md](docs/LICENSES.md) | Third-party licenses and AI-assistance disclosure |

## Repository layout

```
client/apps/web/   TanStack Start app: routes, features, e2e tests
server/            Hono API: modules, doctypes, infra, contracts, templates, tests
docs/              Documentation
docker-compose.yml
```

## Notes on AI assistance

Built with an AI coding assistant (Claude Code). Details and how the output was verified are in [docs/LICENSES.md](docs/LICENSES.md).
