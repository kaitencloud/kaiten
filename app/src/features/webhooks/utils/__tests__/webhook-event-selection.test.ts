import { describe, expect, it } from 'vite-plus/test';
import { WEBHOOK_EVENTS } from '../webhook-event-catalogue';
import {
  groupCheckState,
  isOfferedType,
  isPresetApplied,
  sortEventTypes,
  summarizeSelection,
  toggleTypes,
  togglePreset,
} from '../webhook-event-selection';
import { SUBSCRIBABLE_WEBHOOK_EVENTS } from '../webhook-events';

const MODEL_CREATED = WEBHOOK_EVENTS.MODEL_CREATED.type;
const MODEL_UPDATED = WEBHOOK_EVENTS.MODEL_UPDATED.type;
const MODEL_DELETED = WEBHOOK_EVENTS.MODEL_DELETED.type;
const CUSTOMER_CREATED = WEBHOOK_EVENTS.CUSTOMER_CREATED.type;
const FEATURE_FLAG_EVALUATED = WEBHOOK_EVENTS.FEATURE_FLAG_EVALUATED.type;
const UNKNOWN = 'com.kaiten.future.v1.created';

describe('sortEventTypes', () => {
  it('orders by catalogue group, then catalogue order, then the types it does not offer', () => {
    expect(
      sortEventTypes([
        UNKNOWN,
        CUSTOMER_CREATED,
        FEATURE_FLAG_EVALUATED,
        MODEL_DELETED,
        MODEL_CREATED,
      ]),
    ).toEqual([
      MODEL_CREATED,
      MODEL_DELETED,
      CUSTOMER_CREATED,
      FEATURE_FLAG_EVALUATED,
      UNKNOWN,
    ]);
  });

  it('keeps the catalogue order within a group, which is not alphabetical', () => {
    expect(sortEventTypes([MODEL_DELETED, MODEL_UPDATED])).toEqual([
      MODEL_UPDATED,
      MODEL_DELETED,
    ]);
  });

  it('drops duplicates, reads a missing list as empty and is idempotent', () => {
    const sorted = sortEventTypes([CUSTOMER_CREATED, MODEL_CREATED, CUSTOMER_CREATED]);

    expect(sorted).toEqual([MODEL_CREATED, CUSTOMER_CREATED]);
    expect(sortEventTypes(sorted)).toEqual(sorted);
    expect(sortEventTypes(null)).toEqual([]);
    expect(sortEventTypes(undefined)).toEqual([]);
  });
});

describe('isOfferedType', () => {
  it('offers the events of a group, not the high-volume reads nor unknown types', () => {
    expect(isOfferedType(CUSTOMER_CREATED)).toBe(true);
    expect(isOfferedType(FEATURE_FLAG_EVALUATED)).toBe(false);
    expect(isOfferedType(WEBHOOK_EVENTS.ENTITLEMENT_VALUE_GET.type)).toBe(false);
    expect(isOfferedType(UNKNOWN)).toBe(false);
  });
});

describe('toggleTypes', () => {
  it('adds and removes types and keeps the canonical order', () => {
    const added = toggleTypes([CUSTOMER_CREATED], [MODEL_DELETED, MODEL_CREATED], true);
    expect(added).toEqual([MODEL_CREATED, MODEL_DELETED, CUSTOMER_CREATED]);

    expect(toggleTypes(added, [MODEL_CREATED], false)).toEqual([
      MODEL_DELETED,
      CUSTOMER_CREATED,
    ]);
  });
});

describe('groupCheckState', () => {
  const model = [MODEL_CREATED, MODEL_UPDATED, MODEL_DELETED];

  it('says none, some or all of the visible rows', () => {
    expect(groupCheckState([], model)).toBe('none');
    expect(groupCheckState([MODEL_CREATED], model)).toBe('some');
    expect(groupCheckState(model, model)).toBe('all');
  });

  it('reads only the rows it is given, as a search narrows them', () => {
    expect(groupCheckState([MODEL_CREATED], [MODEL_CREATED])).toBe('all');
    expect(groupCheckState([MODEL_CREATED], [])).toBe('none');
  });
});

describe('presets', () => {
  const first = [MODEL_CREATED, MODEL_UPDATED];
  const second = [MODEL_UPDATED, CUSTOMER_CREATED];

  it('is applied when every type of it is selected', () => {
    expect(isPresetApplied([MODEL_CREATED], first)).toBe(false);
    expect(isPresetApplied([...first, MODEL_DELETED], first)).toBe(true);
    expect(isPresetApplied([MODEL_CREATED], [])).toBe(false);
  });

  it('adds what is missing when it is not applied', () => {
    expect(togglePreset([MODEL_CREATED], first, [])).toEqual(first);
  });

  it('removes its types when applied, but those another applied preset holds', () => {
    const selected = [MODEL_CREATED, MODEL_UPDATED, CUSTOMER_CREATED, MODEL_DELETED];

    expect(togglePreset(selected, first, [second])).toEqual([
      MODEL_UPDATED,
      MODEL_DELETED,
      CUSTOMER_CREATED,
    ]);
    expect(togglePreset(selected, first, [])).toEqual([
      MODEL_DELETED,
      CUSTOMER_CREATED,
    ]);
  });
});

describe('summarizeSelection', () => {
  it('groups the selection in catalogue order, then other, and marks the full groups', () => {
    const modelTotal = SUBSCRIBABLE_WEBHOOK_EVENTS.find(
      (entry) => entry.group === 'model',
    )!.events.length;

    expect(
      summarizeSelection([
        UNKNOWN,
        CUSTOMER_CREATED,
        MODEL_DELETED,
        MODEL_CREATED,
        MODEL_UPDATED,
        FEATURE_FLAG_EVALUATED,
      ]),
    ).toEqual([
      {
        group: 'model',
        types: [MODEL_CREATED, MODEL_UPDATED, MODEL_DELETED],
        total: modelTotal,
        isAll: true,
      },
      {
        group: 'customer',
        types: [CUSTOMER_CREATED],
        total: 4,
        isAll: false,
      },
      {
        group: 'other',
        types: [FEATURE_FLAG_EVALUATED, UNKNOWN],
        total: 2,
        isAll: false,
      },
    ]);
  });

  it('is empty for an empty selection', () => {
    expect(summarizeSelection([])).toEqual([]);
    expect(summarizeSelection(null)).toEqual([]);
  });
});
