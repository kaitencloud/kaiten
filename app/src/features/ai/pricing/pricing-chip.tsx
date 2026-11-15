import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TONE = {
  accent: 'border-transparent bg-accent text-accent-foreground',
  destructive:
    'border-transparent bg-destructive-subtle text-destructive-subtle-foreground',
  neutral: 'border-border bg-transparent text-foreground',
  success:
    'border-transparent bg-success-subtle text-success-subtle-foreground',
  warning:
    'border-transparent bg-warning-subtle text-warning-subtle-foreground',
} as const;

type PricingChipProps = {
  children: ReactNode;
  className?: string;
  title?: string;
  tone: keyof typeof TONE;
};

/** A small pill that says where a price comes from, or what a version grants. */
export function PricingChip({
  children,
  className,
  title,
  tone,
}: PricingChipProps) {
  return (
    <Badge
      className={cn(
        'gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap shadow-none',
        TONE[tone],
        className,
      )}
      title={title}
      variant="outline"
    >
      {children}
    </Badge>
  );
}
