/** Fixed locale and time zone so server and client render identical text (no hydration mismatch). */
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });

export const formatDate = (iso: string) => `${dateFormat.format(new Date(iso))} UTC`;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const typeLabel = { docx: 'Document', pptx: 'Presentation' } as const;
