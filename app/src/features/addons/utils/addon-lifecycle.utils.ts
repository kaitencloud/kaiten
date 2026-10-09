import type { Addon } from '@/api-client';
import {
  getVersionTransition,
  isDefaultArchiveBlocked,
  type VersionLifecycleTransition,
} from '@/domains/billing';

/** The operations a version's state moves through. An update cannot change the state. */
export type AddonLifecycleTransition = VersionLifecycleTransition;

/** The one transition the state of a version accepts; the rule is the billing domain's. */
export const getLifecycleTransition = (
  addon: Pick<Addon, 'lifecycleState'>,
): AddonLifecycleTransition => getVersionTransition(addon.lifecycleState);

/**
 * Only a PUBLISHED version may be the default of its family: the default is the
 * version the family resolves to, and nothing serves an unpublished one. The API
 * refuses the rest (`UpdateAddon.DefaultMustBePublished`), so the console does not
 * offer the action.
 */
export const canBecomeDefault = (
  addon: Pick<Addon, 'isDefault' | 'lifecycleState'>,
): boolean => !addon.isDefault && addon.lifecycleState === 'PUBLISHED';

/**
 * A family's default must stay PUBLISHED, so the API refuses to archive it
 * (`ArchiveAddon.DefaultMustBePublished`) until another version takes its place
 * or the flag is unset. The console withholds the action and says why.
 */
export const isLifecycleTransitionBlocked = (
  addon: Pick<Addon, 'isDefault' | 'lifecycleState'>,
): boolean => isDefaultArchiveBlocked(addon.lifecycleState, addon.isDefault);

/** Whether the version is on sale: what an instance with a live subscription may attach. */
export const isPublished = (addon: Pick<Addon, 'lifecycleState'>): boolean =>
  addon.lifecycleState === 'PUBLISHED';
