# Status, limitations and extension paths

## Completed

**Product 1: Document template library (DOCX)**

- Blank document and blank presentation starters ("Start from scratch" tiles).
- Modern gallery (Dia-style window) with thumbnails, name, description and category; search; type tabs; category filter; pagination; quick-preview modal; recent files.
- Preview page with page images; "Use template" creates an independent copy.
- **Word-style editor**: title bar, Home / Insert / View ribbon with a contextual Table Layout tab, paper page on a grey canvas with ruler and page-break bands, status bar (page, word count, zoom). Font family and size, bold/italic/underline/strikethrough, font and highlight colour, alignment, bullets, numbering, indent, a styles gallery (Normal, Heading 1–3, Quote), tables (insert, add/delete rows and columns, merge, header row), links, horizontal line, undo/redo, Ctrl/Cmd+S, unsaved-changes warning, download as DOCX.
- The template's heading colours and body font are carried into the editor, and fonts, sizes, colours and alignment are written to the DOCX as real Word properties.
- Template files are never written by document operations (read-only store view, verified by test).
- 6 sample templates (letter, meeting minutes, proposal, resume, invoice, weekly report).
- Loading, error, empty and not-found states.

**Product 2: Presentation template library (PPTX)**

- Same gallery, search and filtering.
- Preview of every slide; "Use template" creates an independent copy.
- **PowerPoint-style editor**: title bar, Home / Slide Show / View ribbon, thumbnail pane, slide canvas rendered at real size, status bar with zoom. Edit text in place; font family and size, bold/italic/underline, colour, bullets, alignment; New Slide (duplicates the current slide), Delete slide; full-screen slide show; save and download as PPTX.
- Saving rewrites only the text of the shapes that changed. Everything else in the file (layouts, themes, images, other slides) is preserved byte for byte, and a test opens an edited, duplicated and shortened deck in real LibreOffice.
- 4 sample decks (pitch, quarterly review, lesson plan, product launch), 5–6 slides each.

**Shared platform**

- Manifest-driven catalog and idempotent `pnpm seed`; versioning by checksum.
- Admin upload API and form (type detected from file contents, size and structure validation).
- `DocTypeHandler` registry as the extension point for other Office types.
- OpenAPI/Swagger generated from the validation schemas.
- Anonymous per-session ownership of documents.
- SSR for library, preview and "My files"; real HTTP 404s; Open Graph tags on preview pages.
- Dia-style layout with an omnibox (beUI Combobox) and beUI Button, Input, Tabs, Select and Combobox throughout.
- DOCX/PPTX conversions run in a worker thread so large saves never stall the API; `pnpm perf` measures frames and long tasks.
- Tests: 82 server tests (Vitest; 3 need LibreOffice and skip without it; the worker-pool tests start real worker threads), 29 end-to-end tests (Playwright), typecheck for both packages.

## Not completed

| Item | Notes |
| --- | --- |
| **Screen-recording video** | A required deliverable that cannot be produced by the code. It must be recorded separately. |
| Document deletion | Documents can be created, opened, edited, renamed and downloaded. There is no delete endpoint. |
| Template deletion and rollback | Templates can be added and updated (versioned) but not removed through the API. |
| Real authentication | Sessions are anonymous cookies. Clearing cookies loses access to your files. The admin API uses one static token. |
| Rate limiting, antivirus scanning, quotas | Uploads are validated and size-limited but not scanned. |
| Autosave and collaboration | Saving is explicit. |
| Internationalisation | English only. |

## Technical limitations

### Word-style editor (DOCX)

1. **The editor works on HTML, not on the DOCX structure.** Fonts, sizes, colours, alignment, headings, lists and tables survive. Page setup (margins, orientation, size), headers and footers, text boxes, images inserted by the user, comments, tracked changes, footnotes and table cell shading are not editable and do not carry over when the file is saved from the editor. The original template stays untouched, but an edited copy can look plainer than the template.
2. **Pagination is an approximation.** The paper is Letter size and the page count is derived from the content height; page breaks are drawn as bands rather than affecting layout, so text can run across a band. Real pagination needs a layout engine.
3. **Fonts depend on the machine.** Calibri and other Office fonts are used when installed; otherwise the browser falls back (Carlito, Arial). The saved DOCX still names the chosen font.
4. **Import detail.** When a document is first opened, heading colours, sizes and the body font are read from the file's styles; other style definitions are not interpreted.

### PowerPoint-style editor (PPTX)

5. **Text editing only.** You can edit and format text, and add, duplicate-as-new and delete slides. Moving or resizing shapes, inserting text boxes, pictures, tables or charts, changing layouts or themes, reordering slides, speaker notes, transitions and animations are not available. They are preserved in the file if they were already there.
6. **Rendering is an approximation of PowerPoint.** The editor draws rectangles, rounded rectangles, ellipses, text and pictures. Tables, charts, SmartArt, groups and other objects appear as labelled grey placeholders (and are kept untouched in the file). Gradient and picture fills, shadows, rotation, text autofit and colour transforms such as `lumMod` are not drawn. Sample decks render faithfully; complex real-world decks will look simpler in the editor than in PowerPoint (the preview images, rendered by LibreOffice for uploaded templates, show the true look).
7. **A blank presentation has fixed starting boxes.** It starts with one title box and one bulleted content box; there is no "insert text box" command, so extra boxes come from duplicating a slide. Typed text takes the box's size (36 pt title, 20 pt content); the title is not bold by default.
8. **Formatting is applied to the selected text.** With only a caret in a box (nothing selected) a font change affects what you type next, as in Word. "New Slide" duplicates the current slide; there are no layout choices. Structure changes (new/delete) are not undoable; text edits use the browser's undo.
9. **Browser editing commands.** Formatting uses the browser's `execCommand` and `contentEditable`, which is deprecated in the standards but supported in all current browsers; behaviour may differ slightly between browsers (end-to-end tests run in Chrome only).

### Platform

10. **Preview images of the seed templates are drawn from the template specification**, not rendered from the finished files by an Office engine, so they approximate what PowerPoint or Word shows (the real LibreOffice renders of the same files matched closely). Previews of **uploaded** templates use LibreOffice when installed: verified on macOS with LibreOffice 26.8 and poppler 26.10 (tests render a 6-slide PPTX and a DOCX, and live uploads returned PNG pages). Those tests skip themselves where LibreOffice is absent, and the placeholder fallback (missing binaries, or a failing converter) is tested everywhere. The first conversion after start-up takes about 10 s while LibreOffice warms up; later ones about 2 s.
11. **Previews are not regenerated after an edit.** A document's `previewUrls` always show its source template.
12. **Docker images were written and the compose file validated, but the images were not built on the development machine** (the Docker daemon was not running). Run `docker compose up --build` and report any problem; the non-Docker path is the one covered by tests.
13. **Single-instance design.** SQLite and local files suit one server process. Scaling out needs a shared database and an object-store `FileStore`.
14. **Pre-release dependencies.** TanStack Start is on its 1.x line but young; Deferred Hydration (`<Hydrate>`) is documented as experimental, and Nitro is a beta (`3.0.260610-beta`). Versions are pinned. Hydrate is used for one static block (the footer); it can be removed by deleting that wrapper.
15. **JavaScript size.** About 168 KB gzip of JavaScript on content pages and 199 KB on the gallery pages: the React, router and Start runtime (about 115 KB) plus beUI's `motion` runtime (about 30–55 KB). The Word editor adds about 145 KB gzip and the PowerPoint editor about 7 KB gzip, only on the editor page. This is above the 150 KB budget used before beUI was adopted; the budget is now 210 KB.
16. **beUI is vendored, not installed.** Updates are manual (`npx shadcn add @beui/<name>`, then re-apply the local changes listed in `src/components/motion/README.md`). The library is young and changes weekly. Only free components are used (beUI Pro is a separate paid license).
17. **Type tabs need JavaScript.** The gallery's All / Documents / Presentations switch is a beUI Tabs control (buttons); without JavaScript a `<noscript>` link list takes its place. The lists, search form, category chips and pagination remain real links.
18. **Ribbon layout.** The ribbon wraps its groups instead of scrolling horizontally, because the beUI Select list is positioned inside its parent and would be clipped by a scroll container. The editors are designed for desktop-size windows.
19. **Worker thread trade-off.** A heavy save takes about 70–90 ms longer (data is copied across threads) in exchange for the API staying responsive; each worker holds its own copy of the libraries in memory (`DOC_WORKERS=0` turns it off). No browser worker is used because measurements showed none was needed.
20. **Browser coverage.** End-to-end tests run in Google Chrome only. Layouts were checked at desktop and phone widths; the editors are designed for desktop-size windows.
21. **Gateway behaviour.** In production the web app streams `/api/*` to the API. In development a Vite proxy does this, because the dev server does not route non-HTML requests (such as `<img>`) to the server route.

## Extension paths

- **Richer PPTX editing.** Moving and resizing shapes, inserting text boxes and pictures, and reordering slides are additions to `pptx-writer` (more XML operations) and `SlideView` (selection handles). A full-fidelity alternative is to embed OnlyOffice Document Server or Collabora Online in the document route, with a callback endpoint that writes the saved file back through `FileStore`; review their AGPL/MPL terms first.
- **Higher-fidelity DOCX editing.** Edit the DOCX XML directly (as the PPTX editor does) or embed a full document editor against the same document endpoints; this would also give real pagination, headers and footers.
- **More Office types.** Add `doctypes/xlsx/`, register it, add a viewer or editor component.
- **Object storage and scale.** Implement `FileStore` for S3 and swap SQLite for Postgres (Drizzle supports both).
- **Authentication.** Replace the session middleware; `ownerSessionId` becomes a user id and the admin token becomes a role.
