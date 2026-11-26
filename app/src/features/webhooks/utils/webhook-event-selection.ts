import type { WebhookEventGroup } from './webhook-event-catalogue';
import { getWebhookEvent, SUBSCRIBABLE_WEBHOOK_EVENTS } from './webhook-events';

// The selection of the create and edit page is kept as event types, in one
// canonical order: the catalogue's groups, the catalogue's order within a
// group, then the types the picker does not offer, alphabetically. Every change
// goes through `sortEventTypes`, so two selections of the same events are equal
// arrays: the form's "nothing to save" check is an ordered deep comparison.

/** A list of types as the API may hand it: a webhook without a filter has none. */
export type EventTypeList = readonly string[] | null | undefined;

/** Whether a group checkbox stands for none, some or all of its rows. */
export type GroupCheckState = 'none' | 'some' | 'all';

/** One group of a selection, as the Selection card draws it. */
export interface SelectionGroupSummary {
  group: WebhookEventGroup | 'other';
  types: string[];
  /** The events the group offers; the "other" group counts what it holds. */
  total: number;
  /** Every event the group offers is selected: one "All n events" chip. */
  isAll: boolean;
}

const OFFERED_TYPE_ORDER = new Map<string, number>(
  SUBSCRIBABLE_WEBHOOK_EVENTS.flatMap((entry) =>
    entry.events.map((event) => event.type as string),
  ).map((type, index) => [type, index]),
);

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Whether the picker offers the type: an event of a catalogue group. The others
 * are newer than the console, offered by no group (FEATURE_FLAG_EVALUATED), or
 * not an event at all; the edit page keeps them under "Other events".
 */
export function isOfferedType(type: string): boolean {
  return OFFERED_TYPE_ORDER.has(type);
}

/** The selection in its canonical order, without duplicates. */
export function sortEventTypes(types: EventTypeList): string[] {
  const unique = [...new Set(types ?? [])];
  const offered = unique
    .filter(isOfferedType)
    .sort((a, b) => OFFERED_TYPE_ORDER.get(a)! - OFFERED_TYPE_ORDER.get(b)!);
  const others = unique
    .filter((type) => !isOfferedType(type))
    .sort(compareText);

  return [...offered, ...others];
}

/** Adds `types` to the selection (`on`) or removes them from it. */
export function toggleTypes(
  selected: EventTypeList,
  types: readonly string[],
  on: boolean,
): string[] {
  if (on) {
    return sortEventTypes([...(selected ?? []), ...types]);
  }
  const removed = new Set(types);
  return sortEventTypes((selected ?? []).filter((type) => !removed.has(type)));
}

/** The state of a group checkbox for the rows the person can see. */
export function groupCheckState(
  selected: EventTypeList,
  visibleTypes: readonly string[],
): GroupCheckState {
  const chosen = new Set(selected ?? []);
  const count = visibleTypes.filter((type) => chosen.has(type)).length;

  if (count === 0) return 'none';
  return count === visibleTypes.length ? 'all' : 'some';
}

/** Every type of the preset is selected. */
export function isPresetApplied(
  selected: EventTypeList,
  presetTypes: readonly string[],
): boolean {
  const chosen = new Set(selected ?? []);
  return (
    presetTypes.length > 0 && presetTypes.every((type) => chosen.has(type))
  );
}

/**
 * A preset pill: adds the preset when it is not applied; otherwise removes its
 * types, except those another applied preset also holds.
 */
export function togglePreset(
  selected: EventTypeList,
  presetTypes: readonly string[],
  otherAppliedPresets: readonly (readonly string[])[],
): string[] {
  if (!isPresetApplied(selected, presetTypes)) {
    return toggleTypes(selected, presetTypes, true);
  }
  const kept = new Set(otherAppliedPresets.flat());
  return toggleTypes(
    selected,
    presetTypes.filter((type) => !kept.has(type)),
    false,
  );
}

/**
 * The selection by group, in the catalogue's group order and then "other", each
 * group's types in the selection's order. Groups with nothing selected are left out.
 */
export function summarizeSelection(
  selected: EventTypeList,
): SelectionGroupSummary[] {
  const types = sortEventTypes(selected);
  const summaries: SelectionGroupSummary[] = SUBSCRIBABLE_WEBHOOK_EVENTS.map(
    ({ group, events }) => {
      const groupTypes = types.filter(
        (type) => isOfferedType(type) && getWebhookEvent(type)?.group === group,
      );
      return {
        group,
        types: groupTypes,
        total: events.length,
        isAll: groupTypes.length === events.length,
      };
    },
  );
  const otherTypes = types.filter((type) => !isOfferedType(type));
  summaries.push({
    group: 'other',
    types: otherTypes,
    total: otherTypes.length,
    isAll: false,
  });

  return summaries.filter((summary) => summary.types.length > 0);
}
