import type { ReactNode } from 'react';

/** Small 16×16 line icons used by the ribbon. */
const paths = {
  undo: <path d="M5 3 2 6l3 3M2 6h7a4 4 0 0 1 0 8H6" />,
  redo: <path d="m11 3 3 3-3 3m3-3H7a4 4 0 0 0 0 8h3" />,
  alignLeft: <path d="M2 3h12M2 6.5h8M2 10h12M2 13.5h8" />,
  alignCenter: <path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8" />,
  alignRight: <path d="M2 3h12M6 6.5h8M2 10h12M6 13.5h8" />,
  alignJustify: <path d="M2 3h12M2 6.5h12M2 10h12M2 13.5h12" />,
  bullets: <path d="M6 4h8M6 8h8M6 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />,
  numbered: <path d="M6 4h8M6 8h8M6 12h8M2 3.5l1-.5v3M2 9.5c0-1 2-1 2 0s-2 1.5-2 2h2" />,
  outdent: <path d="M7 4h7M7 8h7M7 12h7M5 6 2 8l3 2" />,
  indent: <path d="M7 4h7M7 8h7M7 12h7M2 6l3 2-3 2" />,
  table: <path d="M2 3h12v10H2zM2 7h12M2 10h12M6 3v10M10 3v10" />,
  line: <path d="M2 8h12" />,
  link: <path d="M7 9a3 3 0 0 0 4 0l2-2a3 3 0 0 0-4-4l-1 1M9 7a3 3 0 0 0-4 0L3 9a3 3 0 0 0 4 4l1-1" />,
  save: <path d="M3 2h8l2 2v10H3zM5 2v4h5V2M5 14v-4h6v4" />,
  download: <path d="M8 2v8m0 0-3-3m3 3 3-3M3 13h10" />,
  plus: <path d="M8 3v10M3 8h10" />,
  trash: <path d="M3 4h10M6 4V2h4v2m-5 0 .5 9h5L11 4" />,
  duplicate: <path d="M5 5h8v8H5zM3 11V3h8" />,
  play: <path d="M5 3v10l8-5z" />,
  zoomIn: <path d="M7 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM10 10l4 4M5 7h4M7 5v4" />,
  zoomOut: <path d="M7 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM10 10l4 4M5 7h4" />,
  back: <path d="M10 3 5 8l5 5" />,
  sizeUp: <path d="M3 13 6 4l3 9M4 10h4M12 8V3m-2 2 2-2 2 2" />,
  sizeDown: <path d="M3 13 6 4l3 9M4 10h4M12 3v5m-2-2 2 2 2-2" />,
  rowAbove: <path d="M2 9h12v5H2zM8 6V2m-2 2 2-2 2 2" />,
  rowBelow: <path d="M2 2h12v5H2zM8 10v4m-2-2 2 2 2-2" />,
  colLeft: <path d="M9 2h5v12H9zM6 8H2m2-2L2 8l2 2" />,
  colRight: <path d="M2 2h5v12H2zM10 8h4m-2-2 2 2-2 2" />,
  merge: <path d="M2 3h12v10H2zM8 3v10M5 8h6" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
