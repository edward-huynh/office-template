import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { Button as BeButton, SIZE_CLASS, VARIANT_CLASS, type ButtonSize, type ButtonVariant as BeVariant } from '@/components/motion/button/base';
import { cn } from '@/lib/utils';

/**
 * The app's buttons are beUI buttons (spring press, reduced-motion aware). The app keeps two extra
 * looks for dark and image backgrounds, built from the same component.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'light' | 'glass';

const BASE_VARIANT: Record<ButtonVariant, BeVariant> = {
  primary: 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
  light: 'secondary',
  glass: 'ghost',
};

const EXTRA: Partial<Record<ButtonVariant, string>> = {
  light: 'border-transparent bg-white text-slate-900 hover:bg-slate-100',
  glass: 'bg-white/20 text-white ring-1 ring-white/40 backdrop-blur hover:bg-white/30 hover:text-white',
};

/** Class string for links that should look like buttons (router links cannot be a motion button). */
export const buttonClass = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md') =>
  cn(
    'inline-flex items-center justify-center font-medium select-none transition-colors',
    VARIANT_CLASS[BASE_VARIANT[variant]],
    SIZE_CLASS[size],
    EXTRA[variant],
  );

type BeButtonProps = ComponentProps<typeof BeButton>;

export const Button = forwardRef<HTMLButtonElement, Omit<BeButtonProps, 'variant'> & { variant?: ButtonVariant }>(
  function Button({ variant = 'primary', className, ...props }, ref) {
    return <BeButton ref={ref} variant={BASE_VARIANT[variant]} className={cn(EXTRA[variant], className)} {...props} />;
  },
);

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-xl bg-accent px-2.5 py-0.5 text-xs font-medium text-primary">{children}</span>
  );
}

/** Small "W" / "P" mark identifying a file type. */
export function TypeMark({ type }: { type: 'docx' | 'pptx' }) {
  return (
    <span
      title={type === 'docx' ? 'Word document' : 'PowerPoint presentation'}
      className={`grid size-6 place-items-center rounded-md text-[11px] font-black text-white ${
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
