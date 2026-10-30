# API reference

Base path: `/api`. The live OpenAPI 3 document is served at `/api/openapi.json` and an interactive Swagger UI at **`/api/docs`** (generated from the same zod schemas that validate requests, so it cannot drift).

## Conventions

**Success**

```json
{ "success": true, "data": { } }
```

**Error**

```json
{ "success": false, "message": "Template \"x\" was not found", "statusCode": 404, "errors": { "field": ["reason"] } }
```

`errors` is present only for validation failures (`422`).

| Status | Meaning |
| --- | --- |
| 400 | Bad request (for example an invalid storage key, or editing a type with no editor) |
| 401 | Missing or invalid admin token |
| 404 | Resource not found, **or not owned by the current session** |
| 413 | Upload larger than `MAX_UPLOAD_MB` |
| 415 | Upload is not a valid DOCX or PPTX |
| 422 | Request validation failed (`errors` lists the fields) |
| 500 | Unexpected error (details hidden in production) |

**Sessions.** The first request sets an `ot_sid` cookie (`httpOnly`, `SameSite=Lax`). Documents are scoped to it. There are no accounts.

**Images.** Thumbnail and page URLs carry `?v=<checksum>` and are served with `Cache-Control: public, max-age=31536000, immutable` and an `ETag` (`304` on `If-None-Match`).

## Templates

### `GET /api/templates`

| Query | Type | Default | Notes |
| --- | --- | --- | --- |
| `type` | `docx` \| `pptx` | any | |
| `q` | string (≤ 100) | | Matches name, description and category (case-insensitive substring) |
| `category` | string | | Exact match |
| `page` | integer ≥ 1 | `1` | |
| `pageSize` | integer 1–50 | `12` | |

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "pitch-deck-modern",
        "type": "pptx",
        "name": "Modern Pitch Deck",
        "category": "Business",
        "description": "A dark, high-contrast investor pitch…",
        "version": 1,
        "thumbnailUrl": "/api/templates/pitch-deck-modern/thumbnail?v=a2df7db0",
        "previewUrls": ["/api/templates/pitch-deck-modern/pages/0?v=a2df7db0"],
        "createdAt": "2026-10-29T14:00:00.000Z",
        "updatedAt": "2026-10-29T14:00:00.000Z"
      }
    ],
    "total": 4,
    "page": 1,
    "pageSize": 12,
    "categories": ["Business", "Education", "Marketing", "Reports"]
  }
}
```

`categories` lists every category of the requested `type`, regardless of `q` and `category`, so the UI can render filters.

### `GET /api/templates/{id}`

Returns one template (same shape as an item above). `404` if unknown. Hidden templates (`blank-document`, `blank-presentation`) are returned here and can be used with `POST /api/templates/{id}/use`, but never appear in `GET /api/templates`.

### `GET /api/templates/{id}/thumbnail`

### `GET /api/templates/{id}/pages/{index}`

Image (`image/png` or `image/svg+xml`). `index` is zero-based. `404` if the template or page does not exist.

## Documents

### `POST /api/templates/{id}/use` → `201`

Creates a copy of the template for the current session. The template is not modified.

```json
{ "success": true, "data": { "id": "6f0c3c0e-6f6e-4a4a-9d0b-0b9a0c6f1f11" } }
```

### `GET /api/documents`

Documents of the current session, most recently updated first. Optional query `limit` (1–100) returns only the latest N; the web app's sidebar asks for 20.

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "6f0c3c0e-…",
        "templateId": "meeting-minutes",
        "templateVersion": 1,
        "type": "docx",
        "title": "Meeting Minutes",
        "sizeBytes": 10234,
        "thumbnailUrl": "/api/templates/meeting-minutes/thumbnail?v=71e90f9d",
        "previewUrls": ["/api/templates/meeting-minutes/pages/0?v=71e90f9d"],
        "downloadUrl": "/api/documents/6f0c3c0e-…/download",
        "createdAt": "…",
        "updatedAt": "…"
      }
    ]
  }
}
```

`previewUrls` are the images of the **source template**; they are not regenerated after the copy is edited.

### `GET /api/documents/{id}`

One document. `404` if it does not exist or belongs to another session.

### `PATCH /api/documents/{id}`

Renames a document. Body: `{ "title": "Q3 invoice" }` (trimmed, 1–120 characters). Returns the updated document; the file itself is not touched, and the download file name follows the new title. `404` if it does not exist or belongs to another session, `422` for an empty title.

### `GET /api/documents/{id}/content`

DOCX only. Returns the document as sanitized HTML for the editor. `400` for PPTX.

```json
{
  "success": true,
  "data": {
    "html": "<h1><span style=\"color:#6A1B9A;font-size:26pt\">Meeting Minutes</span></h1><p>…</p>",
    "defaults": { "fontFamily": "Calibri", "fontSize": 11 }
  }
}
```

For a document that was never saved, the HTML is converted from the DOCX; heading colours, sizes and the body font are read from the file's `styles.xml` and applied as inline styles so the editor looks like the template. After the first save, the editor's own saved HTML is returned (formatting the DOCX writer cannot round-trip is therefore never lost in the editor).

### `PUT /api/documents/{id}/content`

DOCX only. Body:

```json
{ "html": "<h1>New title</h1><p style=\"text-align:center\">Body</p>", "title": "Optional new title (1–120 chars)" }
```

`html` is sanitized with an allow-list (scripts, event handlers and unsafe URLs are removed; inline styles are limited to `color`, `background-color`, `font-family`, `font-size`, `text-align` and `line-height`) and converted to DOCX; the document copy is overwritten. Returns the updated document. `html` is limited to 2,000,000 characters. `422` on an invalid body.

### `GET /api/documents/{id}/slides`

PPTX only (`400` otherwise). A render-ready model of the deck. Positions and sizes are CSS pixels at 96 dpi, font sizes are points, colours are `RRGGBB`.

```json
{
  "success": true,
  "data": {
    "width": 960,
    "height": 540,
    "slides": [
      {
        "index": 0,
        "background": "0F172A",
        "shapes": [
          {
            "id": "2", "name": "Title", "kind": "text", "geometry": "rect",
            "x": 76.8, "y": 153.6, "w": 806.4, "h": 124.8, "valign": "b",
            "defaultSize": 18, "defaultColor": "000000",
            "paragraphs": [{ "align": "l", "runs": [{ "text": "Your Startup Name", "bold": true, "size": 38, "color": "F8FAFC" }] }]
          }
        ]
      }
    ]
  }
}
```

`kind` is `text` (editable), `shape` (decoration), `image` (inlined data URI, up to 1.5 MB) or `unsupported` (tables, charts, groups: drawn as labelled placeholders). Placeholder positions and default text sizes are resolved from the slide layout and master.

### `PUT /api/documents/{id}/slides`

PPTX only. Saves text edits and an optional rename:

```json
{
  "title": "Optional new title",
  "slides": [
    { "index": 0, "shapes": [ { "id": "2", "paragraphs": [ { "align": "ctr", "bullet": false, "runs": [ { "text": "Acme", "bold": true, "size": 40, "color": "FF0000" } ] } ] } ] }
  ]
}
```

Only the listed shapes are rewritten (their paragraphs and runs); every other part of the slide XML, and every other slide, is preserved byte for byte. A newline in a run becomes a line break. Characters that are illegal in XML are removed. `400` for an unknown slide or a shape without text; `422` for an invalid body. Returns the updated document.

### `POST /api/documents/{id}/slides/{index}/duplicate`

Duplicates a slide (zero-based `index`); the copy is placed right after it. Returns the updated deck. Speaker notes are not copied.

### `DELETE /api/documents/{id}/slides/{index}`

Deletes a slide and its notes page. `400` if it is the last remaining slide. Returns the updated deck.

### `GET /api/documents/{id}/download`

Streams the file with `Content-Disposition: attachment`, the correct MIME type and `X-Content-Type-Options: nosniff`.

## Admin

### `POST /api/admin/templates`

Header `x-admin-token: <ADMIN_TOKEN>` is required (in development the default is `dev-admin-token`). `multipart/form-data`:

| Field | Required | Notes |
| --- | --- | --- |
| `file` | yes | DOCX or PPTX. The type is detected from the **contents**. |
| `name` | yes | ≤ 120 chars |
| `category` | yes | ≤ 60 chars |
| `description` | yes | ≤ 500 chars |
| `id` | no | Lowercase slug. Defaults to a slug of `name`. |

`201` when created, `200` when an existing id was updated (the version increases only if the file changed). The response is the template. A preview is generated with LibreOffice when installed, otherwise a placeholder image.

```bash
curl -X POST http://localhost:3000/api/admin/templates \
  -H "x-admin-token: dev-admin-token" \
  -F "file=@my-template.docx" \
  -F "name=My Template" -F "category=Custom" -F "description=Added from the command line"
```

## Health

### `GET /api/health`

```json
{ "success": true, "data": { "status": "ok", "uptime": 42 } }
```

## Manifest format

Each template folder under `server/templates/<type>/<id>/` contains `manifest.json`:

```json
{
  "id": "meeting-minutes",
  "type": "docx",
  "name": "Meeting Minutes",
  "category": "Meetings",
  "description": "Agenda, attendees, decisions and an action-item table.",
  "file": "template.docx",
  "thumbnail": "thumbnail.png",
  "previews": ["pages/1.png"]
}
```

`hidden` (optional boolean) keeps a template out of listings and search while leaving it reachable by id; the blank starters use it. `id` and `type` must match the folder path. Preview files must be `.png` or `.svg`. All paths are relative to the template folder and may not escape it.
