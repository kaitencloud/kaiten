import type { Addon } from '@/api-client';

/**
 * What a version of the catalogue is called where it is chosen, listed or titled: its
 * name, and which version it is, since the versions of a product share a name. An
 * add-on an instance holds is not named from the catalogue: its attachment carries the
 * name of its version (`InstanceAddon.name`).
 */
export const getAddonTitle = (
  addon: Pick<Addon, 'name' | 'versionName'>,
): string => `${addon.name} · ${addon.versionName}`;
