import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { WebhookFormApi } from '../../hooks/use-webhook-form';
import { WebhookEventPicker } from './event-picker';

type WebhookEventsFieldProps = {
  form: WebhookFormApi;
  retainedTypes: readonly string[];
  hasNoEventFilter: boolean;
  className?: string;
};

/**
 * The `eventTypes` field: the picker, with the field's error under it and
 * linked to it. A webhook made without an event filter receives every event:
 * the page says so rather than show an empty picker as if it received none.
 */
export function WebhookEventsField({
  form,
  retainedTypes,
  hasNoEventFilter,
  className,
}: WebhookEventsFieldProps) {
  const { t } = useTranslation();

  return (
    <form.AppField name="eventTypes">
      {() => (
        <FormField<string[]> className={className}>
          {(field) => (
            <>
              {hasNoEventFilter ? (
                <Alert role="status">
                  <Info aria-hidden />
                  <AlertDescription>
                    {t(
                      'Pages.Integrations.Webhooks.Form.events.noFilterNotice',
                    )}
                  </AlertDescription>
                </Alert>
              ) : null}
              <FormControl announceRequired={false}>
                <WebhookEventPicker
                  value={field.value}
                  onChange={field.handleChange}
                  retainedTypes={retainedTypes}
                />
              </FormControl>
            </>
          )}
        </FormField>
      )}
    </form.AppField>
  );
}
