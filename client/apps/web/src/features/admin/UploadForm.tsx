import { useForm } from '@tanstack/react-form';
import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import type { DocType, Template } from '@office-template/server/contracts';
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/motion/combobox';
import { Input } from '@/components/motion/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/motion/select';
import { Button, Spinner } from '#/components/ui';
import { ApiClientError, fetchTemplates, uploadTemplate } from '#/lib/api';

const required = ({ value }: { value: string }) => (value.trim() ? undefined : 'This field is required');

const TYPES: { value: DocType; label: string; extension: string }[] = [
  { value: 'docx', label: 'Document (.docx)', extension: '.docx' },
  { value: 'pptx', label: 'Presentation (.pptx)', extension: '.pptx' },
];
const CREATE_PREFIX = 'create:';

/** Categories that already exist for a type, for the combobox. A failed request just leaves the list empty. */
function useCategories(type: DocType) {
  const [categories, setCategories] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    setCategories([]);
    fetchTemplates({ type, pageSize: 1 })
      .then((list) => !cancelled && setCategories(list.categories))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [type]);
  return categories;
}

/** Loads the categories of the chosen type, then renders the picker. */
function CategoryField(props: { type: DocType; value: string; onChange: (value: string) => void; onBlur: () => void; error?: string }) {
  const categories = useCategories(props.type);
  return <CategoryCombobox {...props} categories={categories} />;
}

/**
 * Category picker for the chosen type: pick one that exists, or type a new name and choose
 * "Create". The chosen name is the form value, so a new category is simply used by the upload.
 */
function CategoryCombobox({
  value,
  categories,
  onChange,
  onBlur,
  error,
}: {
  value: string;
  categories: string[];
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
}) {
  const [query, setQuery] = useState('');
  const typed = query.trim();
  const exists = (name: string) => categories.some((c) => c.toLocaleLowerCase() === name.toLocaleLowerCase());
  // The selected value must be a registered item to be shown in the closed input, even when it is new.
  const options = useMemo(
    () => (value && !exists(value) ? [...categories, value] : categories),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, value],
  );

  return (
    <div className="flex flex-col gap-1.5" onBlur={onBlur}>
      <span className="px-1 text-sm font-medium text-foreground" id="category-label">
        Category
      </span>
      <Combobox
        value={value}
        onValueChange={(next) => onChange(next.startsWith(CREATE_PREFIX) ? next.slice(CREATE_PREFIX.length) : next)}
        query={query}
        onQueryChange={setQuery}
        filter={(item, q) => item.startsWith(CREATE_PREFIX) || item.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase())}
      >
        <ComboboxTrigger className="h-10 rounded-xl">
          <ComboboxInput aria-labelledby="category-label" placeholder="Choose or create a category" />
        </ComboboxTrigger>
        <ComboboxContent className="rounded-xl">
          <ComboboxList ariaLabel="Categories" className="max-h-60 p-1">
            {options.map((name) => (
              <ComboboxItem key={name} value={name} textValue={name}>
                {name}
                {!exists(name) ? <span className="ml-2 rounded-xl bg-accent px-2 text-xs text-primary">new</span> : null}
              </ComboboxItem>
            ))}
            {typed && !exists(typed) ? (
              <ComboboxItem key={`${CREATE_PREFIX}${typed}`} value={`${CREATE_PREFIX}${typed}`} textValue={typed}>
                Create “{typed}”
              </ComboboxItem>
            ) : null}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <p role={error ? 'alert' : undefined} className="min-h-4 px-1 text-xs text-destructive">
        {error}
      </p>
    </div>
  );
}

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
    defaultValues: { type: 'docx' as DocType, name: '', category: '', description: '', file: null as File | null },
    onSubmit: async ({ value }) => {
      setResult({});
      if (!value.file) return;
      const body = new FormData();
      body.set('file', value.file);
      body.set('type', value.type);
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
      <form.Field name="type">
        {(field) => (
          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-sm font-medium text-foreground" id="type-label">
              Type
            </span>
            <Select
              value={field.state.value}
              onValueChange={(next) => {
                field.handleChange(next as DocType);
                // A category belongs to the type's list: start again for the new type.
                form.setFieldValue('category', '');
              }}
            >
              <SelectTrigger aria-label="Type" className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </form.Field>
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
      <form.Subscribe selector={(state) => state.values.type}>
        {(type) => (
          <form.Field name="category" validators={{ onBlur: required, onSubmit: required }}>
            {(field) => (
              <CategoryField type={type} value={field.state.value} onChange={field.handleChange} onBlur={field.handleBlur} error={field.state.meta.errors[0]?.toString()} />
            )}
          </form.Field>
        )}
      </form.Subscribe>
      <form.Field name="description" validators={{ onBlur: required, onSubmit: required }}>
        {(field) => (
          <FieldShell label="Short description" error={field.state.meta.errors[0]?.toString()}>
            <textarea rows={3} maxLength={500} className={nativeClass} value={field.state.value} onBlur={field.handleBlur} onChange={(e) => field.handleChange(e.target.value)} />
          </FieldShell>
        )}
      </form.Field>
      <form.Field
        name="file"
        validators={{
          onSubmit: ({ value, fieldApi }) => {
            const type = fieldApi.form.getFieldValue('type');
            const extension = TYPES.find((t) => t.value === type)!.extension;
            if (!value) return `Choose a ${extension} file`;
            return value.name.toLowerCase().endsWith(extension) ? undefined : `The type is ${type.toUpperCase()}, so choose a ${extension} file`;
          },
        }}
      >
        {(field) => (
          <FieldShell label="File" error={field.state.meta.errors[0]?.toString()}>
            <input
              type="file"
              accept={TYPES.find((t) => t.value === form.getFieldValue('type'))!.extension}
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
