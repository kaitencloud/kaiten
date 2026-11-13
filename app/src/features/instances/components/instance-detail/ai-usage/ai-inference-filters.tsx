import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiInference } from '@/api-client';
import { DateTimePicker } from '@/components/date-time-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AI_REQUEST_TYPES } from './engine';
import type { AiUsageSearch } from './ai-usage-search';

const ALL = '__all__';
const STATUSES: AiInference['status'][] = [
  'RESERVED',
  'COMMITTED',
  'RELEASED',
  'EXPIRED',
];
const DEBOUNCE_MS = 300;

type Option = { value: string; label: string };

type FilterSelectProps = {
  label: string;
  allLabel: string;
  options: Option[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
};

function renderOption(option: Option) {
  return (
    <SelectItem key={option.value} value={option.value}>
      {option.label}
    </SelectItem>
  );
}

function FilterSelect({
  label,
  allLabel,
  options,
  value,
  onChange,
}: FilterSelectProps) {
  const id = useId();
  const items = [{ value: ALL, label: allLabel }, ...options];

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        items={items}
        value={value ?? ALL}
        onValueChange={(next) =>
          onChange(next === null || next === ALL ? undefined : String(next))
        }
      >
        <SelectTrigger id={id} className="h-10 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{items.map(renderOption)}</SelectContent>
      </Select>
    </div>
  );
}

/** The transaction id, sent to the API once typing pauses. */
function TransactionFilter({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [draft, setDraft] = useState({ text: value ?? '', source: value });
  // The URL changed from elsewhere (Clear filters, Back): show what it holds.
  if (draft.source !== value) {
    setDraft({
      text: (value ?? '') === draft.text.trim() ? draft.text : (value ?? ''),
      source: value,
    });
  }
  const text = draft.text;
  useEffect(() => {
    const next = text.trim() || undefined;
    if (next === value) {
      return undefined;
    }
    const timer = window.setTimeout(() => onChange(next), DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [text, value, onChange]);

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{t('AI.Usage.transaction')}</Label>
      <Input
        id={id}
        className="h-10 font-mono"
        autoComplete="off"
        spellCheck={false}
        value={text}
        onChange={(event) =>
          setDraft({ text: event.target.value, source: value })
        }
      />
    </div>
  );
}

function DateFilter({
  label,
  value,
  invalid,
  errorId,
  onChange,
}: {
  label: string;
  value: string | undefined;
  invalid: boolean;
  errorId: string;
  onChange: (value: string | undefined) => void;
}) {
  const id = useId();

  return (
    <div className="min-w-0 space-y-1.5">
      <Label id={id}>{label}</Label>
      <DateTimePicker
        groupLabelledBy={id}
        value={value ?? ''}
        onChange={(next) => onChange(next || undefined)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
      />
    </div>
  );
}

type AiInferenceFiltersProps = {
  search: AiUsageSearch;
  /** The names a model can be sent under (`modelFilterOptions`). */
  models: string[];
  invalidRange: boolean;
  errorId: string;
  onChange: (patch: Partial<AiUsageSearch>) => void;
};

/**
 * The feed's filters, held in the URL. Each one is sent to the API (see
 * `inference-filters.ts`).
 */
export function AiInferenceFilters({
  search,
  models,
  invalidRange,
  errorId,
  onChange,
}: AiInferenceFiltersProps) {
  const { t } = useTranslation();

  return (
    <div
      role="search"
      aria-label={t('AI.Usage.filters')}
      className="grid min-w-0 gap-3 rounded-lg border bg-background p-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <FilterSelect
        label={t('AI.status')}
        allLabel={t('AI.Usage.allStatuses')}
        options={STATUSES.map((value) => ({
          value,
          label: t(`AI.Usage.states.${value}`),
        }))}
        value={search.status}
        onChange={(status) =>
          onChange({ status: status as AiInference['status'] | undefined })
        }
      />
      <FilterSelect
        label={t('AI.Usage.modelSent')}
        allLabel={t('AI.Usage.allModels')}
        options={models.map((value) => ({ value, label: value }))}
        value={search.model}
        onChange={(model) => onChange({ model })}
      />
      <FilterSelect
        label={t('AI.Usage.requestType')}
        allLabel={t('AI.Usage.allTypes')}
        options={AI_REQUEST_TYPES.map((value) => ({
          value,
          label: t(`AI.Usage.requestTypes.${value}`),
        }))}
        value={search.type}
        onChange={(type) =>
          onChange({ type: type as AiInference['requestType'] | undefined })
        }
      />
      <FilterSelect
        label={t('AI.Usage.authorization')}
        allLabel={t('AI.Usage.allAuthorizations')}
        options={[
          { value: 'yes', label: t('AI.Usage.authorizedOnly') },
          { value: 'no', label: t('AI.Usage.notAuthorizedOnly') },
        ]}
        value={search.auth}
        onChange={(auth) =>
          onChange({ auth: auth as 'yes' | 'no' | undefined })
        }
      />
      <TransactionFilter
        value={search.tx}
        onChange={(tx) => onChange({ tx })}
      />
      <DateFilter
        label={t('AI.Usage.from')}
        value={search.from}
        invalid={invalidRange}
        errorId={errorId}
        onChange={(from) => onChange({ from })}
      />
      <DateFilter
        label={t('AI.Usage.to')}
        value={search.to}
        invalid={invalidRange}
        errorId={errorId}
        onChange={(to) => onChange({ to })}
      />
    </div>
  );
}
