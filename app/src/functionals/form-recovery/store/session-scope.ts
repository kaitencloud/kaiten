import {
  liveLineages,
  readScope,
  removeRecord,
  type FormRecoveryEntry,
  type FormRecoveryScopeSnapshot,
} from '@/lib/form-recovery';
import type { SessionContext } from './session-context';
import { observeOwnLineage } from './session-observe';

function isIncompatible(
  ctx: SessionContext,
  entry: FormRecoveryEntry,
): boolean {
  const below = ctx.config.descriptor.incompatibleBelow;
  return below !== undefined && entry.formVersion < below;
}

/**
 * Sets the offer, the notices of opening and the follow-up from what the scope
 * holds, and watches the own lineage. `ready` says the Web Locks were asked, so
 * that no entry another tab holds is offered.
 */
export function applyScope(
  ctx: SessionContext,
  scope: FormRecoveryScopeSnapshot,
  live: ReadonlySet<string>,
  ready: boolean,
) {
  const { runtime, store } = ctx;
  // Creation only reads: the own lineage is watched once the mount started.
  if (runtime.alive) observeOwnLineage(ctx, scope);

  const own = store.state.lineageId;
  const others = scope.entries.filter((entry) => entry.lineageId !== own);

  // An incompatible entry another tab holds is that tab's work, often one
  // still on the bundle from before a deploy: it is left alone, as `held`,
  // and removed once nobody holds it. Nothing is removed before the Web Locks
  // are known, nor by a creation, which only reads.
  const incompatible =
    ready && runtime.alive
      ? others.filter(
          (entry) => isIncompatible(ctx, entry) && !live.has(entry.key),
        )
      : [];
  for (const entry of incompatible) void removeRecord(entry.key);

  const held = others.filter((entry) => live.has(entry.key));
  const candidates = others
    .filter((entry) => !isIncompatible(ctx, entry) && !live.has(entry.key))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const followUp = scope.tombstones
    .filter(
      (item) =>
        item.followUp &&
        !item.followUpSeen &&
        item.reason === 'sent' &&
        item.created !== null &&
        item.lineageId !== own,
    )
    .sort((a, b) => b.at.localeCompare(a.at))[0];

  const newestLost = [...incompatible].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )[0];

  ctx.setState({
    candidates,
    skipped: store.state.skipped.filter((key) =>
      candidates.some((entry) => entry.key === key),
    ),
    offerReady: store.state.offerReady || ready,
    openElsewhere: held.length > 0 && !runtime.openElsewhereDismissed,
    lost: newestLost ? { savedAt: newestLost.updatedAt } : store.state.lost,
    followUp: followUp
      ? {
          key: followUp.key,
          created: {
            id: followUp.created!.id,
            label: followUp.created!.label ?? undefined,
          },
        }
      : null,
  });
}

/** Reads the scope and the Web Locks again, and applies them. */
export async function refresh(ctx: SessionContext): Promise<void> {
  const { runtime } = ctx;
  const token = ++runtime.refreshToken;

  const live = await liveLineages();
  if (!runtime.alive || token !== runtime.refreshToken) return;

  runtime.live = live;
  applyScope(ctx, readScope(runtime.scope, ctx.now()), live, true);
}
