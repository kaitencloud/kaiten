import type { TFunction } from 'i18next';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WebhookEventGroup } from '../utils/webhook-event-catalogue';
import {
  WEBHOOK_EVENT_PRESET_IDS,
  WEBHOOK_EVENT_PRESETS,
  type WebhookEventPresetId,
} from '../utils/webhook-event-presets';
import {
  buildEventSearchIndex,
  matchesEventSearch,
  parseEventSearchQuery,
} from '../utils/webhook-event-search';
import {
  type GroupCheckState,
  groupCheckState,
  isOfferedType,
  isPresetApplied,
  sortEventTypes,
  toggleTypes,
  togglePreset,
} from '../utils/webhook-event-selection';
import {
  getWebhookEventGroupLabel,
  SUBSCRIBABLE_WEBHOOK_EVENTS,
} from '../utils/webhook-events';

/** A change of the selection, given the selection it applies to. */
export type EventSelectionUpdate = (
  update: (current: string[]) => string[],
) => void;

export type PickerGroupId = WebhookEventGroup | 'other';

/** One group as the picker draws it. */
export interface PickerGroup {
  id: PickerGroupId;
  title: string;
  /** The rows the person can see: all of them, or the matches of a search. */
  visibleTypes: string[];
  selectedCount: number;
  total: number;
  checkState: GroupCheckState;
}

type UseWebhookEventPickerOptions = {
  value: readonly string[];
  onChange: EventSelectionUpdate;
  /** Types the webhook carries that the picker does not offer. */
  retainedTypes: readonly string[];
};

const OFFERED_TYPES = SUBSCRIBABLE_WEBHOOK_EVENTS.flatMap((entry) =>
  entry.events.map((event) => event.type as string),
);

function buildGroups(
  value: readonly string[],
  otherTypes: readonly string[],
  matches: (type: string) => boolean,
  t: TFunction,
): PickerGroup[] {
  const selected = new Set(value);
  const entries: { id: PickerGroupId; types: string[] }[] =
    SUBSCRIBABLE_WEBHOOK_EVENTS.map((entry) => ({
      id: entry.group,
      types: entry.events.map((event) => event.type as string),
    }));
  if (otherTypes.length > 0) {
    entries.push({ id: 'other', types: [...otherTypes] });
  }

  return entries.map(({ id, types }) => {
    const visibleTypes = types.filter(matches);
    return {
      id,
      title: getWebhookEventGroupLabel(id === 'other' ? null : id, t),
      visibleTypes,
      selectedCount: types.filter((type) => selected.has(type)).length,
      total: types.length,
      checkState: groupCheckState(value, visibleTypes),
    };
  });
}

/**
 * The state of the event picker: the search, which groups are open, and the
 * changes the rows, the group checkboxes and the presets make. Groups start
 * collapsed, but "Other events"; a search opens the groups that match and hides
 * the others, and clearing it brings back the groups opened by hand.
 */
export function useWebhookEventPicker({
  value,
  onChange,
  retainedTypes,
}: UseWebhookEventPickerOptions) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [manualOpen, setManualOpen] = useState<string[]>(() =>
    retainedTypes.length > 0 ? ['other'] : [],
  );
  const [searchClosed, setSearchClosed] = useState<string[]>([]);

  const deferredQuery = useDeferredValue(query);
  const terms = useMemo(
    () => parseEventSearchQuery(deferredQuery),
    [deferredQuery],
  );
  const searching = terms.length > 0;

  // An unticked retained type stays listed, so it can be ticked again. Kept as
  // a string so that the index below is rebuilt only when the list changes.
  const otherKey = sortEventTypes([
    ...retainedTypes,
    ...value.filter((type) => !isOfferedType(type)),
  ]).join('\n');
  const otherTypes = useMemo(
    () => (otherKey ? otherKey.split('\n') : []),
    [otherKey],
  );
  const index = useMemo(
    () => buildEventSearchIndex([...OFFERED_TYPES, ...otherTypes], t),
    [t, otherTypes],
  );

  const groups = useMemo(
    () =>
      buildGroups(
        value,
        otherTypes,
        (type) => matchesEventSearch(index, type, terms),
        t,
      ),
    [value, otherTypes, index, terms, t],
  );
  const visibleGroups = groups.filter((group) => group.visibleTypes.length > 0);
  const matchCount = visibleGroups.reduce(
    (count, group) => count + group.visibleTypes.length,
    0,
  );
  const matchingGroupIds = visibleGroups.map((group) => group.id);

  const openGroups = searching
    ? matchingGroupIds.filter((id) => !searchClosed.includes(id))
    : manualOpen;

  function handleOpenChange(next: string[]) {
    if (searching) {
      setSearchClosed(matchingGroupIds.filter((id) => !next.includes(id)));
    } else {
      setManualOpen(next);
    }
  }

  function handleQueryChange(next: string) {
    setQuery(next);
    setSearchClosed([]);
  }

  const toggleEvents = useCallback(
    (types: readonly string[], on: boolean) =>
      onChange((current) => toggleTypes(current, types, on)),
    [onChange],
  );

  const appliedPresets = WEBHOOK_EVENT_PRESET_IDS.filter((id) =>
    isPresetApplied(value, WEBHOOK_EVENT_PRESETS[id]),
  );

  function handleTogglePreset(presetId: WebhookEventPresetId) {
    onChange((current) =>
      togglePreset(
        current,
        WEBHOOK_EVENT_PRESETS[presetId],
        WEBHOOK_EVENT_PRESET_IDS.filter(
          (id) =>
            id !== presetId &&
            isPresetApplied(current, WEBHOOK_EVENT_PRESETS[id]),
        ).map((id) => WEBHOOK_EVENT_PRESETS[id]),
      ),
    );
  }

  return {
    appliedPresets,
    groups: visibleGroups,
    handleOpenChange,
    handleQueryChange,
    handleTogglePreset,
    matchCount,
    openGroups,
    query,
    searching,
    toggleEvents,
  };
}
