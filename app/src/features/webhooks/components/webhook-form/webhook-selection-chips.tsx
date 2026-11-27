import { XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SelectionGroupSummary } from '../../utils/webhook-event-selection';
import {
  getWebhookEvent,
  getWebhookEventGroupLabel,
  getWebhookEventLabel,
} from '../../utils/webhook-events';

type WebhookSelectionChipsProps = {
  summary: SelectionGroupSummary;
  /** The position of the group's first chip among all the chips of the card. */
  firstIndex: number;
  onRemove: (types: readonly string[], chipIndex: number) => void;
};

function SelectionChip({
  label,
  title,
  removeLabel,
  mono,
  onRemove,
}: {
  label: string;
  title?: string;
  removeLabel: string;
  mono: boolean;
  onRemove: () => void;
}) {
  return (
    <li>
      <Badge
        variant="outline"
        title={title}
        className={mono ? 'gap-1 pr-1 font-mono font-normal' : 'gap-1 pr-1'}
      >
        <span className="max-w-56 truncate">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-4 rounded-sm"
          aria-label={removeLabel}
          data-selection-remove=""
          onClick={onRemove}
        >
          <XIcon aria-hidden />
        </Button>
      </Badge>
    </li>
  );
}

/**
 * One group of the Selection card: its title, then one "All n events" chip when
 * the whole group is selected, or one chip per event, by the NAME its payload
 * carries (the raw type for an event this console does not know).
 */
export function WebhookSelectionChips({
  summary,
  firstIndex,
  onRemove,
}: WebhookSelectionChipsProps) {
  const { t } = useTranslation();
  const groupTitle = getWebhookEventGroupLabel(
    summary.group === 'other' ? null : summary.group,
    t,
  );

  function renderEventChip(type: string, index: number) {
    const label = getWebhookEventLabel(type, t);
    return (
      <SelectionChip
        key={type}
        label={getWebhookEvent(type)?.name ?? type}
        title={label}
        mono
        removeLabel={t(
          'Pages.Integrations.Webhooks.Form.selection.removeEvent',
          {
            event: label,
          },
        )}
        onRemove={() => onRemove([type], firstIndex + index)}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{groupTitle}</p>
      <ul className="flex flex-wrap gap-1.5">
        {summary.isAll ? (
          <SelectionChip
            label={t('Pages.Integrations.Webhooks.Form.selection.allOfGroup', {
              count: summary.total,
            })}
            mono={false}
            removeLabel={t(
              'Pages.Integrations.Webhooks.Form.selection.removeGroup',
              { count: summary.total, group: groupTitle },
            )}
            onRemove={() => onRemove(summary.types, firstIndex)}
          />
        ) : (
          summary.types.map(renderEventChip)
        )}
      </ul>
    </div>
  );
}
