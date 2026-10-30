import type { Template } from '@office-template/server/contracts';

/** `<head>` tags for a template preview page, so shared links unfurl with the template image. */
export function previewHead(data: { template: Template; origin: string } | undefined) {
  if (!data) return { meta: [{ title: 'Template · Template Library' }] };
  const { template, origin } = data;
  const title = `${template.name} · Template Library`;
  return {
    meta: [
      { title },
      { name: 'description', content: template.description },
      { property: 'og:title', content: template.name },
      { property: 'og:description', content: template.description },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: `${origin}${template.thumbnailUrl}` },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  };
}
