import { useEffect } from 'react';
import { pruneFormRecoveryAtStartup } from '@/lib/form-recovery';
import { getSessionIdentity } from '@/lib/session-identity';

/**
 * Once the person is known (call it from a component that only renders signed
 * in): drops the stored input of creation forms that expired and what another
 * user of this browser left behind.
 */
export function usePruneFormRecoveryAtStartup(): void {
  useEffect(() => {
    void pruneFormRecoveryAtStartup(getSessionIdentity());
  }, []);
}
