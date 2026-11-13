import type { ReactNode } from 'react';
import { StatCard } from '@/functionals/stat-card';
import { cn } from '@/lib/utils';

export type Figure = {
  id: string;
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  helpers?: ReactNode[];
  icon?: ReactNode;
  /** The tone of the icon, when the figure is a state rather than a count. */
  tone?: 'warning' | 'destructive' | 'success';
};

const ICON_TONE = {
  warning: 'text-warning-subtle-foreground',
  destructive: 'text-destructive-subtle-foreground',
  success: 'text-success-subtle-foreground',
} as const;

/** The strip of figures under the attention card: five cards, two helpers each. */
export function FiguresRow({ figures }: { figures: Figure[] }) {
  return (
    <StatCard.Row columnsClassName="md:grid-cols-3 xl:grid-cols-5">
      {figures.map((figure) => (
        <StatCard key={figure.id} data-testid={`dashboard-figure-${figure.id}`}>
          <StatCard.Label>{figure.label}</StatCard.Label>
          {figure.icon ? (
            <StatCard.Icon
              className={cn(figure.tone && ICON_TONE[figure.tone])}
            >
              {figure.icon}
            </StatCard.Icon>
          ) : null}
          <StatCard.Value>
            {figure.value}
            {figure.unit ? <StatCard.Unit>{figure.unit}</StatCard.Unit> : null}
          </StatCard.Value>
          {(figure.helpers ?? []).slice(0, 2).map((helper, index) => (
            <StatCard.Helper
              key={`${figure.id}-helper-${index === 0 ? 'first' : 'second'}`}
            >
              {helper}
            </StatCard.Helper>
          ))}
        </StatCard>
      ))}
    </StatCard.Row>
  );
}
