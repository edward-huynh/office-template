import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiClientError, createDocumentFromTemplate } from '#/lib/api';

/**
 * Creates the visitor's copy of a template through the API (the template is never modified) and
 * opens it in the editor.
 */
export function useCreateDocument(templateId: string) {
  const router = useRouter();
  const [state, setState] = useState<{ pending: boolean; error?: string }>({ pending: false });

  async function create() {
    setState({ pending: true });
    try {
      const { id } = await createDocumentFromTemplate(templateId);
      await router.navigate({ to: '/documents/$documentId', params: { documentId: id } });
    } catch (error) {
      setState({
        pending: false,
        error: error instanceof ApiClientError ? error.message : 'Could not create the document. Please try again.',
      });
    }
  }

  return { create, ...state };
}
