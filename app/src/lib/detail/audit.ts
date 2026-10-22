import i18n from 'i18next';

/**
 * The identities that stand for Kaiten itself: the external id of the platform user,
 * `system:kaiten`, and the id its row is pinned to. It is the actor of what no person
 * of the organization did: the jobs of billing, and the writes of an anonymous checkout,
 * which no principal of the vendor initiates.
 */
const SYSTEM_ACTOR_IDS: ReadonlySet<string> = new Set([
  'system:kaiten',
  '00000000-0000-0000-0000-000000000001',
]);

type ActorRecord = {
  id?: unknown;
  name?: unknown;
};

type GetAuditDisplayNameParams = {
  actor: unknown;
  fallbackId?: string;
  /**
   * What to show when nothing names the actor. Defaults to an empty string:
   * a line that reads "by Unknown user" tells the reader nothing, so callers
   * hide the line instead.
   */
  unknownLabel?: string;
};

const isSystemActor = (actor: unknown) =>
  typeof actor === 'string'
    ? SYSTEM_ACTOR_IDS.has(actor)
    : typeof actor === 'object' &&
      actor !== null &&
      typeof (actor as ActorRecord).id === 'string' &&
      SYSTEM_ACTOR_IDS.has((actor as ActorRecord).id as string);

/**
 * The name to show for who created or last changed a record. The system actor reads as
 * "Kaiten (system)" whatever it is named or not named: a person never did it, and the
 * raw id of the platform user says nothing to the one who reads it.
 */
export const getAuditDisplayName = ({
  actor,
  fallbackId = '',
  unknownLabel = '',
}: GetAuditDisplayNameParams) => {
  if (isSystemActor(actor)) {
    return i18n.t('Common.systemActor');
  }

  if (typeof actor === 'string' && actor.trim().length > 0) {
    return actor;
  }

  if (actor && typeof actor === 'object') {
    const actorRecord = actor as ActorRecord;

    if (
      typeof actorRecord.name === 'string' &&
      actorRecord.name.trim().length > 0
    ) {
      return actorRecord.name;
    }

    if (
      typeof actorRecord.id === 'string' &&
      actorRecord.id.trim().length > 0
    ) {
      return actorRecord.id;
    }
  }

  if (fallbackId.trim().length > 0) {
    return fallbackId;
  }

  return unknownLabel;
};
