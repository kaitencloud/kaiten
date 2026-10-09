import type { Addon } from '@/api-client';

/**
 * What a version of an add-on is called where it is chosen, listed or titled: its
 * name, and which version it is, since the versions of a product share a name.
 */
export const getAddonTitle = (
  addon: Pick<Addon, 'name' | 'versionName'>,
): string => `${addon.name} · ${addon.versionName}`;
