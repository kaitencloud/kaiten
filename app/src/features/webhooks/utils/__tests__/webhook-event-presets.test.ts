import { describe, expect, it } from 'vite-plus/test';
import { WEBHOOK_EVENTS } from '../webhook-event-catalogue';
import {
  WEBHOOK_EVENT_PRESET_IDS,
  WEBHOOK_EVENT_PRESETS,
} from '../webhook-event-presets';
import { isOfferedType, sortEventTypes } from '../webhook-event-selection';
import { SUBSCRIBABLE_WEBHOOK_EVENTS } from '../webhook-events';

const typesOf = (...names: (keyof typeof WEBHOOK_EVENTS)[]) =>
  names.map((name) => WEBHOOK_EVENTS[name].type as string);

const typesOfGroup = (group: string) =>
  SUBSCRIBABLE_WEBHOOK_EVENTS.find((entry) => entry.group === group)!.events.map(
    (event) => event.type as string,
  );

// What each preset leaves out of its groups, on purpose: a new event of the
// instance or usage group fails the test below until it is in its preset or here.
const LEFT_OUT_OF_INSTANCE_LIFECYCLE = typesOf(
  'INSTANCE_ENTITLEMENT_EXCEPTION_CREATED',
  'INSTANCE_ENTITLEMENT_EXCEPTION_EXPIRED',
  'INSTANCE_ENTITLEMENT_EXCEPTION_REVOKED',
);
const LEFT_OUT_OF_USAGE_ALERTS = typesOf(
  'ENTITLEMENT_USAGE_REPORT_ACCEPTED',
  'INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER',
);

describe('webhook event presets', () => {
  it('holds 7, 30 and 6 offered events, in the canonical order', () => {
    expect(WEBHOOK_EVENT_PRESETS.instanceLifecycle).toHaveLength(7);
    expect(WEBHOOK_EVENT_PRESETS.billing).toHaveLength(30);
    expect(WEBHOOK_EVENT_PRESETS.usageAlerts).toHaveLength(6);

    for (const id of WEBHOOK_EVENT_PRESET_IDS) {
      const types = WEBHOOK_EVENT_PRESETS[id];
      expect(types.filter((type) => !isOfferedType(type))).toEqual([]);
      expect(sortEventTypes(types)).toEqual(types);
    }
  });

  it('keeps the three presets disjoint', () => {
    const all = WEBHOOK_EVENT_PRESET_IDS.flatMap((id) => WEBHOOK_EVENT_PRESETS[id]);

    expect(new Set(all).size).toBe(all.length);
  });

  it('puts every instance event in Instance lifecycle or in its documented exclusions', () => {
    expect(
      sortEventTypes([
        ...WEBHOOK_EVENT_PRESETS.instanceLifecycle,
        ...LEFT_OUT_OF_INSTANCE_LIFECYCLE,
      ]),
    ).toEqual(sortEventTypes(typesOfGroup('instance')));
  });

  it('puts every usage event in Usage alerts or in its documented exclusions', () => {
    expect(
      sortEventTypes([
        ...WEBHOOK_EVENT_PRESETS.usageAlerts,
        ...LEFT_OUT_OF_USAGE_ALERTS,
      ]),
    ).toEqual(sortEventTypes(typesOfGroup('usage')));
  });

  it('holds every subscription, invoice and payment event in Billing, and nothing else', () => {
    expect(WEBHOOK_EVENT_PRESETS.billing).toEqual(
      sortEventTypes([
        ...typesOfGroup('subscription'),
        ...typesOfGroup('invoice'),
        ...typesOfGroup('payment'),
      ]),
    );
    expect(WEBHOOK_EVENT_PRESETS.billing).not.toEqual(
      expect.arrayContaining(typesOfGroup('checkout')),
    );
  });
});
