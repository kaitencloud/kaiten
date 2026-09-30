import { Link } from '@tanstack/react-router';
import { CirclePlus } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type GradientButtonProps = {
  label: string;
  /**
   * Mutes the gradient and blocks interaction. Primarily meant for the
   * `onClick` variant (native `disabled`); the `to` variant is rendered
   * inert (`pointer-events-none` + `aria-disabled`).
   */
  disabled?: boolean;
} & (
  | { to: ComponentProps<typeof Link>['to']; onClick?: never }
  | { onClick: () => void; to?: never }
);

// The theme owns this gradient (`--primary-gradient`); the three hardcoded hexes here
// were a copy of three of its four stops. The magenta #c32ab1 was missing entirely, and
// Tailwind's from/via/to pins its stops at 0/50/100 where the token authors 0/33/66/100 —
// so the brand's signature CTA followed neither a theme change nor
// `scripts/check-token-contrast.mjs`.
//
// No scrim is needed here, unlike the SDK's `.ktn-cta-gradient`: this paints a 2px FRAME
// around an inner `bg-background` surface, so no text ever sits on the gradient. DESIGN.md
// draws exactly that line — the token stays pure for surfaces that carry no text.
const wrapperClassName =
  'inline-flex rounded-lg bg-[image:var(--primary-gradient)] p-0.5';

const innerClassName =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-[calc(var(--radius-lg)-2px)] border-0 bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted';

export const GradientButton = ({
  label,
  to,
  onClick,
  disabled,
}: GradientButtonProps) => (
  <div className={cn(wrapperClassName, disabled && 'opacity-50')}>
    {onClick ? (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(innerClassName, disabled && 'pointer-events-none')}
      >
        <CirclePlus className="size-4" />
        <span>{label}</span>
      </button>
    ) : to ? (
      <Link
        to={to}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : undefined}
        className={cn(innerClassName, disabled && 'pointer-events-none')}
      >
        <CirclePlus className="size-4" />
        <span>{label}</span>
      </Link>
    ) : null}
  </div>
);
