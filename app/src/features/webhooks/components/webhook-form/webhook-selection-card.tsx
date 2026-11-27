import { useEffect, useId, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { EventSelectionUpdate } from '../../hooks/use-webhook-event-picker';
import {
  type SelectionGroupSummary,
  summarizeSelection,
  toggleTypes,
} from '../../utils/webhook-event-selection';
import { WebhookSelectionChips } from './webhook-selection-chips';

type WebhookSelectionCardProps = {
  value: readonly string[];
  /**
   * The webhook keeps receiving every event: the card says so instead of
   * listing `value`, which is not sent.
   */
  everyEvent?: boolean;
  onChange: EventSelectionUpdate;
  className?: string;
};

const chipCount = (summary: SelectionGroupSummary) =>
  summary.isAll ? 1 : summary.types.length;

/**
 * What will be sent: the count, the selection by group as removable chips, and
 * "Clear all", or "Every event" alone for a webhook that keeps no filter. It
 * owns no state: it reads the field's value and asks for every change. After a
 * removal the focus goes to the next chip, else the previous one, else the
 * card's title, so a keyboard user never falls to the page.
 */
export function WebhookSelectionCard({
  value,
  everyEvent = false,
  onChange,
  className,
}: WebhookSelectionCardProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const titleRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const summaries = useMemo(() => summarizeSelection(value), [value]);

  // Focus is a DOM effect of a removal: it can only move once the chips are
  // drawn again.
  useEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    pendingFocus.current = null;
    const buttons =
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        '[data-selection-remove]',
      ) ?? [];
    const target = buttons[Math.min(index, buttons.length - 1)];
    (target ?? titleRef.current)?.focus();
  }, [value]);

  function handleRemove(types: readonly string[], chipIndex: number) {
    pendingFocus.current = chipIndex;
    onChange((current) => toggleTypes(current, types, false));
  }

  function handleClear() {
    pendingFocus.current = 0;
    onChange(() => []);
  }

  let nextIndex = 0;
  function renderChipGroup(summary: SelectionGroupSummary) {
    const firstIndex = nextIndex;
    nextIndex += chipCount(summary);
    return (
      <WebhookSelectionChips
        key={summary.group}
        summary={summary}
        firstIndex={firstIndex}
        onRemove={handleRemove}
      />
    );
  }

  return (
    <Card
      role="region"
      aria-labelledby={titleId}
      className={cn('flex min-h-0 flex-col gap-3 py-4', className)}
    >
      <div className="flex items-start justify-between gap-3 px-5">
        <div className="space-y-1">
          <CardTitle
            id={titleId}
            ref={titleRef}
            tabIndex={-1}
            className="outline-none"
          >
            {t('Pages.Integrations.Webhooks.Form.selection.title')}
          </CardTitle>
          <p role="status" className="text-sm text-muted-foreground">
            {everyEvent
              ? t('Pages.Integrations.Webhooks.Form.selection.everyEvent')
              : t('Pages.Integrations.Webhooks.Form.selection.count', {
                  count: value.length,
                })}
          </p>
        </div>
        {value.length > 0 && !everyEvent ? (
          <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
            {t('Pages.Integrations.Webhooks.Form.selection.clear')}
          </Button>
        ) : null}
      </div>
      {everyEvent ? null : (
        <div
          ref={listRef}
          className="min-h-0 space-y-3 overflow-y-auto px-5 max-lg:max-h-64 lg:flex-1"
        >
          {summaries.length > 0 ? (
            summaries.map(renderChipGroup)
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('Pages.Integrations.Webhooks.Form.selection.empty')}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
