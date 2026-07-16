import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type PillButtonVariant = 'primary' | 'dark' | 'ghost' | 'soft';

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillButtonVariant;
  /** Leading icon (rendered before the label). */
  leadingIcon?: ReactNode;
  /** Trailing icon (rendered after the label, pushed to the end). */
  trailingIcon?: ReactNode;
  /** Stretch to fill the parent width. Default true (this is a CTA primitive). */
  fullWidth?: boolean;
  /** Show a spinner and disable interaction. */
  loading?: boolean;
}

/**
 * PillButton — the RocketJump landing pill CTA recipe.
 *
 * Unlike the square `Button` primitive (`rounded-linear`), this is the brand pill:
 * `rounded-full`, `active:translate-y-[2px]` press, and — on the `primary` variant —
 * the signature `shadow-cta-stacked` (#B23A0E ledge + orange ambient glow).
 *
 * Variants (DESIGN_SYSTEM.md):
 *  - primary : accent-orange fill, stacked CTA shadow (the brand moment)
 *  - dark    : navy fill (champagne-900), white text — secondary "install" action
 *  - ghost   : transparent, hairline border — low-emphasis
 *  - soft    : champagne-100 fill — neutral secondary, used in 50/50 rows
 */
export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(function PillButton(
  {
    variant = 'primary',
    leadingIcon,
    trailingIcon,
    fullWidth = true,
    loading = false,
    disabled,
    className,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  const base =
    'relative inline-flex items-center justify-center gap-2.5 rounded-full px-5 py-4 text-[15px] font-semibold leading-none transition-all duration-200 active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50';

  const variants: Record<PillButtonVariant, string> = {
    // The brand CTA — orange fill + stacked ledge shadow. On press the button
    // drops 2px so it visually "lands" on the ledge.
    primary:
      'bg-accent-500 text-white shadow-cta-stacked hover:bg-accent-500 active:shadow-[0_4px_0_0_#B23A0E,0_8px_18px_-8px_rgba(255,90,31,0.5)]',
    // Navy fill (install actions). Uses the ink token so it reads on cream.
    dark: 'bg-champagne-900 text-white hover:bg-champagne-800',
    // Low-emphasis outline pill.
    ghost:
      'border border-champagne-300 bg-transparent text-champagne-900 hover:bg-champagne-100',
    // Neutral filled secondary.
    soft: 'bg-champagne-100 text-champagne-800 hover:bg-champagne-200 border border-champagne-300',
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(base, variants[variant], fullWidth && 'w-full', className)}
      {...props}
    >
      {loading ? (
        <span
          className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/40 border-t-white"
          aria-hidden="true"
        />
      ) : (
        leadingIcon && <span className="flex shrink-0 items-center">{leadingIcon}</span>
      )}
      <span className="truncate">{children}</span>
      {trailingIcon && !loading && (
        <span className="ml-auto flex shrink-0 items-center">{trailingIcon}</span>
      )}
    </button>
  );
});

export default PillButton;
