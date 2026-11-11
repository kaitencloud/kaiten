import { Info, Lock, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONE = {
  accent: 'border-transparent bg-accent text-accent-foreground',
  destructive:
    'border-transparent bg-destructive-subtle text-destructive-subtle-foreground',
  neutral: 'border-border bg-card text-foreground',
  warning:
    'border-transparent bg-warning-subtle text-warning-subtle-foreground',
} as const;

const ICON = { info: Info, lock: Lock, warning: TriangleAlert } as const;

type PanelCalloutProps = {
  children: ReactNode;
  icon?: keyof typeof ICON;
  tone?: keyof typeof TONE;
};

/** A short explanation in the panel: why a price is what it is, or what an edit touches. */
export function PanelCallout({
  children,
  icon = 'info',
  tone = 'neutral',
}: PanelCalloutProps) {
  const Icon = ICON[icon];

  return (
    <p
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm',
        TONE[tone],
      )}
      role="note"
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
