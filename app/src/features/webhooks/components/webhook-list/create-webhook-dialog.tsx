import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoaderCircle } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { FormDialog } from '@/components/dialog';
import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { cn } from '@/lib/utils';
import {
  type CreateWebhookFormValues,
  createWebhookFormSchema,
  initialCreateWebhookFormValues,
} from '../../schemas/create-webhook.schema';
import {
  getWebhookEventGroupLabel,
  getWebhookEventLabel,
  SUBSCRIBABLE_WEBHOOK_EVENTS,
  type WebhookEvent,
} from '../../utils/webhook-events';

type WebhookEventGroupEntry = (typeof SUBSCRIBABLE_WEBHOOK_EVENTS)[number];

interface CreateWebhookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: CreateWebhookFormValues) => Promise<void> | void;
}

// A subscription is kept as the types of its events: what the API publishes
// them under, and what it filters deliveries on.
const toggleWebhookEventSelection = (
  selectedEventTypes: string[],
  eventType: string,
) =>
  selectedEventTypes.includes(eventType)
    ? selectedEventTypes.filter((selectedType) => selectedType !== eventType)
    : [...selectedEventTypes, eventType];

function WebhookEventOption({
  event,
  isSelected,
  onToggleEvent,
}: {
  event: WebhookEvent;
  isSelected: boolean;
  onToggleEvent: (eventType: string) => void;
}) {
  const { t } = useTranslation();
  const checkboxId = `webhook-event-${event.name}`;
  const label = getWebhookEventLabel(event.type, t);

  return (
    <div
      className={cn(
        'grid grid-cols-[auto_1fr] items-start gap-3 rounded-lg border p-3 transition-colors',
        isSelected ? 'border-primary/20 bg-muted/60' : 'hover:bg-muted/30',
      )}
    >
      <Checkbox
        id={checkboxId}
        checked={isSelected}
        onCheckedChange={() => onToggleEvent(event.type)}
        aria-label={label}
        className="mt-0.5"
      />
      <Label
        id={`${checkboxId}-label`}
        htmlFor={checkboxId}
        className="min-w-0 cursor-pointer items-start"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-medium leading-5">{label}</span>
          <Badge variant="outline" className="text-xs font-mono">
            {event.name}
          </Badge>
        </div>
      </Label>
    </div>
  );
}

function WebhookEventGroupSection({
  entry,
  onToggleEvent,
  selectedEventTypes,
}: {
  entry: WebhookEventGroupEntry;
  onToggleEvent: (eventType: string) => void;
  selectedEventTypes: string[];
}) {
  const { t } = useTranslation();

  function renderEventOption(event: WebhookEvent) {
    return (
      <WebhookEventOption
        key={event.type}
        event={event}
        isSelected={selectedEventTypes.includes(event.type)}
        onToggleEvent={onToggleEvent}
      />
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">
        {getWebhookEventGroupLabel(entry.group, t)}
      </h4>
      <div className="space-y-2">{entry.events.map(renderEventOption)}</div>
    </div>
  );
}

function SelectedEventsSummary({
  selectedEventTypes,
}: {
  selectedEventTypes: string[];
}) {
  const { t } = useTranslation();
  const selectedEventNames = selectedEventTypes.map((type) =>
    getWebhookEventLabel(type, t),
  );

  return (
    <div className="min-h-[72px] rounded-md border bg-muted/40 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {t('Pages.Integrations.Webhooks.Dialog.selectedEvents')}
      </p>
      <p
        className={cn(
          'text-sm leading-6',
          selectedEventNames.length === 0 && 'text-muted-foreground',
        )}
      >
        {selectedEventNames.length > 0
          ? selectedEventNames.join(', ')
          : t('Pages.Integrations.Webhooks.Dialog.selectedEventsPlaceholder')}
      </p>
    </div>
  );
}

function WebhookEventGroupList({
  onToggleEvent,
  selectedEventTypes,
}: {
  onToggleEvent: (eventType: string) => void;
  selectedEventTypes: string[];
}) {
  function renderGroupSection(entry: WebhookEventGroupEntry) {
    return (
      <WebhookEventGroupSection
        key={entry.group}
        entry={entry}
        onToggleEvent={onToggleEvent}
        selectedEventTypes={selectedEventTypes}
      />
    );
  }

  return (
    <div className="max-h-96 space-y-5 overflow-y-auto rounded-md border p-4">
      {SUBSCRIBABLE_WEBHOOK_EVENTS.map(renderGroupSection)}
    </div>
  );
}

export function CreateWebhookDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateWebhookDialogProps) {
  const { t } = useTranslation();
  const formId = useId();

  const form = useAppForm({
    defaultValues: initialCreateWebhookFormValues,
    validators: {
      onChange: createWebhookFormSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        const parsedValue = createWebhookFormSchema.parse(value);
        await onSubmit(parsedValue);
        handleClose();
      } catch {
        return;
      }
    },
  });

  function handleClose() {
    form.reset();
    onOpenChange(false);
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      handleClose();
      return;
    }

    onOpenChange(true);
  }

  const handleFormSubmit = createFormSubmitHandler(form.handleSubmit);

  return (
    <FormDialog open={open} onOpenChange={handleDialogOpenChange}>
      <FormDialog.Header>
        <FormDialog.Title>
          {t('Pages.Integrations.Webhooks.Dialog.title')}
        </FormDialog.Title>
        <FormDialog.Description>
          {t('Pages.Integrations.Webhooks.Dialog.description')}
        </FormDialog.Description>
      </FormDialog.Header>

      <FormDialog.Content>
        <form id={formId} onSubmit={handleFormSubmit}>
          <form.AppForm>
            <div className="space-y-4 py-1">
              <form.AppField name="eventTypes">
                {() => (
                  <FormField<string[]>>
                    {(field) => {
                      function handleToggleEvent(eventType: string) {
                        field.handleChange(
                          toggleWebhookEventSelection(
                            field.value ?? [],
                            eventType,
                          ),
                        );
                        field.handleBlur();
                      }

                      return (
                        <div className="space-y-3">
                          <div className="text-sm font-medium">
                            {t(
                              'Pages.Integrations.Webhooks.Dialog.eventsLabel',
                            )}{' '}
                            ({(field.value ?? []).length}{' '}
                            {t(
                              'Pages.Integrations.Webhooks.Dialog.eventsSelected',
                            )}
                            )
                          </div>
                          <div
                            className={cn(
                              field.hasError &&
                                'rounded-md border border-destructive',
                            )}
                          >
                            <WebhookEventGroupList
                              onToggleEvent={handleToggleEvent}
                              selectedEventTypes={field.value ?? []}
                            />
                          </div>
                          <SelectedEventsSummary
                            selectedEventTypes={field.value ?? []}
                          />
                        </div>
                      );
                    }}
                  </FormField>
                )}
              </form.AppField>

              <form.AppField name="url">
                {() => (
                  <FormField<string>
                    label={t('Pages.Integrations.Webhooks.Dialog.urlLabel')}
                    description={t(
                      'Pages.Integrations.Webhooks.Dialog.urlDescription',
                    )}
                  >
                    {(field) => (
                      <FormControl>
                        <Input
                          type="url"
                          placeholder={t(
                            'Pages.Integrations.Webhooks.Dialog.urlPlaceholder',
                          )}
                          value={field.value ?? ''}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                        />
                      </FormControl>
                    )}
                  </FormField>
                )}
              </form.AppField>
            </div>
          </form.AppForm>
        </form>
      </FormDialog.Content>

      <FormDialog.Footer>
        <form.Subscribe<{ disabled: boolean; isSubmitting: boolean }>
          selector={(state) => ({
            disabled:
              state.isValidating ||
              !state.isValid ||
              !state.isDirty ||
              state.isSubmitting,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ disabled, isSubmitting }) => (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                {t('Common.cancel')}
              </Button>
              <Button type="submit" form={formId} disabled={disabled}>
                {isSubmitting && (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t('Pages.Integrations.Webhooks.Dialog.createButton')}
              </Button>
            </>
          )}
        </form.Subscribe>
      </FormDialog.Footer>
    </FormDialog>
  );
}
