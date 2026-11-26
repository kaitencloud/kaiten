import { type ComponentProps, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Accordion } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  type EventSelectionUpdate,
  type PickerGroup,
  useWebhookEventPicker,
} from '../../../hooks/use-webhook-event-picker';
import { WebhookEventGroup } from './webhook-event-group';
import { WebhookEventPresets } from './webhook-event-presets';
import { WebhookEventSearch } from './webhook-event-search';

type WebhookEventPickerProps = Omit<
  ComponentProps<'div'>,
  'onChange' | 'children'
> & {
  /** The selected event types, in the selection's canonical order. */
  value: readonly string[];
  onChange: EventSelectionUpdate;
  /** Types the webhook carries that the picker does not offer. */
  retainedTypes?: readonly string[];
};

const NO_RETAINED_TYPES: readonly string[] = [];

/**
 * The event picker of the create and edit page: a search, the presets, and the
 * catalogue by group, collapsed. It holds no selection of its own: it reads
 * `value` and asks `onChange` for every change. The root is a group named by
 * the card's title; a form field gives it its error.
 */
export function WebhookEventPicker({
  value,
  onChange,
  retainedTypes = NO_RETAINED_TYPES,
  className,
  'aria-describedby': describedBy,
  ...props
}: WebhookEventPickerProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();
  const picker = useWebhookEventPicker({ value, onChange, retainedTypes });
  const selected = useMemo(() => new Set(value), [value]);

  function clearSearch() {
    picker.handleQueryChange('');
  }

  function renderGroup(group: PickerGroup) {
    return (
      <WebhookEventGroup
        key={group.id}
        group={group}
        searching={picker.searching}
        selected={selected}
        onToggle={picker.toggleEvents}
      />
    );
  }

  return (
    <Card
      role="group"
      aria-labelledby={titleId}
      aria-describedby={[descriptionId, describedBy].filter(Boolean).join(' ')}
      className={cn('gap-0 py-0', className)}
      {...props}
    >
      <CardHeader className="gap-1.5 border-b px-4 py-4">
        <CardTitle id={titleId}>
          {t('Pages.Integrations.Webhooks.Form.events.title')}
        </CardTitle>
        <CardDescription id={descriptionId}>
          {t('Pages.Integrations.Webhooks.Form.events.description')}
        </CardDescription>
      </CardHeader>
      <div className="space-y-3 border-b p-4">
        <WebhookEventSearch
          query={picker.query}
          onQueryChange={picker.handleQueryChange}
          searching={picker.searching}
          matchCount={picker.matchCount}
        />
        <WebhookEventPresets
          applied={picker.appliedPresets}
          onToggle={picker.handleTogglePreset}
        />
      </div>
      {picker.groups.length > 0 ? (
        <Accordion
          multiple
          value={picker.openGroups}
          onValueChange={picker.handleOpenChange}
        >
          {picker.groups.map(renderGroup)}
        </Accordion>
      ) : (
        <div className="m-4 flex flex-col items-center gap-2 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          <p>
            {t('Pages.Integrations.Webhooks.Form.picker.noResults', {
              query: picker.query.trim(),
            })}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearSearch}
          >
            {t('Pages.Integrations.Webhooks.Form.picker.searchClear')}
          </Button>
        </div>
      )}
    </Card>
  );
}
