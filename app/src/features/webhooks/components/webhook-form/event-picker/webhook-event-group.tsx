import { useTranslation } from 'react-i18next';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import type { PickerGroup } from '../../../hooks/use-webhook-event-picker';
import { WebhookEventRow } from './webhook-event-row';

type WebhookEventGroupProps = {
  group: PickerGroup;
  searching: boolean;
  selected: ReadonlySet<string>;
  onToggle: (types: readonly string[], on: boolean) => void;
};

/**
 * One group of the picker: a checkbox for the group's visible rows (all of them,
 * or the matches of a search), the title that folds the rows away, and the
 * count of the whole group. The checkbox is a sibling of the trigger, not inside
 * it: a button may not hold another control.
 */
export function WebhookEventGroup({
  group,
  searching,
  selected,
  onToggle,
}: WebhookEventGroupProps) {
  const { t } = useTranslation();
  const counts = { selected: group.selectedCount, total: group.total };

  function handleGroupChange(checked: boolean) {
    onToggle(group.visibleTypes, checked);
  }

  function renderRow(type: string) {
    return (
      <WebhookEventRow
        key={type}
        type={type}
        checked={selected.has(type)}
        onToggle={onToggle}
      />
    );
  }

  return (
    <AccordionItem value={group.id}>
      {/* Accordion.Header is an h3 around the trigger: it must fill the row
          for the chevron to sit at its end and the whole title to be the
          click target. */}
      <div className="flex items-center gap-3 px-4 [&>h3]:min-w-0 [&>h3]:flex-1">
        <Checkbox
          checked={group.checkState === 'all'}
          indeterminate={group.checkState === 'some'}
          onCheckedChange={handleGroupChange}
          aria-label={
            searching
              ? t('Pages.Integrations.Webhooks.Form.picker.selectMatching', {
                  group: group.title,
                })
              : t('Pages.Integrations.Webhooks.Form.picker.selectGroup', {
                  group: group.title,
                })
          }
        />
        <AccordionTrigger className="gap-3 py-2.5 hover:no-underline">
          <span className="min-w-0 truncate">{group.title}</span>{' '}
          <span
            aria-hidden
            className="ml-auto text-xs font-normal text-muted-foreground tabular-nums"
          >
            {t('Pages.Integrations.Webhooks.Form.picker.groupCount', counts)}
          </span>{' '}
          <span className="sr-only">
            {t(
              'Pages.Integrations.Webhooks.Form.picker.groupCountLabel',
              counts,
            )}
          </span>
        </AccordionTrigger>
      </div>
      <AccordionContent className="pb-2">
        {group.id === 'other' ? (
          <p className="px-4 pb-1 text-xs text-muted-foreground">
            {t('Pages.Integrations.Webhooks.Form.picker.otherNote')}
          </p>
        ) : null}
        <ul>{group.visibleTypes.map(renderRow)}</ul>
      </AccordionContent>
    </AccordionItem>
  );
}
