import { useQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { type AttioSyncInfo, getAttioSyncInfo } from '../logic';

const DELAYED_STATE_TTL_MS = 5 * 60_000;

export type CrmSyncEntityKind = 'customer' | 'instance';
export type CrmSyncStatus = 'idle' | 'pending' | 'delayed';

export type CrmSyncState = {
  status: CrmSyncStatus;
};

export type CrmSyncTarget = {
  entityKind: CrmSyncEntityKind;
  entitySlug: string;
};

type DelayedExpiry = {
  timer: ReturnType<typeof setTimeout>;
};

const delayedExpiries = new WeakMap<QueryClient, Map<string, DelayedExpiry>>();

export const crmSyncStateQueryKey = ({
  entityKind,
  entitySlug,
}: CrmSyncTarget) => ['crm-sync', 'state', entityKind, entitySlug] as const;

export function useCrmSyncState(target: CrmSyncTarget): CrmSyncState {
  const { data } = useQuery({
    queryKey: crmSyncStateQueryKey(target),
    queryFn: async (): Promise<CrmSyncState> => ({ status: 'idle' }),
    enabled: false,
    gcTime: Number.POSITIVE_INFINITY,
    initialData: { status: 'idle' } satisfies CrmSyncState,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return data as CrmSyncState;
}

export function useAttioSyncCardVisible(
  target: CrmSyncTarget,
  integrations: Record<string, unknown> | null | undefined,
) {
  const syncInfo = getAttioSyncInfo(integrations);
  const syncState = useCrmSyncState(target);
  return isAttioSyncCardVisible(syncInfo, syncState);
}

export function isAttioSyncCardVisible(
  syncInfo: AttioSyncInfo | null,
  syncState: CrmSyncState,
) {
  return Boolean(syncInfo) || syncState.status !== 'idle';
}

export function setCrmSyncState(
  queryClient: QueryClient,
  target: CrmSyncTarget,
  status: CrmSyncStatus,
) {
  if (status !== 'delayed') {
    clearDelayedExpiry(queryClient, target);
  }
  queryClient.setQueryData<CrmSyncState>(crmSyncStateQueryKey(target), {
    status,
  });
}

export function setDelayedCrmSyncState(
  queryClient: QueryClient,
  target: CrmSyncTarget,
) {
  clearDelayedExpiry(queryClient, target);
  setCrmSyncState(queryClient, target, 'delayed');

  const key = toTargetKey(target);
  const expiries = getDelayedExpiries(queryClient);
  const expiry: DelayedExpiry = {
    timer: setTimeout(() => {
      if (expiries.get(key) !== expiry) {
        return;
      }
      expiries.delete(key);
      if (
        queryClient.getQueryData<CrmSyncState>(crmSyncStateQueryKey(target))
          ?.status === 'delayed'
      ) {
        setCrmSyncState(queryClient, target, 'idle');
      }
    }, DELAYED_STATE_TTL_MS),
  };
  expiries.set(key, expiry);
}

export function clearCrmSyncState(
  queryClient: QueryClient,
  target: CrmSyncTarget,
) {
  clearDelayedExpiry(queryClient, target);
  setCrmSyncState(queryClient, target, 'idle');
}

function getDelayedExpiries(queryClient: QueryClient) {
  let expiries = delayedExpiries.get(queryClient);
  if (!expiries) {
    expiries = new Map();
    delayedExpiries.set(queryClient, expiries);
  }
  return expiries;
}

function clearDelayedExpiry(queryClient: QueryClient, target: CrmSyncTarget) {
  const key = toTargetKey(target);
  const expiries = delayedExpiries.get(queryClient);
  const expiry = expiries?.get(key);
  if (!expiry) {
    return;
  }

  clearTimeout(expiry.timer);
  expiries?.delete(key);
}

function toTargetKey({ entityKind, entitySlug }: CrmSyncTarget) {
  return `${entityKind}:${entitySlug}`;
}
