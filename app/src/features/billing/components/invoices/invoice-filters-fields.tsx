import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  getHandoffStatusLabelKey,
  getInvoiceKindLabelKey,
  getInvoiceStatusLabelKey,
  getProviderKindLabelKey,
  INVOICE_KINDS,
  INVOICE_PROVIDER_KINDS,
  INVOICE_STATUSES,
  type InvoiceStatus,
  HANDOFF_STATUSES,
  PeriodFilter,
} from '@/domains/billing';
import type { InvoiceFilters } from '../../schemas/invoice-filters.schema';
import { FilterChoice } from './filter-choice';
import { SlugFilterInput } from './slug-filter-input';

type InvoiceFiltersFieldsProps = {
  filters: InvoiceFilters;
  onChange: (filters: InvoiceFilters) => void;
  /** Whether Stripe collects invoices here: with NoOp alone there is no provider to choose. */
  showProvider: boolean;
};

function StatusChoice({
  onChange,
  value,
}: {
  onChange: (statuses: InvoiceStatus[] | undefined) => void;
  value: InvoiceStatus[] | undefined;
}) {
  const { t } = useTranslation();
  const selected = value ?? [];

  const toggle = (status: InvoiceStatus, checked: boolean) => {
    const next = checked
      ? [...selected, status]
      : selected.filter((candidate) => candidate !== status);

    onChange(next.length > 0 ? next : undefined);
  };

  function renderStatus(status: InvoiceStatus) {
    return (
      <label className="flex items-center gap-2 text-sm" key={status}>
        <Checkbox
          checked={selected.includes(status)}
          onCheckedChange={(checked) => toggle(status, checked)}
        />
        {t(getInvoiceStatusLabelKey(status))}
      </label>
    );
  }

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium text-muted-foreground">
        {t('Pages.Billing.Invoices.Filters.status')}
      </legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {INVOICE_STATUSES.map(renderStatus)}
      </div>
    </fieldset>
  );
}

function SwitchFilter({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

/**
 * Every filter of the list, in the panel the Filters button opens. Each one writes
 * to the URL as it is set, and the list follows: nothing is applied by a separate
 * button.
 */
export function InvoiceFiltersFields({
  filters,
  onChange,
  showProvider,
}: InvoiceFiltersFieldsProps) {
  const { t } = useTranslation();
  const set = (patch: Partial<InvoiceFilters>) =>
    onChange({ ...filters, ...patch });

  return (
    <div className="space-y-4">
      <StatusChoice
        onChange={(status) => set({ status })}
        value={filters.status}
      />
      <FilterChoice
        label={t('Pages.Billing.Invoices.Filters.kind')}
        onChange={(kind) => set({ kind })}
        options={INVOICE_KINDS.map((kind) => ({
          label: t(getInvoiceKindLabelKey(kind)),
          value: kind,
        }))}
        value={filters.kind}
      />
      <FilterChoice
        label={t('Pages.Billing.Invoices.Filters.handoff')}
        onChange={(handoffStatus) => set({ handoffStatus })}
        options={HANDOFF_STATUSES.map((status) => ({
          label: t(getHandoffStatusLabelKey(status)),
          value: status,
        }))}
        value={filters.handoffStatus}
      />
      {showProvider ? (
        <FilterChoice
          label={t('Pages.Billing.Invoices.Filters.provider')}
          onChange={(providerKind) => set({ providerKind })}
          options={INVOICE_PROVIDER_KINDS.map((kind) => ({
            label: t(getProviderKindLabelKey(kind)),
            value: kind,
          }))}
          value={filters.providerKind}
        />
      ) : null}
      <SwitchFilter
        checked={filters.overdue === true}
        label={t('Pages.Billing.Invoices.Filters.overdueOnly')}
        onChange={(checked) => set({ overdue: checked ? true : undefined })}
      />
      <SwitchFilter
        checked={filters.held === true}
        label={t('Pages.Billing.Invoices.Filters.heldOnly')}
        onChange={(checked) => set({ held: checked ? true : undefined })}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SlugFilterInput
          label={t('Pages.Billing.Invoices.Filters.customer')}
          onCommit={(customerSlug) => set({ customerSlug })}
          placeholder={t('Pages.Billing.Invoices.Filters.slugPlaceholder')}
          value={filters.customerSlug}
        />
        <SlugFilterInput
          label={t('Pages.Billing.Invoices.Filters.instance')}
          onCommit={(instanceSlug) => set({ instanceSlug })}
          placeholder={t('Pages.Billing.Invoices.Filters.slugPlaceholder')}
          value={filters.instanceSlug}
        />
      </div>
      <PeriodFilter
        from={filters.boundaryFrom}
        label={t('Pages.Billing.Invoices.Filters.boundary')}
        onChange={({ from, to }) => set({ boundaryFrom: from, boundaryTo: to })}
        to={filters.boundaryTo}
      />
      <PeriodFilter
        from={filters.issuedFrom}
        label={t('Pages.Billing.Invoices.Filters.issued')}
        onChange={({ from, to }) => set({ issuedFrom: from, issuedTo: to })}
        to={filters.issuedTo}
      />
    </div>
  );
}
