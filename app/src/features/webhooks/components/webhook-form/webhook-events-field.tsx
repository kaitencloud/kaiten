import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';
import { cn } from '@/lib/utils';
import type { WebhookFormApi } from '../../hooks/use-webhook-form';
import { WebhookEventPicker } from './event-picker';
import { WebhookKeepEveryEventField } from './webhook-keep-every-event-field';

type WebhookEventsFieldProps = {
  form: WebhookFormApi;
  retainedTypes: readonly string[];
  hasNoEventFilter: boolean;
  className?: string;
};

/**
 * The `eventTypes` field: the picker, with the field's error under it and
 * linked to it. A webhook without an event filter receives every event: its
 * edit page first offers to keep it that way, and the picker is not shown
 * while it does, rather than show an empty picker as if it received none.
 * Unticked, the picker comes back, below the box's warning that saving
 * narrows the webhook for good.
 */
export function WebhookEventsField({
  form,
  retainedTypes,
  hasNoEventFilter,
  className,
}: WebhookEventsFieldProps) {
  return (
    <div className={cn('grid gap-4', className)}>
      {hasNoEventFilter ? <WebhookKeepEveryEventField form={form} /> : null}
      <form.Subscribe selector={(state) => state.values.keepEveryEvent}>
        {(keepEveryEvent) =>
          keepEveryEvent ? null : (
            <form.AppField name="eventTypes">
              {() => (
                <FormField<string[]> className="grid-cols-1">
                  {(field) => (
                    <FormControl announceRequired={false}>
                      <WebhookEventPicker
                        value={field.value}
                        onChange={field.handleChange}
                        retainedTypes={retainedTypes}
                      />
                    </FormControl>
                  )}
                </FormField>
              )}
            </form.AppField>
          )
        }
      </form.Subscribe>
    </div>
  );
}
