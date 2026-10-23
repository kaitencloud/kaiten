import type { SessionIdentity } from '@/lib/session-identity';
import { formRecoveryStorageHasData } from './form-recovery-collection';
import { liveLineages } from './form-recovery-locks';
import { pruneRecords } from './form-recovery-maintenance';

/**
 * Once per page load, as soon as the identity is known: removes what expired,
 * what has the wrong shape and what belongs to another user of this browser.
 * Does nothing, and creates no collection, when the storage holds no key.
 */
export async function pruneFormRecoveryAtStartup(
  identity: SessionIdentity | null,
): Promise<void> {
  if (!formRecoveryStorageHasData()) {
    return;
  }

  await pruneRecords(new Date(), identity, await liveLineages());
}
