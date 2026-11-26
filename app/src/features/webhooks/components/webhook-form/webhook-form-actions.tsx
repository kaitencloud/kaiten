import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { WebhookFormApi } from '../../hooks/use-webhook-form';
import type { WebhookFormValues } from '../../schemas';

type WebhookFormActionsProps = {
  form: WebhookFormApi;
  isEditMode: boolean;
  /** Whether these values would send what the page opened with. */
  isUnchanged: (values: WebhookFormValues) => boolean;
  onCancel: () => void;
  className?: string;
};

/**
 * Cancel, and Create or Save. "Nothing to save" compares the body the values
 * would send with the one the page opened with, not the stock pristine check:
 * TanStack Form keeps `isDirty` once a field changed, even when the value comes
 * back, so an event unticked then ticked again, or "keep every event" unticked
 * then ticked again, would leave Save on for a PUT that changes nothing.
 */
export function WebhookFormActions({
  form,
  isEditMode,
  isUnchanged,
  onCancel,
  className,
}: WebhookFormActionsProps) {
  const { t } = useTranslation();
  const label = isEditMode
    ? t('Common.save')
    : t('Pages.Integrations.Webhooks.Form.createButton');

  return (
    <div
      className={cn('flex flex-wrap items-center justify-end gap-3', className)}
    >
      <Button type="button" variant="outline" onClick={onCancel}>
        {t('Common.cancel')}
      </Button>
      <form.Subscribe selector={(state) => isUnchanged(state.values)}>
        {(unchanged) => (
          <form.SubmitButton label={label} disabled={unchanged} />
        )}
      </form.Subscribe>
    </div>
  );
}
