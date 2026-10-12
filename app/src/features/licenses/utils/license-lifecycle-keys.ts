import type {
  VersionDeleteKeys,
  VersionLifecycleKeys,
} from '@/domains/billing';
import type { LicenseLifecycleState } from './license-lifecycle.utils';

// Written out in full, since no check reads a key built from a value at run time.

export const LIFECYCLE_LABEL_KEYS = {
  ARCHIVED: 'Pages.Licenses.Lifecycle.ARCHIVED',
  DRAFT: 'Pages.Licenses.Lifecycle.DRAFT',
  PUBLISHED: 'Pages.Licenses.Lifecycle.PUBLISHED',
} as const satisfies Record<LicenseLifecycleState, string>;

/** What each transition of the lifecycle says: its button and its confirmation. */
export const LIFECYCLE_ACTION_KEYS = {
  archive: {
    confirm: 'Pages.Licenses.LifecycleActions.archive.confirm',
    description: 'Pages.Licenses.LifecycleActions.archive.description',
    label: 'Pages.Licenses.LifecycleActions.archive.label',
    title: 'Pages.Licenses.LifecycleActions.archive.title',
  },
  publish: {
    confirm: 'Pages.Licenses.LifecycleActions.publish.confirm',
    description: 'Pages.Licenses.LifecycleActions.publish.description',
    label: 'Pages.Licenses.LifecycleActions.publish.label',
    title: 'Pages.Licenses.LifecycleActions.publish.title',
  },
  unarchive: {
    confirm: 'Pages.Licenses.LifecycleActions.unarchive.confirm',
    description: 'Pages.Licenses.LifecycleActions.unarchive.description',
    label: 'Pages.Licenses.LifecycleActions.unarchive.label',
    title: 'Pages.Licenses.LifecycleActions.unarchive.title',
  },
} as const satisfies VersionLifecycleKeys;

/** What the deletion of a draft says; the description depends on whether billing is on. */
export const DELETE_DRAFT_KEYS = {
  confirm: 'Pages.Licenses.DeleteDraft.confirm',
  description: 'Pages.Licenses.DeleteDraft.description',
  descriptionBilling: 'Pages.Licenses.DeleteDraft.descriptionBilling',
  label: 'Pages.Licenses.DeleteDraft.label',
  title: 'Pages.Licenses.DeleteDraft.title',
} as const satisfies VersionDeleteKeys & { descriptionBilling: string };
