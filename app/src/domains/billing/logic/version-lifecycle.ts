/**
 * The lifecycle a sellable version goes through, which the versions of a license and
 * those of an add-on share: a draft goes on sale, a published version is withdrawn, an
 * archived one goes back on sale. Each feature keeps the words and the operations of
 * its own; what is here is the shape of the rule.
 */

export type VersionLifecycleState = 'ARCHIVED' | 'DRAFT' | 'PUBLISHED';

/** The operations a version's state moves through. An update cannot change the state. */
export type VersionLifecycleTransition = 'archive' | 'publish' | 'unarchive';

// Each state accepts exactly one transition. Nothing leads back to DRAFT: a version
// that has been on sale cannot become one that never was.
const TRANSITION_FROM: Record<
  VersionLifecycleState,
  VersionLifecycleTransition
> = {
  ARCHIVED: 'unarchive',
  DRAFT: 'publish',
  PUBLISHED: 'archive',
};

export const getVersionTransition = (
  state: VersionLifecycleState,
): VersionLifecycleTransition => TRANSITION_FROM[state];

/**
 * A family's default must stay PUBLISHED, so the API refuses to archive it until
 * another version takes its place or the flag is unset. The console withholds the
 * action and says why.
 */
export const isDefaultArchiveBlocked = (
  state: VersionLifecycleState,
  isDefault: boolean | undefined,
): boolean => Boolean(isDefault) && getVersionTransition(state) === 'archive';
