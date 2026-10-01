import { Button } from '@/components/ui/button';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Bell, BellOff, BellRing, CheckCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionAccordion } from '@/components/ui/action-accordion';
import { cn } from '@/lib/utils';
import { Page } from '@/functionals/page';
import { useNotificationPreferencesMutation } from '../hooks/use-notification-preferences';
import { notificationPreferencesQueryOptions } from '../queries';
import { NotificationPreferenceGroupCard } from './notification-preference-group-card';
import {
  groupPreferenceEvents,
  type PreferenceGroup,
} from './notification-preference-groups';

const IN_APP_CHANNEL = 'in_app';

// Keyed on `savedAt` by its caller, so each save mounts a fresh chip: that is
// what makes the visible-from-the-start state below a plain initial value
// instead of something an effect has to switch on after mounting.
function SavedChip({ savedAt }: { savedAt: number }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(savedAt !== 0);

  useEffect(() => {
    if (savedAt === 0) {
      return;
    }
    const timer = window.setTimeout(() => setVisible(false), 1_800);
    return () => window.clearTimeout(timer);
  }, [savedAt]);

  return (
    <span
      aria-live="polite"
      className={cn(
        'flex items-center gap-1 text-xs text-success-subtle-foreground transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <CheckCheck className="size-3.5" aria-hidden />
      {t('Pages.Settings.Notifications.saved', 'Saved')}
    </span>
  );
}

export function NotificationPreferencesContent() {
  const { t } = useTranslation();
  const { data: matrix } = useSuspenseQuery(
    notificationPreferencesQueryOptions,
  );
  const mutation = useNotificationPreferencesMutation();
  const [savedAt, setSavedAt] = useState(0);

  // v1 of the contract exposes a single channel; the row switches drive it.
  const channel = matrix.channels[0] ?? IN_APP_CHANNEL;
  const groups = useMemo(
    () => groupPreferenceEvents(matrix.events),
    [matrix.events],
  );
  const enabledCount = matrix.events.filter(
    (event) => event.channels[channel] ?? false,
  ).length;
  const totalCount = matrix.events.length;

  const handleToggle = (eventNames: string[], value: boolean) => {
    mutation.mutate(
      {
        body: {
          events: eventNames.map((eventName) => ({
            eventName: eventName,
            channels: { [channel]: value },
          })),
        },
      },
      { onSuccess: () => setSavedAt(Date.now()) },
    );
  };

  const handleEnableAll = () => {
    handleToggle(
      matrix.events.map((event) => event.eventName),
      true,
    );
  };

  const handlePauseAll = () => {
    handleToggle(
      matrix.events.map((event) => event.eventName),
      false,
    );
  };

  function renderGroupCard(group: PreferenceGroup) {
    return (
      <NotificationPreferenceGroupCard
        key={group.def.id}
        group={group}
        channel={channel}
        onToggle={handleToggle}
      />
    );
  }

  return (
    // Fixed header + full-bleed scroll body (docs/03-patterns/page-scrolling.md).
    <Page layout="scroll">
      <Page.Fixed>
        <Page.Header>
          <Page.Leading>
            <Page.Icon>
              <BellRing className="size-8 text-primary-subtle-foreground" />
            </Page.Icon>
            <Page.Heading>
              <Page.Title>
                {t('Pages.Settings.Notifications.title', 'Notifications')}
              </Page.Title>
              <Page.Subtitle>
                {t('Pages.Settings.Notifications.subtitle')}
              </Page.Subtitle>
            </Page.Heading>
          </Page.Leading>
          <Page.Actions>
            <SavedChip key={savedAt} savedAt={savedAt} />
          </Page.Actions>
        </Page.Header>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t('Pages.Settings.Notifications.summary', {
              enabled: enabledCount,
              total: totalCount,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnableAll}
              disabled={enabledCount === totalCount || mutation.isPending}
            >
              <Bell aria-hidden />
              {t('Pages.Settings.Notifications.enableAll', 'Enable all')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePauseAll}
              disabled={enabledCount === 0 || mutation.isPending}
            >
              <BellOff aria-hidden />
              {t('Pages.Settings.Notifications.pauseAll', 'Pause all')}
            </Button>
          </div>
        </div>
      </Page.Fixed>

      <Page.Scroll className="mt-4">
        {/* Every group starts open; each folds away on its own. */}
        <ActionAccordion
          multiple
          defaultValue={groups.map((group) => group.def.id)}
          className="space-y-4"
        >
          {groups.map(renderGroupCard)}
        </ActionAccordion>
      </Page.Scroll>
    </Page>
  );
}
