import type { ReactNode } from 'react';

/** 24×24 outline icons for navigation and cards. */
const paths = {
  grid: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  doc: <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" />,
  slides: <path d="M3 5h18v11H3zM12 16v4M8 20h8M8 9h5M8 12h8" />,
  folder: <path d="M3 6h7l2 2h9v11H3z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l5 5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  eye: <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  clock: <path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
