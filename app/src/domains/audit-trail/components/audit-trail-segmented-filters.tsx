import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { AuditTimeRange } from '../audit-trail.types';

interface SegmentedOption {
  value: string;
  label: string;
}

// Small pill segmented control (single-select) used for the status and
// time-range quick filters. Kept feature-local — it matches the audit feed's
// toolbar styling rather than the heavier shared ToggleGroup.
function AuditSegmentedFilter({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  options: SegmentedOption[];
  onChange: (value: string) => void;
}) {
  const renderOption = (option: SegmentedOption) => (
    <button
      key={option.value}
      type="button"
      aria-pressed={option.value === value}
      onClick={() => onChange(option.value)}
      className={cn(
        'rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors',
        option.value === value
          ? 'bg-secondary text-secondary-foreground shadow-xs'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {option.label}
    </button>
  );

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-0.5 rounded-md border bg-background p-0.5"
    >
      {options.map(renderOption)}
    </div>
  );
}

export function AuditStatusFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const options: SegmentedOption[] = [
    { value: 'all', label: t('Pages.AuditTrail.table.filters.all') },
    {
      value: 'accepted',
      label: t('Pages.AuditTrail.table.filters.accepted'),
    },
    {
      value: 'rejected',
      label: t('Pages.AuditTrail.table.filters.rejected'),
    },
    {
      value: 'warning',
      label: t('Pages.AuditTrail.table.filters.warning'),
    },
    { value: 'read', label: t('Pages.AuditTrail.table.filters.read') },
  ];

  return (
    <AuditSegmentedFilter
      ariaLabel={t('Pages.AuditTrail.table.filters.statusFilterLabel')}
      value={value}
      options={options}
      onChange={onChange}
    />
  );
}

export function AuditTimeRangeFilter({
  value,
  onChange,
}: {
  value: AuditTimeRange;
  onChange: (value: AuditTimeRange) => void;
}) {
  const { t } = useTranslation();
  const options: SegmentedOption[] = [
    { value: '24h', label: t('Pages.AuditTrail.table.range.last24h') },
    { value: '7d', label: t('Pages.AuditTrail.table.range.last7d') },
    { value: '30d', label: t('Pages.AuditTrail.table.range.last30d') },
    { value: 'all', label: t('Pages.AuditTrail.table.range.all') },
  ];

  return (
    <AuditSegmentedFilter
      ariaLabel={t('Pages.AuditTrail.table.range.label')}
      value={value}
      options={options}
      onChange={(next) => onChange(next as AuditTimeRange)}
    />
  );
}
