import { z } from 'zod';

/**
 * Public contracts shared between the API and the client.
 * This file must stay free of server-only imports.
 */

export const DOC_TYPES = ['docx', 'pptx'] as const;
export const docTypeSchema = z.enum(DOC_TYPES);
export type DocType = z.infer<typeof docTypeSchema>;

export const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and single hyphens');

// ---------------------------------------------------------------- templates

export const templateSchema = z.object({
  id: slugSchema,
  type: docTypeSchema,
  name: z.string(),
  category: z.string(),
  description: z.string(),
  version: z.number().int(),
  thumbnailUrl: z.string(),
  previewUrls: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Template = z.infer<typeof templateSchema>;

/** Shape of `manifest.json` inside each template folder. */
export const manifestSchema = z.object({
  id: slugSchema,
  type: docTypeSchema,
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  description: z.string().min(1).max(500),
  file: z.string().min(1),
  thumbnail: z.string().min(1),
  previews: z.array(z.string().min(1)).min(1).max(40),
  /** Reachable by id but not listed in the gallery (used by the blank starters). */
  hidden: z.boolean().optional(),
});
export type TemplateManifest = z.infer<typeof manifestSchema>;

export const templateListQuerySchema = z.object({
  type: docTypeSchema.optional(),
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});
export type TemplateListQuery = z.infer<typeof templateListQuerySchema>;

/** URL search params of the library pages. Invalid values fall back to defaults instead of erroring. */
export const librarySearchSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z.string().trim().max(60).optional().catch(undefined),
  // Left undefined when absent so the router does not redirect to add `?page=1` on first visit.
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});
export type LibrarySearch = z.infer<typeof librarySearchSchema>;

export const templateListSchema = z.object({
  items: z.array(templateSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  categories: z.array(z.string()),
});
export type TemplateList = z.infer<typeof templateListSchema>;

// ---------------------------------------------------------------- documents

export const documentSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string(),
  templateVersion: z.number().int(),
  type: docTypeSchema,
  title: z.string(),
  sizeBytes: z.number().int(),
  thumbnailUrl: z.string(),
  /** Page or slide images of the source template. Not regenerated after the copy is edited. */
  previewUrls: z.array(z.string()),
  downloadUrl: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OfficeDocument = z.infer<typeof documentSchema>;

export const documentListSchema = z.object({ items: z.array(documentSchema) });
export type DocumentList = z.infer<typeof documentListSchema>;

export const MAX_EDITOR_HTML_LENGTH = 2_000_000;

export const editorContentSchema = z.object({
  html: z.string().max(MAX_EDITOR_HTML_LENGTH),
  /** Body font of the source document (font size in points). */
  defaults: z.object({ fontFamily: z.string().optional(), fontSize: z.number().optional() }).optional(),
});
export type EditorContent = z.infer<typeof editorContentSchema>;

export const createdDocumentSchema = z.object({ id: z.string().uuid() });

export const updateDocumentSchema = z.object({
  html: z.string().max(MAX_EDITOR_HTML_LENGTH),
  title: z.string().trim().min(1).max(120).optional(),
});
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const renameDocumentSchema = z.object({ title: z.string().trim().min(1).max(120) });
export type RenameDocumentInput = z.infer<typeof renameDocumentSchema>;

export const documentListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).optional() });

// ------------------------------------------------------------------- slides

/** Sizes are CSS pixels at 96 dpi (EMU / 9525); font sizes are points. */
const hexColor = z.string().regex(/^[0-9A-Fa-f]{6}$/);

export const slideRunSchema = z.object({
  text: z.string().max(5000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  size: z.number().min(1).max(400).optional(),
  color: hexColor.optional(),
  font: z.string().max(80).optional(),
});
export type SlideRun = z.infer<typeof slideRunSchema>;

export const slideParagraphSchema = z.object({
  align: z.enum(['l', 'ctr', 'r', 'just']).optional(),
  bullet: z.boolean().optional(),
  runs: z.array(slideRunSchema).max(300),
});
export type SlideParagraph = z.infer<typeof slideParagraphSchema>;

export const slideShapeSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** `text` shapes are editable; `shape` is decoration; `unsupported` is drawn as a placeholder box. */
  kind: z.enum(['text', 'shape', 'image', 'unsupported']),
  geometry: z.enum(['rect', 'roundRect', 'ellipse']),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  fill: hexColor.optional(),
  valign: z.enum(['t', 'ctr', 'b']),
  /** Size (pt) and colour used for runs that do not specify their own. */
  defaultSize: z.number(),
  defaultColor: hexColor,
  defaultBold: z.boolean().optional(),
  paragraphs: z.array(slideParagraphSchema),
  /** Data URI for `image` shapes. */
  image: z.string().optional(),
  /** Human label for `unsupported` shapes, for example "Chart". */
  label: z.string().optional(),
});
export type SlideShape = z.infer<typeof slideShapeSchema>;

export const slideSchema = z.object({
  index: z.number().int(),
  background: hexColor.optional(),
  shapes: z.array(slideShapeSchema),
});
export type Slide = z.infer<typeof slideSchema>;

export const deckSchema = z.object({
  width: z.number(),
  height: z.number(),
  slides: z.array(slideSchema),
});
export type Deck = z.infer<typeof deckSchema>;

/** Text changes only: shapes that are not listed keep their original XML. */
export const slideEditsSchema = z.object({
  /** Optional rename, saved together with the text edits. */
  title: z.string().trim().min(1).max(120).optional(),
  slides: z
    .array(
      z.object({
        index: z.number().int().min(0),
        shapes: z
          .array(z.object({ id: z.string().max(40), paragraphs: z.array(slideParagraphSchema).max(200) }))
          .max(200),
      }),
    )
    .max(200),
});
export type SlideEdits = z.infer<typeof slideEditsSchema>;

// -------------------------------------------------------------------- admin

export const adminUploadFieldsSchema = z.object({
  /** Optional: the type is always detected from the file; when given it must agree with the detected one. */
  type: docTypeSchema.optional(),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(500),
  id: slugSchema.optional(),
});

// ----------------------------------------------------------------- envelope

export const successEnvelope = <T extends z.ZodType>(data: T) =>
  z.object({ success: z.literal(true), data });

export const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  statusCode: z.number().int(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
