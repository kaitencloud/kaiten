import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DateInputPicker } from '@/components/date-input-picker';
import {
  dateInputToInstant,
  instantToDateInput,
  isPeriodInvalid,
} from '@/lib/date-input';

type PeriodFilterProps = {
  from: string | undefined;
  label: string;
  onChange: (period: {
    from: string | undefined;
    to: string | undefined;
  }) => void;
  to: string | undefined;
};

/**
 * A period of the list, from a day up to the start of another, both read in UTC
 * as every billing period is: the second day is where the period ends, not a day
 * it covers. A period that ends before it starts is not applied, since the API
 * refuses it, and the field says so.
 */
export function PeriodFilter({ from, label, onChange, to }: PeriodFilterProps) {
  const { t } = useTranslation();
  const legendId = useId();
  const fromId = useId();
  const toId = useId();
  const [draftFrom, setDraftFrom] = useState(() => instantToDateInput(from));
  const [draftTo, setDraftTo] = useState(() => instantToDateInput(to));
  const [seen, setSeen] = useState({ from, to });

  // The period changed elsewhere (a chip took it off): follow it.
  if (seen.from !== from || seen.to !== to) {
    setSeen({ from, to });
    setDraftFrom(instantToDateInput(from));
    setDraftTo(instantToDateInput(to));
  }

  const nextFrom = dateInputToInstant(draftFrom);
  const nextTo = dateInputToInstant(draftTo);
  const invalid = isPeriodInvalid(nextFrom, nextTo);

  const apply = (inputFrom: string, inputTo: string) => {
    const start = dateInputToInstant(inputFrom);
    const end = dateInputToInstant(inputTo);

    if (!isPeriodInvalid(start, end)) {
      onChange({ from: start, to: end });
    }
  };

  return (
    <fieldset aria-labelledby={legendId} className="space-y-1.5">
      <legend
        className="text-xs font-medium text-muted-foreground"
        id={legendId}
      >
        {label}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={fromId}>
            {t('Features.Billing.PeriodFilter.from')}
          </label>
          <DateInputPicker
            className="min-w-0"
            id={fromId}
            onChange={(next) => {
              setDraftFrom(next);
              apply(next, draftTo);
            }}
            value={draftFrom}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor={toId}>
            {t('Features.Billing.PeriodFilter.before')}
          </label>
          <DateInputPicker
            aria-invalid={invalid}
            className="min-w-0"
            id={toId}
            onChange={(next) => {
              setDraftTo(next);
              apply(draftFrom, next);
            }}
            value={draftTo}
          />
        </div>
      </div>
      {invalid ? (
        <p className="text-xs text-destructive-subtle-foreground" role="alert">
          {t('Features.Billing.PeriodFilter.periodInvalid')}
        </p>
      ) : null}
    </fieldset>
  );
}
