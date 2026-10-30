import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'light' | 'glass';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50',
  ghost: 'text-slate-700 hover:bg-slate-200/70 disabled:opacity-50',
  /** For use on dark or image backgrounds. */
  light: 'bg-white text-slate-900 shadow-sm hover:bg-slate-100 disabled:opacity-60',
  glass: 'bg-white/20 text-white ring-1 ring-white/40 backdrop-blur hover:bg-white/30 disabled:opacity-60',
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed';

/** Class string for links that should look like buttons. */
export const buttonClass = (variant: ButtonVariant = 'primary') => `${base} ${variants[variant]}`;

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type="button" className={`${buttonClass(variant)} ${className}`} {...props} />;
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
      {children}
    </span>
  );
}

/** Small "W" / "P" mark identifying a file type. */
export function TypeMark({ type }: { type: 'docx' | 'pptx' }) {
  return (
    <span
      title={type === 'docx' ? 'Word document' : 'PowerPoint presentation'}
      className={`grid size-6 place-items-center rounded-md text-[11px] font-black text-white shadow-sm ${
        type === 'docx' ? 'bg-[#2b579a]' : 'bg-[#c43e1c]'
      }`}
    >
      {type === 'docx' ? 'W' : 'P'}
    </span>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
