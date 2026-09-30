import { Button } from '@/components/ui/button';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AuditTrailExportButton,
  AuditTrailList,
  AuditTrailStatsCards,
  GLOBAL_AUDIT_TRAIL_LIMIT,
  GLOBAL_AUDIT_TRAIL_MAX_LIMIT,
  globalAuditTrailQueryOptions,
  useAuditTrailFilters,
} from '@/domains/audit-trail';
import { Page } from '@/functionals/page';

export function AuditTrailPageContent() {
  const { t } = useTranslation();
  // The route prefetches the first window; "load more" widens it up to the
  // API's cap, keeping the previous rows on screen while the next arrive.
  const [limit, setLimit] = useState(GLOBAL_AUDIT_TRAIL_LIMIT);
  const { data, isFetching } = useQuery({
    ...globalAuditTrailQueryOptions(limit),
    placeholderData: keepPreviousData,
  });
  const entries = data ?? [];
  const filterState = useAuditTrailFilters(entries);
  const canLoadMore =
    entries.length >= limit && limit < GLOBAL_AUDIT_TRAIL_MAX_LIMIT;

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <ScrollText className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>{t('Pages.AuditTrail.title')}</Page.Title>
            <Page.Subtitle>{t('Pages.AuditTrail.subtitle')}</Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
        <Page.Actions>
          <AuditTrailExportButton
            entries={filterState.filteredEntries}
            getEventLabel={filterState.getEventLabel}
          />
        </Page.Actions>
      </Page.Header>

      <div className="mt-8">
        <AuditTrailStatsCards entries={entries} limit={limit} />
      </div>
      <div className="mt-6 min-h-0 flex-1">
        <AuditTrailList state={filterState} total={entries.length} />
      </div>
      {canLoadMore ? (
        <div className="flex shrink-0 justify-center py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={() =>
              setLimit((current) =>
                Math.min(
                  current + GLOBAL_AUDIT_TRAIL_LIMIT,
                  GLOBAL_AUDIT_TRAIL_MAX_LIMIT,
                ),
              )
            }
          >
            {t('Pages.AuditTrail.loadMore')}
          </Button>
        </div>
      ) : null}
    </Page>
  );
}
