import { useSuspenseQuery } from '@tanstack/react-query';
import { Gauge } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';
import { RouteTabs } from '@/functionals/route-tabs';
import { getAppLocale } from '@/lib/app-locale';
import { formatTimeOfDay } from '@/lib/feed-time';
import { activityWindows, retentionCutLines } from '../logic/activity';
import {
  buildCustomersAttention,
  buildIntegrationAttention,
} from '../logic/attention';
import { dashboardSummaryQueryOptions } from '../queries/dashboard-summary';
import {
  type DashboardRange,
  type DashboardView,
  toDashboardSearch,
} from '../search';
import { CustomersView } from './customers-view';
import { IntegrationView } from './integration-view';
import { RangeControl } from './range-control';

type DashboardPageProps = {
  view: DashboardView;
  range: DashboardRange;
  onRangeChange: (range: DashboardRange) => void;
};

/**
 * The console's home: two altitudes over one summary. Customers speaks to the
 * people who sell and support; Integration to the people who wired Kaiten in.
 * The route's loader has the summary ready; this reads it with Suspense.
 */
export function DashboardPage({
  view,
  range,
  onRangeChange,
}: DashboardPageProps) {
  const { t } = useTranslation();
  const locale = getAppLocale();
  const { data: summary } = useSuspenseQuery(
    dashboardSummaryQueryOptions(range),
  );
  const checkedAt = formatTimeOfDay(summary.asOf, locale);
  const cutLines = retentionCutLines(t, activityWindows(summary));
  const customersCount = buildCustomersAttention(
    summary,
    t,
    locale,
    null,
  ).reduce((sum, line) => sum + line.count, 0);
  const integrationCount = buildIntegrationAttention(summary, t, locale).reduce(
    (sum, line) => sum + line.count,
    0,
  );

  return (
    <Page layout="scroll">
      <Page.Fixed className="pb-2">
        <Page.Header>
          <Page.Leading>
            <Page.Icon>
              <Gauge
                className="size-8 text-primary-subtle-foreground"
                aria-hidden
              />
            </Page.Icon>
            <Page.Heading>
              <Page.Title>{t('Pages.Dashboard.title')}</Page.Title>
              <Page.Subtitle>{t('Pages.Dashboard.subtitle')}</Page.Subtitle>
            </Page.Heading>
          </Page.Leading>
          <Page.Actions className="flex flex-wrap items-center gap-3">
            <RangeControl value={range} onChange={onRangeChange} />
            <span className="text-sm text-muted-foreground">
              {t('Pages.Dashboard.range.asOf', { time: checkedAt })}
            </span>
          </Page.Actions>
        </Page.Header>
        <RouteTabs
          className="mt-4"
          tabs={[
            {
              id: 'customers',
              label: t('Pages.Dashboard.tabs.customers'),
              to: '/dashboard',
              search: toDashboardSearch({ range, view: 'customers' }),
              count: customersCount || undefined,
            },
            {
              id: 'integration',
              label: t('Pages.Dashboard.tabs.integration'),
              to: '/dashboard',
              search: toDashboardSearch({ range, view: 'integration' }),
              count: integrationCount || undefined,
            },
          ]}
        />
        {cutLines.length === 0 ? null : (
          <div
            data-testid="dashboard-activity-cut"
            className="mt-3 space-y-1 text-sm text-muted-foreground"
          >
            {cutLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
      </Page.Fixed>
      <Page.Scroll contentClassName="pt-2">
        {view === 'integration' ? (
          <IntegrationView
            summary={summary}
            locale={locale}
            checkedAt={checkedAt}
          />
        ) : (
          <CustomersView
            summary={summary}
            locale={locale}
            checkedAt={checkedAt}
          />
        )}
      </Page.Scroll>
    </Page>
  );
}
