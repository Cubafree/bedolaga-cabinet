import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface KickerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Kicker — the mono, uppercase «эйбрау» eyebrow label above section headers.
 *
 * RocketJump landing recipe (DESIGN_SYSTEM.md §"Радиусы / тени / фирменные рецепты"):
 * JetBrains Mono, 12px, uppercase, letter-spacing 0.18em. Accent-tinted by default
 * (the only place accent-orange is used as a *text* color outside CTAs).
 */
export function Kicker({ children, className }: KickerProps) {
  return (
    <span
      className={cn(
        'block font-mono text-[12px] font-semibold uppercase tracking-[0.18em] text-accent-600',
        className,
      )}
    >
      {children}
    </span>
  );
}

export default Kicker;
