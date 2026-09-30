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

export const getAuditDisplayName = ({
  actor,
  fallbackId = '',
  unknownLabel = '',
}: GetAuditDisplayNameParams) => {
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
