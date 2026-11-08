import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Standing } from '../logic/standing';

const STANDING_CLASS: Record<Standing, string> = {
  atLimit:
    'border-transparent bg-destructive-subtle text-destructive-subtle-foreground shadow-none hover:bg-destructive-subtle',
  watch:
    'border-transparent bg-warning-subtle text-warning-subtle-foreground shadow-none hover:bg-warning-subtle',
  healthy:
    'border-transparent bg-success-subtle text-success-subtle-foreground shadow-none hover:bg-success-subtle',
  silent:
    'border-transparent bg-muted text-muted-foreground shadow-none hover:bg-muted',
};

/** The one health word of an instance, as a tinted badge. */
export function StandingBadge({ standing }: { standing: Standing }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="outline"
      className={cn(STANDING_CLASS[standing])}
      data-standing={standing}
    >
      {t(`Pages.Dashboard.standing.${standing}`)}
    </Badge>
  );
}
