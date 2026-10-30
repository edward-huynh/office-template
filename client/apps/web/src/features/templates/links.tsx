import { Link } from '@tanstack/react-router';
import type { DocType } from '@office-template/server/contracts';
import type { MouseEvent, ReactNode } from 'react';

export type GalleryType = DocType | 'all';

/**
 * Typed links per document type. Keeping the branching here lets the shared gallery components
 * stay generic over `type` while every `Link` is still checked against a concrete route.
 */
export function LibraryLink({
  type,
  search,
  className,
  children,
  ...aria
}: {
  type: GalleryType;
  search: { q?: string; category?: string; page?: number };
  className?: string;
  children: ReactNode;
  'aria-current'?: 'page';
}) {
  if (type === 'all') {
    return (
      <Link to="/" search={search} className={className} {...aria}>
        {children}
      </Link>
    );
  }
  return type === 'docx' ? (
    <Link to="/docx" search={search} className={className} {...aria}>
      {children}
    </Link>
  ) : (
    <Link to="/pptx" search={search} className={className} {...aria}>
      {children}
    </Link>
  );
}

export function PreviewLink({
  type,
  id,
  className,
  children,
  onOpen,
  hidden,
}: {
  type: DocType;
  id: string;
  className?: string;
  children: ReactNode;
  /** When given, a plain click opens a quick-preview instead of navigating (modified clicks still navigate). */
  onOpen?: () => void;
  /** Mark a purely decorative duplicate link so it is skipped by keyboard and screen readers. */
  hidden?: boolean;
}) {
  const onClick = onOpen
    ? (event: MouseEvent) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        onOpen();
      }
    : undefined;
  const extra = hidden ? { tabIndex: -1, 'aria-hidden': true as const } : {};
  return type === 'docx' ? (
    <Link to="/docx/$templateId" params={{ templateId: id }} className={className} onClick={onClick} {...extra}>
      {children}
    </Link>
  ) : (
    <Link to="/pptx/$templateId" params={{ templateId: id }} className={className} onClick={onClick} {...extra}>
      {children}
    </Link>
  );
}
