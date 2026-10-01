import { Card } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import {
  ActionAccordionActions,
  ActionAccordionContent,
  ActionAccordionHeader,
  ActionAccordionItem,
  ActionAccordionTrigger,
} from '@/components/ui/action-accordion';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { PreferenceEvent } from '../types';
import {
  eventDescriptionKey,
  type PreferenceGroup,
} from './notification-preference-groups';

interface PreferenceEventRowProps {
  event: PreferenceEvent;
  channel: string;
  onToggle: (eventNames: string[], value: boolean) => void;
}

function PreferenceEventRow({
  event,
  channel,
  onToggle,
}: PreferenceEventRowProps) {
  const { t } = useTranslation();
  const enabled = event.channels[channel] ?? false;
  const descriptionKey = eventDescriptionKey(event.eventName);

  const handleToggle = (value: boolean) => {
    onToggle([event.eventName], value);
  };

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p
          className={cn(
            'text-sm font-medium',
            !enabled && 'text-muted-foreground',
          )}
        >
          {event.label}
        </p>
        {descriptionKey ? (
          <p className="text-xs text-muted-foreground">{t(descriptionKey)}</p>
        ) : null}
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        aria-label={event.label}
      />
    </div>
  );
}

interface NotificationPreferenceGroupCardProps {
  group: PreferenceGroup;
  channel: string;
  onToggle: (eventNames: string[], value: boolean) => void;
}

export function NotificationPreferenceGroupCard({
  group,
  channel,
  onToggle,
}: NotificationPreferenceGroupCardProps) {
  const { t } = useTranslation();
  const { def, events } = group;
  const enabledCount = events.filter(
    (event) => event.channels[channel] ?? false,
  ).length;
  const allEnabled = enabledCount === events.length;
  const groupLabel = t(def.labelKey, def.labelFallback);

  const handleToggleGroup = (value: boolean) => {
    onToggle(
      events.map((event) => event.eventName),
      value,
    );
  };

  function renderEventRow(event: PreferenceEvent) {
    return (
      <PreferenceEventRow
        key={event.eventName}
        event={event}
        channel={channel}
        onToggle={onToggle}
      />
    );
  }

  return (
    // One fold of the page's accordion: the title folds the events away, and
    // the group's count and switch stay outside it, in reach either way.
    <ActionAccordionItem value={def.id} className="border-b-0">
      <Card className="gap-0 py-0">
        <ActionAccordionHeader className="px-6 py-4 group-data-panel-open:border-b">
          <ActionAccordionTrigger className="items-start gap-3 py-0 hover:no-underline">
            <def.Icon
              className="mt-0.5 size-5 shrink-0 text-primary-subtle-foreground"
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{groupLabel}</span>
              <span className="block text-xs font-normal text-muted-foreground">
                {t(def.descriptionKey, def.descriptionFallback)}
              </span>
            </span>
          </ActionAccordionTrigger>
          <ActionAccordionActions className="ml-4 shrink-0">
            <span className="text-xs text-muted-foreground">
              {t('Pages.Settings.Notifications.groupOnCount', {
                enabled: enabledCount,
                total: events.length,
              })}
            </span>
            <Switch
              size="sm"
              checked={allEnabled}
              onCheckedChange={handleToggleGroup}
              aria-label={t('Pages.Settings.Notifications.groupToggle', {
                group: groupLabel,
              })}
            />
          </ActionAccordionActions>
        </ActionAccordionHeader>
        <ActionAccordionContent className="divide-y divide-border/60 px-6 py-1">
          {events.map(renderEventRow)}
        </ActionAccordionContent>
      </Card>
    </ActionAccordionItem>
  );
}
