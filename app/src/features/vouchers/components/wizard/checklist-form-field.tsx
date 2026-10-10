import { useTranslation } from 'react-i18next';
import FormField from '@/components/form/fields/form-field';
import { PagedListSkeleton, RetryableProblem } from '@/domains/billing';
import {
  type ChecklistOption,
  ReferenceChecklist,
} from './reference-checklist';

type ChecklistFormFieldProps = {
  description: string;
  label: string;
  /** The choices, from what the console read; none when it could not read. */
  options: readonly ChecklistOption[];
  /** The read the choices come from, for what to say while it is not there. */
  query: {
    data: unknown;
    error: unknown;
    fetchStatus: 'fetching' | 'idle' | 'paused';
    isError: boolean;
    refetch: () => unknown;
  };
};

/**
 * A checklist as a field of the form (inside the `AppField` of the list it fills): it
 * draws rows to be while it loads, says why it could not read with a way to ask again,
 * and, for a session that may not read what it lists, says so and keeps what is already
 * checked, listed by its id, since a limit the person cannot see must still be one they
 * can lift.
 */
export function ChecklistFormField({
  description,
  label,
  options,
  query,
}: ChecklistFormFieldProps) {
  const { t } = useTranslation();

  return (
    <FormField<string[]> description={description} label={label}>
      {(field) => {
        if (query.isError) {
          return (
            <RetryableProblem
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          );
        }
        if (query.data === undefined && query.fetchStatus !== 'idle') {
          return (
            <PagedListSkeleton
              label={t('Pages.Vouchers.Wizard.Checklist.loading')}
              rowClassName="h-7"
              rows={3}
            />
          );
        }

        return (
          <div className="space-y-2">
            {query.data === undefined ? (
              <p className="text-sm text-muted-foreground">
                {t('Pages.Vouchers.Wizard.Checklist.notAllowed')}
              </p>
            ) : null}
            {options.length > 0 || field.value.length > 0 ? (
              <ReferenceChecklist
                label={label}
                onChange={field.handleChange}
                options={options}
                value={field.value}
              />
            ) : null}
          </div>
        );
      }}
    </FormField>
  );
}
