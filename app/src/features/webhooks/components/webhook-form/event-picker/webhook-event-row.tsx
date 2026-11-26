import { memo, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  getWebhookEvent,
  getWebhookEventLabel,
} from '../../../utils/webhook-events';

type WebhookEventRowProps = {
  type: string;
  checked: boolean;
  onToggle: (types: readonly string[], on: boolean) => void;
};

/**
 * One event of the picker, on one line: the box, the label in the viewer's
 * language and, to the right, the NAME the payload carries. The whole row is
 * the label of the box. Memoised: a change of the selection redraws only the
 * rows whose box changed.
 */
export const WebhookEventRow = memo(function WebhookEventRow({
  type,
  checked,
  onToggle,
}: WebhookEventRowProps) {
  const { t } = useTranslation();
  const id = useId();
  const event = getWebhookEvent(type);
  const boxId = `${id}-box`;
  const labelId = `${id}-label`;
  const nameId = `${id}-name`;

  function handleCheckedChange(next: boolean) {
    onToggle([type], next);
  }

  return (
    <li className="flex items-center gap-3 px-4 hover:bg-muted/40">
      <Checkbox
        id={boxId}
        checked={checked}
        onCheckedChange={handleCheckedChange}
        aria-labelledby={labelId}
        aria-describedby={event ? nameId : undefined}
      />
      <Label
        htmlFor={boxId}
        className="min-w-0 flex-1 cursor-pointer justify-between gap-3 py-2 font-normal"
      >
        <span id={labelId} className="min-w-0 truncate">
          {getWebhookEventLabel(type, t)}
        </span>
        {event ? (
          <span
            id={nameId}
            title={type}
            className="min-w-0 shrink truncate font-mono text-xs text-muted-foreground"
          >
            {event.name}
          </span>
        ) : null}
      </Label>
    </li>
  );
});
