import { createFileRoute } from '@tanstack/react-router';
import { UploadForm } from '#/features/admin/UploadForm';

export const Route = createFileRoute('/admin/templates')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Add a template · Template Library' }, { name: 'robots', content: 'noindex' }] }),
  component: () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Add a template</h1>
        <p className="mt-2 text-slate-600">
          Choose the type, pick or create a category, and upload a DOCX or PPTX file (the server checks that the file really is that type). Uploading an existing name with a
          different file creates a new version.
        </p>
      </div>
      <UploadForm />
    </div>
  ),
});
