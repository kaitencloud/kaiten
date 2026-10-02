import type { PageAuditTrail, Webhooks } from '@/api-client';
import type { GetGlobalAuditTrailQuery } from '@/api-client/graphql/graphql';
import { zPageAuditTrail } from '@/api-client/zod.gen';
import { parseAuditEventContract } from '../contracts/audit-event-contract';
import { parseContract } from '../contracts/openapi-contract';

type AuditTrailRow =
  GetGlobalAuditTrailQuery['organizationAuditTrails']['items'][number];

/**
 * An event the API records. `eventName` is typed against the events the OpenAPI
 * document declares, so a seed cannot name one the API never emits, and
 * `payload` is what that event carries: the model checks the name, the
 * versioned type and the payload against the event's schema. Whatever else the
 * event leaves out, such as an instance for an organization-level event, the
 * API answers as null.
 */
export type AuditTrailSeedEntry = Pick<
  AuditTrailRow,
  'eventType' | 'id' | 'timestamp'
> &
  Partial<Omit<AuditTrailRow, 'eventName' | 'payload'>> & {
    eventName: Webhooks['body']['name'];
    payload: Record<string, unknown>;
  };

export type SerializedAuditTrailAppModel = {
  entries: AuditTrailSeedEntry[];
};

// The limit the API applies when the query names none.
const DEFAULT_LIMIT = 500;

const toRow = (entry: AuditTrailSeedEntry): AuditTrailRow => ({
  customerName: null,
  instanceId: null,
  instanceName: null,
  instanceSlug: null,
  ...entry,
});

/** The organization's audit trail, read-only: the console has no write on it. */
export class AuditTrailAppModel {
  private readonly entries: AuditTrailSeedEntry[];

  constructor(entries: AuditTrailSeedEntry[]) {
    for (const entry of entries) {
      parseAuditEventContract(
        { data: entry.payload, name: entry.eventName, type: entry.eventType },
        `Audit trail entry ${entry.id} (${entry.eventName})`,
      );
    }
    this.entries = entries;
  }

  static fromSerialized(state: SerializedAuditTrailAppModel) {
    return new AuditTrailAppModel(state.entries);
  }

  serializeForMsw(): SerializedAuditTrailAppModel {
    return { entries: this.entries };
  }

  /**
   * Answers `organizationAuditTrails(limit)`, newest first like the API. Takes
   * the variables of the request as the two mock layers receive them.
   */
  getGlobalAuditTrail(
    variables?: Record<string, unknown>,
  ): GetGlobalAuditTrailQuery {
    const limit =
      typeof variables?.limit === 'number' ? variables.limit : DEFAULT_LIMIT;

    return {
      organizationAuditTrails: {
        items: this.newestFirst().slice(0, limit).map(toRow),
      },
    };
  }

  /**
   * Answers `GET /instances/{instanceSlug}/audit-trails`, the tab of an
   * instance: the events of that instance, newest first, and only those of one
   * event name when the query names one.
   */
  getInstanceAuditTrail(
    instanceSlug: string,
    {
      eventName,
      limit = DEFAULT_LIMIT,
    }: { eventName?: string; limit?: number } = {},
  ): PageAuditTrail {
    const events = this.newestFirst().filter(
      (entry) =>
        entry.instanceSlug === instanceSlug &&
        (eventName === undefined || entry.eventName === eventName),
    );

    return parseContract(
      zPageAuditTrail,
      {
        hasMore: events.length > limit,
        items: events.slice(0, limit).map((entry) => ({
          eventName: entry.eventName,
          eventType: entry.eventType,
          id: entry.id,
          ...(entry.instanceId ? { instanceId: entry.instanceId } : {}),
          instanceSlug,
          payload: entry.payload,
          timestamp: entry.timestamp,
        })),
      },
      'AuditTrailAppModel.getInstanceAuditTrail result',
    );
  }

  private newestFirst() {
    return [...this.entries].sort(
      (left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp),
    );
  }
}
