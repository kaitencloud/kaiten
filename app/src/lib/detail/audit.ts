import i18n from 'i18next';

/**
 * The identities that stand for Kaiten itself: the external id of the platform user,
 * `system:kaiten`, and the id its row is pinned to. An actor the API gives the kind
 * `SYSTEM` is Kaiten as well, whatever its id. It is the actor of what no person
 * of the organization did: the jobs of billing, and the writes of an anonymous checkout,
 * which no principal of the vendor initiates.
 *
 * The API names the actor by external id where it can, and by id where it only has the
 * row; the console cannot tell which it will be given, so it knows both. The id is the
 * one the platform-identity migration pins (`platformidentity.ID` in the API), so it
 * does not change.
 */
const SYSTEM_ACTOR_IDS: ReadonlySet<string> = new Set([
  'system:kaiten',
  '00000000-0000-0000-0000-000000000001',
]);

type ActorRecord = {
  id?: unknown;
  kind?: unknown;
  name?: unknown;
};

/** The kind the API gives the actor that is Kaiten itself (`AuditActor.kind`). */
const SYSTEM_ACTOR_KIND = 'SYSTEM';

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

const isSystemActor = (actor: unknown) => {
  if (typeof actor === 'string') {
    return SYSTEM_ACTOR_IDS.has(actor);
  }

  if (typeof actor !== 'object' || actor === null) {
    return false;
  }

  const { id, kind } = actor as ActorRecord;

  return (
    kind === SYSTEM_ACTOR_KIND ||
    (typeof id === 'string' && SYSTEM_ACTOR_IDS.has(id))
  );
};

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
