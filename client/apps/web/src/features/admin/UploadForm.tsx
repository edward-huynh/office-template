import { useForm } from '@tanstack/react-form';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import type { Template } from '@office-template/server/contracts';
import { Input } from '@/components/motion/input';
import { Button, Spinner } from '#/components/ui';
import { ApiClientError, uploadTemplate } from '#/lib/api';

const required = ({ value }: { value: string }) => (value.trim() ? undefined : 'This field is required');

/** Native controls (textarea, file input) share the beUI input's label and error styling. */
function FieldShell({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="px-1 text-sm font-medium text-foreground">
        {label}
        {children}
      </label>
      {error ? (
        <p role="alert" className="px-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const nativeClass = 'mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-foreground/40 focus:ring-2 focus:ring-ring/40';

/** Adds a template through the admin API; the new template shows up in the library immediately. */
export function UploadForm() {
  const [result, setResult] = useState<{ template?: Template; error?: string }>({});

  const form = useForm({
    defaultValues: { name: '', category: '', description: '', file: null as File | null },
    onSubmit: async ({ value }) => {
      setResult({});
      if (!value.file) return;
      const body = new FormData();
      body.set('file', value.file);
      body.set('name', value.name.trim());
      body.set('category', value.category.trim());
      body.set('description', value.description.trim());
      try {
        setResult({ template: await uploadTemplate(body) });
      } catch (error) {
        const detail = error instanceof ApiClientError && error.errors ? ` ${Object.values(error.errors).flat().join(' ')}` : '';
        setResult({ error: error instanceof ApiClientError ? `${error.message}.${detail}`.replace('..', '.') : 'Upload failed.' });
      }
    },
  });

  const link = result.template
    ? result.template.type === 'docx'
      ? ({ to: '/docx/$templateId', params: { templateId: result.template.id } } as const)
      : ({ to: '/pptx/$templateId', params: { templateId: result.template.id } } as const)
    : undefined;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 "
    >
      <form.Field name="name" validators={{ onBlur: required, onSubmit: required }}>
        {(field) => (
          <Input
            label="Template name"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={field.handleChange}
            error={field.state.meta.errors[0]?.toString()}
            reserveErrorLine
          />
        )}
      </form.Field>
      <form.Field name="category" validators={{ onBlur: required, onSubmit: required }}>
        {(field) => (
          <Input
            label="Category"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={field.handleChange}
            error={field.state.meta.errors[0]?.toString()}
            reserveErrorLine
          />
        )}
      </form.Field>
      <form.Field name="description" validators={{ onBlur: required, onSubmit: required }}>
        {(field) => (
          <FieldShell label="Short description" error={field.state.meta.errors[0]?.toString()}>
            <textarea rows={3} maxLength={500} className={nativeClass} value={field.state.value} onBlur={field.handleBlur} onChange={(e) => field.handleChange(e.target.value)} />
          </FieldShell>
        )}
      </form.Field>
      <form.Field
        name="file"
        validators={{ onSubmit: ({ value }) => (value ? undefined : 'Choose a DOCX or PPTX file') }}
      >
        {(field) => (
          <FieldShell label="File (.docx or .pptx)" error={field.state.meta.errors[0]?.toString()}>
            <input
              type="file"
              accept=".docx,.pptx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className={nativeClass}
              onChange={(e) => field.handleChange(e.target.files?.[0] ?? null)}
            />
          </FieldShell>
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(submitting) => (
          <Button type="submit" disabled={submitting}>
            {submitting ? <Spinner /> : null}
            Add template
          </Button>
        )}
      </form.Subscribe>

      {result.error ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-800">
          {result.error}
        </p>
      ) : null}
      {result.template && link ? (
        <p role="status" className="rounded-xl bg-green-50 px-4 py-2 text-sm text-green-900">
          Saved “{result.template.name}” (version {result.template.version}).{' '}
          <Link {...link} className="font-medium underline">
            View it in the library
          </Link>
        </p>
      ) : null}
    </form>
  );
}
