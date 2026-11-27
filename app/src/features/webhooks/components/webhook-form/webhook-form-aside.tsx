import type { WebhookFormApi } from '../../hooks/use-webhook-form';
import type { EventSelectionUpdate } from '../../hooks/use-webhook-event-picker';
import type { WebhookFormValues } from '../../schemas';
import { WebhookDestinationCard } from './webhook-destination-card';
import { WebhookFormActions } from './webhook-form-actions';
import { WebhookSelectionCard } from './webhook-selection-card';

type WebhookFormAsideProps = {
  form: WebhookFormApi;
  isEditMode: boolean;
  isUnchanged: (values: WebhookFormValues) => boolean;
  onCancel: () => void;
};

/**
 * The column beside the catalogue: Destination, Selection and the actions.
 * From `lg` it stays in view while the catalogue scrolls, capped to the height
 * of the scroller so the actions never fall below the fold: the chip list takes
 * what is left. The 10rem stand for the app bar and the page header, measured
 * at 1024, 1200, 1366 and 1440 pixels wide with the Slack notice shown. Below `lg` it dissolves into the page's grid (`contents`), so
 * the `order-*` of its cards can put the catalogue between Destination and
 * Selection while the DOM, and so the tab order, keeps the URL first.
 */
export function WebhookFormAside({
  form,
  isEditMode,
  isUnchanged,
  onCancel,
}: WebhookFormAsideProps) {
  const handleSelectionChange: EventSelectionUpdate = (update) => {
    form.setFieldValue('eventTypes', update);
  };

  return (
    <div className="flex flex-col gap-4 max-lg:contents lg:sticky lg:top-0 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100dvh-10rem)]">
      <WebhookDestinationCard form={form} className="order-1 shrink-0" />
      <form.Subscribe selector={(state) => state.values.keepEveryEvent}>
        {(keepEveryEvent) => (
          <form.Subscribe selector={(state) => state.values.eventTypes}>
            {(eventTypes) => (
              <WebhookSelectionCard
                value={eventTypes}
                everyEvent={keepEveryEvent}
                onChange={handleSelectionChange}
                className="order-3 lg:flex-1"
              />
            )}
          </form.Subscribe>
        )}
      </form.Subscribe>
      <WebhookFormActions
        form={form}
        isEditMode={isEditMode}
        isUnchanged={isUnchanged}
        onCancel={onCancel}
        className="order-4 shrink-0"
      />
    </div>
  );
}
