import { createFileRoute } from '@tanstack/react-router';
import { NotFoundView } from '#/components/states';
import { loadTemplatePreview } from '#/features/templates/library-route';
import { previewHead } from '#/features/templates/preview-head';
import { TemplatePreview } from '#/features/templates/TemplatePreview';

export const Route = createFileRoute('/docx/$templateId')({
  loader: ({ params }) => loadTemplatePreview('docx', params.templateId),
  head: ({ loaderData }) => previewHead(loaderData),
  notFoundComponent: () => <NotFoundView what="template" />,
  component: DocxPreview,
});

function DocxPreview() {
  return <TemplatePreview template={Route.useLoaderData().template} />;
}
