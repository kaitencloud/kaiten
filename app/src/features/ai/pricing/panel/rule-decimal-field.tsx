import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { readDecimalInput } from '../engine';

/** What a field of the form hands to its input (TanStack Form's field API). */
type DecimalFieldApi = {
  handleBlur: () => void;
  handleChange: (value: string | null) => void;
  state: {
    meta: { errors: readonly ({ message?: string } | undefined)[] };
    value: string | null | undefined;
  };
};

type RuleDecimalFieldProps = {
  disabled?: boolean;
  /** Said under the field when what is typed is not a decimal the API takes. */
  errorKey: string;
  field: DecimalFieldApi;
  /** The name of the field in the API, under the label. */
  hint?: string;
  label: string;
  /** `row`: the label left of a narrow input; `stack`: the label above it. */
  layout?: 'row' | 'stack';
  placeholder: string;
};

/**
 * A decimal of a rule, typed as text so that no digit is lost to a float. A
 * blank field is `null`, which the API reads as "no rate" or "no bound": it is
 * never sent as an empty string, and never as 0.
 */
export function RuleDecimalField({
  disabled = false,
  errorKey,
  field,
  hint,
  label,
  layout = 'row',
  placeholder,
}: RuleDecimalFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const errorId = useId();
  const [issue] = field.state.meta.errors;
  const message = issue
    ? t(issue.message?.startsWith('AI.Panel.') ? issue.message : errorKey)
    : null;

  return (
    <div
      className={cn(
        'grid gap-x-3 gap-y-1',
        layout === 'row'
          ? 'grid-cols-[minmax(0,1fr)_8.5rem] items-center'
          : 'grid-cols-1',
      )}
    >
      <Label className="flex-col items-start gap-0 font-normal" htmlFor={id}>
        <span className="text-[0.8125rem]">{label}</span>
        {hint ? (
          <span className="font-mono text-[0.6875rem] text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </Label>
      <Input
        aria-describedby={message ? errorId : undefined}
        aria-invalid={message !== null}
        autoComplete="off"
        className="h-8 text-right text-[0.8125rem] tabular-nums"
        disabled={disabled}
        id={id}
        inputMode="decimal"
        onBlur={field.handleBlur}
        onChange={(event) => {
          // A decimal comma is a point, as in every decimal field here.
          const text = readDecimalInput(event.target.value);
          field.handleChange(text === '' ? null : text);
        }}
        placeholder={placeholder}
        value={field.state.value ?? ''}
      />
      {message ? (
        <p
          className={cn(
            'text-xs text-destructive-subtle-foreground',
            layout === 'row' && 'col-span-2 text-right',
          )}
          id={errorId}
          role="alert"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
