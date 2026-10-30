import { createFileRoute } from '@tanstack/react-router';
import { NotFoundView } from '#/components/states';
import { loadTemplatePreview } from '#/features/templates/library-route';
import { previewHead } from '#/features/templates/preview-head';
import { TemplatePreview } from '#/features/templates/TemplatePreview';

export const Route = createFileRoute('/pptx/$templateId')({
  loader: ({ params }) => loadTemplatePreview('pptx', params.templateId),
  head: ({ loaderData }) => previewHead(loaderData),
  notFoundComponent: () => <NotFoundView what="template" />,
  component: PptxPreview,
});

function PptxPreview() {
  return <TemplatePreview template={Route.useLoaderData().template} />;
}
