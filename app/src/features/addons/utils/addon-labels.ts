import type { AddonLifecycleState, AddonPricingType } from '../types';
import type { AddonLifecycleTransition } from './addon-lifecycle.utils';

// Every label an enum of an add-on reads under is typed against the contract
// (`satisfies Record<Enum, string>`) and written out in full, since no check reads a
// key built from a value at run time: a state the API adds fails the type check until
// it reads in both languages, and a key that does not exist fails the check of the keys.

export const LIFECYCLE_LABEL_KEYS = {
  ARCHIVED: 'Pages.Addons.Lifecycle.ARCHIVED',
  DRAFT: 'Pages.Addons.Lifecycle.DRAFT',
  PUBLISHED: 'Pages.Addons.Lifecycle.PUBLISHED',
} as const satisfies Record<AddonLifecycleState, string>;

export const PRICING_TYPE_LABEL_KEYS = {
  CUSTOM: 'Pages.Addons.PricingTypes.CUSTOM',
  FREE: 'Pages.Addons.PricingTypes.FREE',
  PAID: 'Pages.Addons.PricingTypes.PAID',
} as const satisfies Record<AddonPricingType, string>;

type TransitionKeys = Record<
  'confirm' | 'description' | 'label' | 'success' | 'title',
  string
>;

/** What each transition of the lifecycle says: its button, its confirmation and its toast. */
export const TRANSITION_KEYS = {
  archive: {
    confirm: 'Pages.Addons.LifecycleActions.archive.confirm',
    description: 'Pages.Addons.LifecycleActions.archive.description',
    label: 'Pages.Addons.LifecycleActions.archive.label',
    success: 'Pages.Addons.LifecycleActions.archive.success',
    title: 'Pages.Addons.LifecycleActions.archive.title',
  },
  publish: {
    confirm: 'Pages.Addons.LifecycleActions.publish.confirm',
    description: 'Pages.Addons.LifecycleActions.publish.description',
    label: 'Pages.Addons.LifecycleActions.publish.label',
    success: 'Pages.Addons.LifecycleActions.publish.success',
    title: 'Pages.Addons.LifecycleActions.publish.title',
  },
  unarchive: {
    confirm: 'Pages.Addons.LifecycleActions.unarchive.confirm',
    description: 'Pages.Addons.LifecycleActions.unarchive.description',
    label: 'Pages.Addons.LifecycleActions.unarchive.label',
    success: 'Pages.Addons.LifecycleActions.unarchive.success',
    title: 'Pages.Addons.LifecycleActions.unarchive.title',
  },
} as const satisfies Record<AddonLifecycleTransition, TransitionKeys>;

/** The tabs of a version that are not its overview. */
export const DETAIL_TAB_LABEL_KEYS = {
  compatibility: 'Pages.Addons.Detail.Tabs.compatibility',
  entitlements: 'Pages.Addons.Detail.Tabs.entitlements',
  prices: 'Pages.Addons.Detail.Tabs.prices',
} as const;

/** What the deletion of a draft says: its button and its confirmation. */
export const DELETE_DRAFT_KEYS = {
  confirm: 'Pages.Addons.DeleteDraft.confirm',
  description: 'Pages.Addons.DeleteDraft.description',
  label: 'Pages.Addons.DeleteDraft.label',
  title: 'Pages.Addons.DeleteDraft.title',
} as const;
