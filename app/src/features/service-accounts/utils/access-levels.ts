import { API_SCOPE_PERMISSIONS } from '@/lib/api/scopes.gen';
import type {
  AccessLevel,
  AccessLevels,
  PermissionType,
  ResourceType,
} from '../types';

const RANK: Record<AccessLevel, number> = { none: 0, read: 1, write: 2 };

const higher = (a: AccessLevel, b: AccessLevel): AccessLevel =>
  RANK[a] >= RANK[b] ? a : b;

export const getAccessLevel = (
  levels: AccessLevels,
  resource: ResourceType,
): AccessLevel => levels[resource] ?? 'none';

export function setAccessLevel(
  levels: AccessLevels,
  resource: ResourceType,
  level: AccessLevel,
): AccessLevels {
  const next = { ...levels };
  if (level === 'none') {
    delete next[resource];
  } else {
    next[resource] = level;
  }
  return next;
}

const entries = (levels: AccessLevels) =>
  Object.entries(levels) as [ResourceType, PermissionType][];

/**
 * The scopes a token with these levels carries, sorted. A level brings the
 * ones below it: Read & write is `read:<resource>` and `write:<resource>`. The
 * API would read `write:` alone as both, but the page says "Read & write", and
 * the scopes it shows, sends and later lists on the token should say the same.
 */
export const accessLevelsToScopes = (levels: AccessLevels): string[] =>
  entries(levels)
    .flatMap(([resource, level]) =>
      API_SCOPE_PERMISSIONS.filter(
        (permission) => RANK[permission] <= RANK[level],
      ).map((permission) => `${permission}:${resource}`),
    )
    .sort();

/** True when every resource of the preset has at least the preset's level. */
export const includesPreset = (
  levels: AccessLevels,
  preset: AccessLevels,
): boolean =>
  entries(preset).every(
    ([resource, level]) =>
      RANK[getAccessLevel(levels, resource)] >= RANK[level],
  );

/** Raises each resource of the preset to the preset's level, lowering none. */
export function applyPreset(
  levels: AccessLevels,
  preset: AccessLevels,
): AccessLevels {
  let next = levels;
  for (const [resource, level] of entries(preset)) {
    next = setAccessLevel(
      next,
      resource,
      higher(getAccessLevel(next, resource), level),
    );
  }
  return next;
}

/**
 * Takes a preset back out: each of its resources returns to what the presets
 * still applied need, and to no access when none of them names it.
 */
export function removePreset(
  levels: AccessLevels,
  preset: AccessLevels,
  keptPresets: AccessLevels[],
): AccessLevels {
  let next = levels;
  for (const [resource] of entries(preset)) {
    const kept = keptPresets.reduce<AccessLevel>(
      (level, other) => higher(level, getAccessLevel(other, resource)),
      'none',
    );
    next = setAccessLevel(next, resource, kept);
  }
  return next;
}
