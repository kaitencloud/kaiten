import { Badge } from '@/components/ui/badge';
import type { DefaultVariant } from '@/api-client';

type DefaultVariantBadgeProps = {
  defaultVariant: DefaultVariant;
};

export function DefaultVariantBadge({
  defaultVariant,
}: DefaultVariantBadgeProps) {
  const getDisplayInfo = (): { label: string; colorClass: string } => {
    switch (defaultVariant.type) {
      case 'basic': {
        const value = defaultVariant.value;
        const isBoolTrue = value === 'true';
        const isBoolFalse = value === 'false';
        return {
          label: `default: ${value || '—'}`,
          colorClass: isBoolTrue
            ? 'text-success-subtle-foreground border-success-subtle-foreground/30 bg-success-subtle'
            : isBoolFalse
              ? 'text-muted-foreground border-border'
              : 'text-primary-subtle-foreground border-primary-subtle-foreground/30 bg-primary-subtle',
        };
      }
      case 'rollout_date':
        return {
          label: 'default: date-based rollout',
          colorClass:
            'text-primary-subtle-foreground border-primary-subtle-foreground/30 bg-primary-subtle',
        };
      case 'rollout_percentage': {
        const entries = Object.entries(defaultVariant.distribution);
        const summary = entries.map(([k, v]) => `${k}:${v}%`).join(' / ');
        return {
          label: `default: ${summary || 'percentage'}`,
          colorClass:
            'text-primary-subtle-foreground border-primary-subtle-foreground/30 bg-primary-subtle',
        };
      }
      default:
        return {
          label: 'default: —',
          colorClass: 'text-muted-foreground border-border',
        };
    }
  };

  const { label, colorClass } = getDisplayInfo();

  return (
    <Badge variant="outline" className={`font-mono text-xs ${colorClass}`}>
      {label}
    </Badge>
  );
}
