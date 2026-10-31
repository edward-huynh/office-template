# Office Template Library

A template library for Office files. You pick a Word (DOCX) or PowerPoint (PPTX) template, preview it, and create your own copy. The copy opens in a built-in editor and can be downloaded as a normal .docx or .pptx file. Using or editing a copy never changes the original template.

This is the take-home test for the Fullstack Developer position. It covers both products in one app: the document library (product 1) and the presentation library (product 2).

**Demo video:** https://pub-561bc66165e84df2b3293d6d7e26f366.r2.dev/review-template-demo.mp4

## What it does

- **Library**: grid of templates with thumbnail, name, description and category. Search, type tabs (All / Documents / Presentations), category filter, pagination, quick-preview modal, and a separate preview page per template.
- **Documents**: 6 sample templates plus a blank document. The editor is built on TipTap (font, size, colour, alignment, lists, tables, page count, zoom).
- **Presentations**: 4 sample decks plus a blank presentation. Every slide can be previewed. The editor edits text in place, adds and deletes slides, and has a slide show mode.
- **My files**: the files you created in this browser session. You can rename, delete and download them.
- **Add templates**: drop a folder into `server/templates/` or upload through `/admin/templates`. The UI needs no change.

What is done, what is not, and the technical limits are listed in [docs/LIMITATIONS.md](docs/LIMITATIONS.md). Short version: the DOCX editor works on HTML, so complex features (headers, footers, images, comments) are not kept when a document is saved from the editor. The PPTX editor edits text only; shapes, pictures and layouts stay in the file but cannot be changed.

## Tech stack

| | |
| --- | --- |
| Frontend | TanStack Start (React 19, SSR), TanStack Router and Form, TipTap, Tailwind CSS, a few [beUI](https://beui.dev) components |
| Backend | Hono on Node, zod, OpenAPI/Swagger |
| Database | SQLite through Drizzle ORM |
| File storage | Local disk (`server/storage/`) |
| Tests | Vitest (87 tests), Playwright (37 tests) |

Third-party libraries and their licenses are in [docs/LICENSES.md](docs/LICENSES.md).

## Run it

You need **Node 22 or newer** (developed on 24) and **pnpm 10**.

```bash
pnpm install
pnpm start
```

`pnpm start` builds the web app, then runs the API on port 3001 and the web app on port 3000. Open <http://localhost:3000>. API docs (Swagger) are at <http://localhost:3000/api/docs>.

There is no separate seed step. On start the API compares the database with `server/templates/` and imports anything missing, so the first run imports all samples and later runs skip them. Set `AUTO_SEED=false` to turn this off.

For hot reload use `pnpm dev`.

**Docker:**

```bash
docker compose up --build
```

I did not build the Docker images in my development environment, so this path is untested. See [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

**Optional, for uploaded templates:** the sample templates come with pre-rendered preview images. For templates you upload, real page images need LibreOffice and poppler on your `PATH`; without them the upload gets a placeholder image. On macOS: `brew install --cask libreoffice && brew install poppler`. On Debian/Ubuntu: `apt install libreoffice-writer libreoffice-impress poppler-utils`.

## Try it

1. On the home page, hover a template and click **Preview** (arrow keys move between slides), then **Use this template**. **Blank document** and **Blank presentation** start an empty file.
2. In the document editor, change some text and formatting on the **Home** tab, press **Save** (Ctrl/Cmd+S), then **Download DOCX**.
3. Open a presentation template (for example Modern Pitch Deck). Click any text on a slide to edit it, add or delete a slide, try **Present**, then **Download PPTX**. Edits save automatically when you click outside the text.
4. Open **My files** to see your copies. The pencil renames, the trash icon deletes after a confirmation.
5. Check that the original is untouched: use the same template again and the new copy starts without your edits.
6. Add a template at <http://localhost:3000/admin/templates>. This page has no login (see the security note in [docs/LIMITATIONS.md](docs/LIMITATIONS.md)).

## How a copy stays independent of the template

`POST /api/templates/:id/use` reads the template through a read-only view of the template store and writes a new file, `documents/<uuid>.<ext>`, owned by the visitor's session. Editing and downloading only touch that new file. One test takes a snapshot of every template file before and after using and editing a document and checks that the snapshots are identical.

## API overview

| Method and path | Purpose |
| --- | --- |
| `GET /api/templates` | List templates (`type`, `category`, `q`, `page`, `pageSize`) |
| `GET /api/templates/:id` | One template |
| `GET /api/templates/:id/thumbnail`, `/pages/:index` | Thumbnail and preview page images |
| `POST /api/templates/:id/use` | Create a document from a template |
| `GET /api/documents` | Documents of the current session |
| `GET/PATCH/DELETE /api/documents/:id` | Read, rename, delete a document |
| `GET/PUT /api/documents/:id/content` | Read and save a DOCX document |
| `GET/PUT /api/documents/:id/slides` | Read and save a PPTX document |
| `POST /api/documents/:id/slides/:index/duplicate`, `DELETE /api/documents/:id/slides/:index` | Add and delete a slide |
| `GET /api/documents/:id/download` | Download the DOCX or PPTX |
| `POST /api/admin/templates` | Add or update a template |

Request and response details, error format and the template manifest format are in [docs/API.md](docs/API.md).

## Add a template without the UI

1. Create `server/templates/docx/my-template/` (or `pptx/`) with `manifest.json`, the file, a thumbnail and preview images. The format is in [docs/API.md](docs/API.md#manifest-format).
2. Restart the API, or run `pnpm seed` while it is running.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm start` | Build the web app and run API and web |
| `pnpm dev` | Run API and web with hot reload |
| `pnpm seed` | Import `server/templates/**` by hand |
| `pnpm generate:templates` | Regenerate the sample templates and previews |
| `pnpm test` | Server unit and integration tests (3 need LibreOffice and are skipped without it) |
| `pnpm test:e2e` | Playwright tests (needs Google Chrome; uses ports 4000 and 4001) |
| `pnpm typecheck` | Type-check both packages |
| `pnpm build` | Production build of the web app |

`pnpm start` runs in development mode. For production, start the API with `NODE_ENV=production` (`pnpm --filter @office-template/server start`) and the web app (`pnpm --filter @office-template/web start`) with `API_INTERNAL_URL` pointing at the API.

## Documentation

| Document | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Design, data model, main flows, security, testing |
| [docs/API.md](docs/API.md) | Endpoints, errors, manifest format |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | Done, not done, technical limits, how to extend |
| [docs/LICENSES.md](docs/LICENSES.md) | Third-party licenses and AI-assistance disclosure |

## Repository layout

```
client/apps/web/   Web app: routes, features, e2e tests
server/            API: modules, document type handlers, infra, templates, tests
docs/              Documentation
docker-compose.yml
```

## AI assistance

I built this with an AI coding assistant (Claude Code). How I checked its output is described in [docs/LICENSES.md](docs/LICENSES.md).
