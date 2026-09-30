import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, ListFilter, Search, Server, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AuditFilters, AuditTrailOption } from '../audit-trail.types';
import { AuditFilterDropdown } from './audit-trail-filter-dropdown';
import {
  AuditStatusFilter,
  AuditTimeRangeFilter,
} from './audit-trail-segmented-filters';

interface AuditTrailToolbarProps {
  filters: AuditFilters;
  onChange: (patch: Partial<AuditFilters>) => void;
  eventTypeOptions: AuditTrailOption[];
  instanceOptions: AuditTrailOption[];
  customerOptions: AuditTrailOption[];
  shown: number;
  total: number;
  hasActiveFilters: boolean;
  onReset: () => void;
}

export function AuditTrailToolbar({
  filters,
  onChange,
  eventTypeOptions,
  instanceOptions,
  customerOptions,
  shown,
  total,
  hasActiveFilters,
  onReset,
}: AuditTrailToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      {/* Search + both toggle filters (status, time range) stay together so the
          quick toggles read as one group, separated from the dropdown filters. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('Pages.AuditTrail.table.searchPlaceholder')}
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AuditStatusFilter
            value={filters.status}
            onChange={(status) => onChange({ status })}
          />
          <AuditTimeRangeFilter
            value={filters.range}
            onChange={(range) => onChange({ range })}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AuditFilterDropdown
          icon={ListFilter}
          label={t('Pages.AuditTrail.table.filters.eventType')}
          allLabel={t('Pages.AuditTrail.table.filters.allEvents')}
          value={filters.eventType}
          options={eventTypeOptions}
          onChange={(eventType) => onChange({ eventType })}
        />
        <AuditFilterDropdown
          icon={Server}
          label={t('Pages.AuditTrail.table.headers.instance')}
          allLabel={t('Pages.AuditTrail.table.filters.allInstances')}
          value={filters.instance}
          options={instanceOptions}
          onChange={(instance) => onChange({ instance })}
        />
        <AuditFilterDropdown
          icon={Building2}
          label={t('Pages.AuditTrail.table.headers.customer')}
          allLabel={t('Pages.AuditTrail.table.filters.allCustomers')}
          value={filters.customer}
          options={customerOptions}
          onChange={(customer) => onChange({ customer })}
        />

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {shown === total
              ? t('Pages.AuditTrail.feed.eventsCount', {
                  count: total,
                })
              : t('Pages.AuditTrail.table.filters.shownOfTotal', {
                  shown,
                  total,
                })}
          </span>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="gap-1.5 text-muted-foreground"
            >
              <X className="size-3.5" />
              {t('Pages.AuditTrail.table.filters.clear')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
