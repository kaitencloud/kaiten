import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DashboardFeatureFlags } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { type ActivityWindows, windowPhrase } from '../logic/activity';
import { compactCount } from '../logic/format';

const ROWS = 8;

/** Evaluations per flag over the audit trail's window, the most evaluated first; a flag nobody evaluates asks to be retired. */
export function FlagEvaluationsCard({
  flags,
  windows,
}: {
  flags: DashboardFeatureFlags;
  windows: ActivityWindows;
}) {
  const { t } = useTranslation();
  const largest = Math.max(1, ...flags.perFlag.map((flag) => flag.evaluations));
  const shown = flags.perFlag.slice(0, ROWS);

  return (
    <Card data-testid="dashboard-flag-evaluations" className="h-full">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>{t('Pages.Dashboard.flags.title')}</CardTitle>
          <CardDescription>
            {t('Pages.Dashboard.flags.description', {
              window: windowPhrase(t, windows.auditTrail, windows.period),
            })}
          </CardDescription>
        </div>
        <Link
          to="/feature-flags"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-subtle-foreground"
        >
          {t('Pages.Dashboard.flags.viewAll')}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Dashboard.flags.empty')}
          </p>
        ) : (
          <ul className="space-y-3">
            {shown.map((flag) => (
              <li key={flag.slug}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-mono text-xs">
                    {flag.slug}
                  </span>
                  <span className="flex items-center gap-2">
                    {flag.evaluations === 0 ? (
                      <>
                        <Badge
                          variant="outline"
                          className="border-transparent bg-warning-subtle text-warning-subtle-foreground shadow-none"
                        >
                          {t('Pages.Dashboard.flags.retire')}
                        </Badge>
                        <span className="font-medium text-warning-subtle-foreground">
                          {t('Pages.Dashboard.flags.never')}
                        </span>
                      </>
                    ) : (
                      <span className="font-semibold tabular-nums">
                        {compactCount(flag.evaluations)}
                      </span>
                    )}
                  </span>
                </div>
                <div
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full bg-chart-2"
                    style={{ width: `${(flag.evaluations / largest) * 100}%` }}
                  />
                </div>
                {!flag.enabled ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('Pages.Dashboard.flags.disabled')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
