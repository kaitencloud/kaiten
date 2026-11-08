import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DashboardIntegrations } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatRelativeTimeToNow } from '@/lib/feed-time';
import { cn } from '@/lib/utils';

const BADGE = {
  ok: 'border-transparent bg-success-subtle text-success-subtle-foreground shadow-none',
  warn: 'border-transparent bg-warning-subtle text-warning-subtle-foreground shadow-none',
  off: 'border-transparent bg-muted text-muted-foreground shadow-none',
} as const;

/** Who talks to Kaiten: service accounts, publishable keys, connectors. */
export function IntegrationsCard({
  integrations,
  locale,
}: {
  integrations: DashboardIntegrations;
  locale: string;
}) {
  const { t } = useTranslation();
  const expiring = integrations.tokensExpiring30Days;

  return (
    <Card data-testid="dashboard-integrations" className="h-full">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>{t('Pages.Dashboard.integrations.title')}</CardTitle>
          <CardDescription>
            {t('Pages.Dashboard.integrations.description')}
          </CardDescription>
        </div>
        <Link
          to="/integrations"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-subtle-foreground"
        >
          {t('Pages.Dashboard.integrations.viewAll')}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          <Row
            to="/integrations/service-accounts"
            name={t('Pages.Dashboard.integrations.serviceAccounts')}
            detail={t('Pages.Dashboard.integrations.serviceAccountsDetail', {
              accounts: integrations.serviceAccounts,
              tokens: integrations.activeTokens,
              noExpiry: integrations.tokensWithoutExpiry,
            })}
            badge={
              expiring > 0
                ? {
                    className: BADGE.warn,
                    label: t('Pages.Dashboard.integrations.expiring', {
                      count: expiring,
                    }),
                  }
                : {
                    className: BADGE.ok,
                    label: t('Pages.Dashboard.integrations.healthy'),
                  }
            }
          />
          <Row
            to="/integrations/publishable-keys"
            name={t('Pages.Dashboard.integrations.publishableKeys')}
            detail={
              integrations.publishableKeyLastUsedAt
                ? t('Pages.Dashboard.integrations.lastUsed', {
                    when: formatRelativeTimeToNow(
                      integrations.publishableKeyLastUsedAt,
                      locale,
                    ),
                  })
                : t('Pages.Dashboard.integrations.neverUsed')
            }
            badge={{
              className:
                integrations.publishableKeys > 0 ? BADGE.ok : BADGE.off,
              label: String(integrations.publishableKeys),
            }}
          />
          {integrations.connectors.map((connector) => (
            <Row
              key={connector.name}
              to="/integrations/connectors"
              name={connector.name}
              detail={
                connector.activated && connector.activatedAt
                  ? formatRelativeTimeToNow(connector.activatedAt, locale)
                  : t('Pages.Dashboard.integrations.connectors')
              }
              badge={
                connector.activated
                  ? {
                      className: BADGE.ok,
                      label: t('Pages.Dashboard.integrations.activated'),
                    }
                  : {
                      className: BADGE.off,
                      label: t('Pages.Dashboard.integrations.off'),
                    }
              }
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Row({
  to,
  name,
  detail,
  badge,
}: {
  to: string;
  name: string;
  detail: string;
  badge: { className: string; label: string };
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <Link to={to} className="font-medium hover:underline">
          {name}
        </Link>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <Badge variant="outline" className={cn(badge.className)}>
        {badge.label}
      </Badge>
    </li>
  );
}
