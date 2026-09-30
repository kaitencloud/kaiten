import Papa from 'papaparse';
import { describe, expect, it } from 'vite-plus/test';

import { buildAuditTrailCsv } from '../audit-trail-export';
import { AUDIT_EVENT_LABEL_KEYS } from '../audit-trail-events';
import type { AuditFilters, GlobalAuditEntry } from '../audit-trail.types';
import {
  DEFAULT_AUDIT_FILTERS,
  filterAuditEntries,
  getEventCategory,
} from '../audit-trail.utils';

// The status of every event of the contract. Each list is a decision: adding
// an event to one, or to `KNOWN_CATEGORIES`, is a product call, and an event
// that moves between lists changes the stat cards, the status filter, the badge
// and the CSV export. Every event not listed reads as a plain read.

// An entitlement's usage is approaching, at or past its limit, while the API
// still accepts the usage.
const WARNING_EVENTS = [
  'INSTANCE_ENTITLEMENT_CAP_EXCEEDED',
  'INSTANCE_ENTITLEMENT_USAGE_REACHED',
  'INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED',
];

// Something was taken, created or put in place.
const ACCEPTED_EVENTS = [
  'COMPONENT_CREATED',
  'CUSTOMER_CREATED',
  'DEPLOYMENT_ZONE_CREATED',
  'ENTITLEMENT_CREATED',
  'ENTITLEMENT_GROUP_CREATED',
  'ENTITLEMENT_USAGE_REPORT_ACCEPTED',
  'FEATURE_FLAG_CREATED',
  'INSTANCE_CREATED',
  'INSTANCE_DEPLOYED',
  'LICENSE_CREATED',
  'LICENSE_ENTITLEMENT_ASSIGNED',
  'LICENSE_FAMILY_CREATED',
  'METADATA_FIELD_CREATED',
  'RELEASE_CREATED',
  'RELEASE_DEPLOYED',
];

// The API refused.
const REJECTED_EVENTS = [
  'CUSTOMER_CREATION_REJECTED',
  'ENTITLEMENT_USAGE_REPORT_REJECTED',
];

const eventsWithStatus = (category: string) =>
  Object.keys(AUDIT_EVENT_LABEL_KEYS)
    .filter((eventName) => getEventCategory(eventName) === category)
    .sort();

const entry = (id: string, eventName: string): GlobalAuditEntry => ({
  id,
  eventName,
  eventType: `com.kaiten.test.v1.${eventName.toLowerCase()}`,
  timestamp: '2026-09-30T10:00:00.000Z',
});

const withStatus = (status: string): AuditFilters => ({
  ...DEFAULT_AUDIT_FILTERS,
  status,
});

const label = (eventName: string) => eventName;

describe('event status', () => {
  it('reads as a warning exactly the usage events that say a limit is at hand', () => {
    expect(eventsWithStatus('warning')).toEqual(WARNING_EVENTS);
  });

  it('reads as accepted exactly the events that took or created something', () => {
    expect(eventsWithStatus('accepted')).toEqual(ACCEPTED_EVENTS);
  });

  it('reads as rejected exactly the events where the API refused', () => {
    expect(eventsWithStatus('rejected')).toEqual(REJECTED_EVENTS);
  });

  it.each([
    // A refusal is not a warning: the usage was not taken.
    ['ENTITLEMENT_USAGE_REPORT_REJECTED', 'rejected'],
    ['CUSTOMER_CREATION_REJECTED', 'rejected'],
    // The report that sits next to a soft-limit overage is still accepted.
    ['ENTITLEMENT_USAGE_REPORT_ACCEPTED', 'accepted'],
    // Whether a status change is bad news depends on the new status, which
    // the name does not carry.
    ['INSTANCE_STATUS_CHANGED', 'read'],
    ['INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER', 'read'],
    ['ENTITLEMENT_VALUE_GET', 'read'],
    // An unassignment is a removal like a deletion, not the opposite of an
    // assignment: `unassigned` is not the word `assigned`.
    ['LICENSE_ENTITLEMENT_UNASSIGNED', 'read'],
    ['LICENSE_ENTITLEMENT_ASSIGNED', 'accepted'],
  ])('reads %s as %s', (eventName, category) => {
    expect(getEventCategory(eventName)).toBe(category);
  });

  // An event newer than the build is coloured from its last word, and is never
  // guessed to be a warning.
  it.each([
    ['WIDGET_REJECTED', 'rejected'],
    ['WIDGET_FAILED', 'rejected'],
    ['WIDGET_REVOKED', 'rejected'],
    ['WIDGET_SUSPENDED', 'rejected'],
    ['WIDGET_DENIED', 'rejected'],
    ['WIDGET_ERROR', 'rejected'],
    ['WIDGET_ACCEPTED', 'accepted'],
    ['WIDGET_SUCCEEDED', 'accepted'],
    ['WIDGET_ASSIGNED', 'accepted'],
    ['WIDGET_CREATED', 'accepted'],
    ['WIDGET_INVITED', 'accepted'],
    ['WIDGET_DEPLOYED', 'accepted'],
    ['WIDGET_FROBNICATED', 'read'],
    ['WIDGET_WARNING', 'read'],
    ['WIDGET_THRESHOLD_REACHED', 'read'],
    ['WIDGET_DEGRADED', 'read'],
  ])('reads the unknown event %s as %s', (eventName, category) => {
    expect(getEventCategory(eventName)).toBe(category);
  });

  // A hint is a whole word: the undoing of a hinted action does not share the
  // colour of the action.
  it.each([
    'WIDGET_UNASSIGNED',
    'WIDGET_UNCREATED',
    'WIDGET_UNDEPLOYED',
  ])('does not read %s from the tail of its last word', (eventName) => {
    expect(getEventCategory(eventName)).toBe('read');
  });

  it('does not take an Object.prototype member for a mapped event', () => {
    expect(getEventCategory('constructor')).toBe('read');
    expect(getEventCategory('toString')).toBe('read');
  });
});

describe('status shown across the audit trail', () => {
  const entries = [
    entry('1', 'INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED'),
    entry('2', 'INSTANCE_ENTITLEMENT_CAP_EXCEEDED'),
    entry('3', 'INSTANCE_ENTITLEMENT_USAGE_REACHED'),
    entry('4', 'ENTITLEMENT_USAGE_REPORT_REJECTED'),
    entry('5', 'ENTITLEMENT_USAGE_REPORT_ACCEPTED'),
    entry('6', 'FEATURE_FLAG_UPDATED'),
  ];

  it('filters the warning status down to the warning events', () => {
    const ids = filterAuditEntries(entries, withStatus('warning'), label).map(
      ({ id }) => id,
    );

    expect(ids).toEqual(['1', '2', '3']);
  });

  it('keeps the warning events out of the other statuses', () => {
    for (const status of ['accepted', 'rejected', 'read']) {
      const names = filterAuditEntries(entries, withStatus(status), label).map(
        ({ eventName }) => eventName,
      );

      expect(names.filter((name) => WARNING_EVENTS.includes(name))).toEqual([]);
    }
  });

  it('exports the same status the filter uses', () => {
    const rows = Papa.parse<Record<string, string>>(
      buildAuditTrailCsv(entries, label),
      { header: true },
    ).data;

    expect(
      rows.filter((row) => row.status === 'warning').map((row) => row.id),
    ).toEqual(['1', '2', '3']);
  });
});
