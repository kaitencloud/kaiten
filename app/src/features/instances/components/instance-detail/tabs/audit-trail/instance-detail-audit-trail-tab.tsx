import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Activity, Clock, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAuditTrailsOptions } from '@/api-client/@tanstack/react-query.gen';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getEventCategory, resolveEventLabel } from '@/domains/audit-trail';
import { buildInstanceEntitlementGroupOptions } from '../../../../utils/instance-detail-entitlements.utils';
import { TableCard } from '@/functionals/table';
import { EntitlementGroupFilterSelect } from '../../entitlement-group-filter-select';
import { useInstanceDetail } from '../../instance-detail-context';
import {
  buildAuditTrailEventOptions,
  filterAuditTrailEntries,
  hasActiveAuditTrailFilters,
} from './audit-trail.utils';
import { AuditTrailChartsSection } from './audit-trail-charts-section';
import { buildAuditTrailColumns } from './audit-trail-columns';
import { AuditTrailHowItWorks } from './audit-trail-how-it-works';
import { AuditTrailStatsCards } from './audit-trail-stats-cards';

function renderOption(
  option: ReturnType<typeof buildAuditTrailEventOptions>[number],
) {
  return (
    <SelectItem key={option.value} value={option.value}>
      {option.label}
    </SelectItem>
  );
}

function AuditTrailEventFilterSelect({
  options,
  value,
  onChange,
}: {
  onChange: (value: string) => void;
  options: ReturnType<typeof buildAuditTrailEventOptions>;
  value: string;
}) {
  const { t } = useTranslation();

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className="w-full md:w-55"
        aria-label={t(
          'Pages.Customers.Instances.Detail.auditTrail.table.filters.eventFilterLabel',
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">
          {t(
            'Pages.Customers.Instances.Detail.auditTrail.table.filters.allEvents',
          )}
        </SelectItem>
        {options.map(renderOption)}
      </SelectContent>
    </Select>
  );
}

function AuditTrailStatusFilterSelect({
  value,
  onChange,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useTranslation();

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className="w-full md:w-45"
        aria-label={t(
          'Pages.Customers.Instances.Detail.auditTrail.table.filters.statusFilterLabel',
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">
          {t(
            'Pages.Customers.Instances.Detail.auditTrail.table.filters.allStatuses',
          )}
        </SelectItem>
        <SelectItem value="read">
          {t('Pages.Customers.Instances.Detail.auditTrail.table.filters.read')}
        </SelectItem>
        <SelectItem value="accepted">
          {t(
            'Pages.Customers.Instances.Detail.auditTrail.table.filters.accepted',
          )}
        </SelectItem>
        <SelectItem value="rejected">
          {t(
            'Pages.Customers.Instances.Detail.auditTrail.table.filters.rejected',
          )}
        </SelectItem>
        <SelectItem value="warning">
          {t(
            'Pages.Customers.Instances.Detail.auditTrail.table.filters.warning',
          )}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function AuditTrailFilterSummary({
  filteredCount,
  onReset,
}: {
  filteredCount: number;
  onReset: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 border-t px-6 py-3">
      <span className="text-xs text-muted-foreground">
        {t(
          'Pages.Customers.Instances.Detail.auditTrail.table.filters.resultsCount',
          {
            count: filteredCount,
          },
        )}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7"
        onClick={onReset}
      >
        {t('Pages.Customers.Instances.Detail.auditTrail.table.filters.clear')}
      </Button>
    </div>
  );
}

export const InstanceDetailAuditTrailTab = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const { entitlementsRows, instance } = useInstanceDetail();
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const auditTrailQuery = getAuditTrailsOptions({
    path: { instanceSlug: instance.slug! },
    query: { limit: 200 },
  });
  const { data: auditTrails } = useSuspenseQuery({
    ...auditTrailQuery,
    refetchInterval: 30_000,
  });
  const entries = useMemo(
    () =>
      [...(auditTrails?.items ?? [])].sort(
        (left, right) =>
          new Date(right.timestamp).getTime() -
          new Date(left.timestamp).getTime(),
      ),
    [auditTrails],
  );
  const eventOptions = useMemo(
    () =>
      buildAuditTrailEventOptions(entries, (eventName) =>
        resolveEventLabel(eventName, t),
      ),
    [entries, t],
  );
  const groupOptions = useMemo(
    () => buildInstanceEntitlementGroupOptions(entitlementsRows),
    [entitlementsRows],
  );
  const filteredEntries = useMemo(
    () =>
      filterAuditTrailEntries(
        entries,
        {
          eventFilter,
          groupFilter,
          searchQuery,
          statusFilter,
        },
        (eventName) => resolveEventLabel(eventName, t),
        entitlementsRows,
      ),
    [
      entries,
      entitlementsRows,
      eventFilter,
      groupFilter,
      searchQuery,
      statusFilter,
      t,
    ],
  );
  const columns = useMemo(
    () =>
      buildAuditTrailColumns(
        t,
        locale,
        entitlementsRows,
        instance.name ?? instance.slug ?? '',
      ),
    [entitlementsRows, instance.name, instance.slug, locale, t],
  );
  const filtersAreActive = hasActiveAuditTrailFilters({
    eventFilter,
    groupFilter,
    searchQuery,
    statusFilter,
  });
  const tableResetKey = `${eventFilter}::${groupFilter}::${searchQuery}::${statusFilter}`;

  function resetFilters() {
    setEventFilter('all');
    setGroupFilter('all');
    setSearchQuery('');
    setStatusFilter('all');
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <AuditTrailStatsCards entries={entries} />
      <AuditTrailChartsSection
        entitlementsRows={entitlementsRows}
        entries={entries}
        locale={locale}
      />

      <TableCard>
        <TableCard.Header className="flex items-start justify-between gap-4">
          <TableCard.HeaderLeading>
            <TableCard.HeaderIcon>
              <Activity className="size-5" />
            </TableCard.HeaderIcon>
            <TableCard.HeaderHeading>
              <TableCard.HeaderTitle>
                {t('Pages.Customers.Instances.Detail.auditTrail.table.title')}
              </TableCard.HeaderTitle>
              <TableCard.HeaderSubtitle>
                {t(
                  'Pages.Customers.Instances.Detail.auditTrail.table.description',
                )}
              </TableCard.HeaderSubtitle>
            </TableCard.HeaderHeading>
          </TableCard.HeaderLeading>
          <TableCard.HeaderActions>
            <Badge variant="outline" className="gap-1">
              <Clock className="size-3" />
              {t(
                'Pages.Customers.Instances.Detail.auditTrail.table.autoRefresh',
              )}
            </Badge>
          </TableCard.HeaderActions>
        </TableCard.Header>
        <TableCard.Toolbar>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder={t(
                'Pages.Customers.Instances.Detail.auditTrail.table.searchPlaceholder',
              )}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <EntitlementGroupFilterSelect
              allGroupsLabel={t(
                'Pages.Customers.Instances.Detail.auditTrail.table.filters.allGroups',
              )}
              ariaLabel={t(
                'Pages.Customers.Instances.Detail.auditTrail.table.filters.groupFilterLabel',
              )}
              onChange={setGroupFilter}
              options={groupOptions}
              value={groupFilter}
            />
            <AuditTrailEventFilterSelect
              options={eventOptions}
              value={eventFilter}
              onChange={setEventFilter}
            />
            <AuditTrailStatusFilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </div>
        </TableCard.Toolbar>
        {filtersAreActive ? (
          <AuditTrailFilterSummary
            filteredCount={filteredEntries.length}
            onReset={resetFilters}
          />
        ) : null}
        <TableCard.Table
          key={tableResetKey}
          columns={columns}
          data={filteredEntries}
          emptyMessage={t(
            'Pages.Customers.Instances.Detail.auditTrail.table.empty',
          )}
          getRowClassName={(entry) =>
            getEventCategory(entry.eventName) === 'rejected'
              ? 'bg-destructive/5'
              : undefined
          }
          pagination={{ defaultPageSize: 5 }}
          variant="simple"
        />
      </TableCard>

      <AuditTrailHowItWorks />
    </div>
  );
};
