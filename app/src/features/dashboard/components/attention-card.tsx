import { Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AttentionLine, AttentionTone } from '../logic/attention';

const DOT_TONE: Record<AttentionTone, string> = {
  destructive: 'bg-destructive',
  warning: 'bg-warning',
  info: 'bg-info',
  muted: 'bg-chart-5',
};

type AttentionCardProps = {
  description: string;
  lines: AttentionLine[];
  /** The checks that ran and found nothing, already worded. */
  checked: string[];
  checkedAt: string;
};

/**
 * What needs a decision, one line per situation: a tone, a sentence, its detail
 * and the lever beside it. When every check found nothing, the card says what it
 * looked at, so an empty list is trusted rather than suspected.
 */
export function AttentionCard({
  description,
  lines,
  checked,
  checkedAt,
}: AttentionCardProps) {
  const { t } = useTranslation();
  const worst = lines.some((line) => line.tone === 'destructive')
    ? 'destructive'
    : lines.some((line) => line.tone === 'warning')
      ? 'warning'
      : 'muted';
  const total = lines.reduce((sum, line) => sum + line.count, 0);

  return (
    <Card data-testid="dashboard-attention">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>{t('Pages.Dashboard.attention.title')}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {lines.length > 0 ? (
          <Badge
            variant={worst === 'destructive' ? 'destructive' : 'secondary'}
            className={cn(
              worst === 'warning' &&
                'bg-warning-subtle text-warning-subtle-foreground',
            )}
          >
            {t('Pages.Dashboard.attention.items', { count: total })}
          </Badge>
        ) : (
          <Badge variant="success">
            {t('Pages.Dashboard.attention.allClear')}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {lines.length === 0 ? (
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-success-subtle text-success-subtle-foreground">
              <Check className="size-4" aria-hidden />
            </span>
            <p className="text-sm text-muted-foreground">
              {t('Pages.Dashboard.attention.checkedAt', {
                time: checkedAt,
                checks: checked.join(' · '),
              })}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {lines.map((line) => (
              <li
                key={line.id}
                className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 py-3 first:pt-0"
                data-tone={line.tone}
              >
                <span
                  className={cn('size-2.5 rounded-full', DOT_TONE[line.tone])}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="font-semibold">{line.title}</p>
                  {line.detail ? (
                    <p className="truncate text-sm text-muted-foreground">
                      {line.detail}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  {line.count > 1 ? (
                    <span className="text-lg font-semibold tabular-nums">
                      {line.count}
                    </span>
                  ) : null}
                  {line.action ? (
                    <Link
                      to={line.action.to}
                      className={cn(
                        buttonVariants({ variant: 'outline', size: 'sm' }),
                      )}
                    >
                      {line.action.label}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {lines.length > 0 && checked.length > 0 ? (
          <p className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <Check
              className="size-3.5 text-success-subtle-foreground"
              aria-hidden
            />
            {t('Pages.Dashboard.attention.alsoChecked', {
              checks: checked.join(' · '),
            })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
