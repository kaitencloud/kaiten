import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import {
  createServiceAccountMutation,
  createServiceAccountTokenMutation,
  deleteServiceAccountMutation,
  deleteServiceAccountTokenMutation,
  getServiceAccountQueryKey,
  getServiceAccountsQueryKey,
} from '@/api-client/@tanstack/react-query.gen';
import type { TokenCreateData } from '../types';

// The list embeds every account's tokens, and so does the single account the
// new-token route loads: a token change is stale in both.
const invalidateServiceAccounts = async (
  queryClient: QueryClient,
  serviceAccountSlug?: string,
) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: getServiceAccountsQueryKey() }),
    serviceAccountSlug
      ? queryClient.invalidateQueries({
          queryKey: getServiceAccountQueryKey({ path: { serviceAccountSlug } }),
        })
      : undefined,
  ]);
};

const handleMutationError = (error: unknown) => {
  toast.error(getApiErrorMessage(error));
};

const createTokenBody = (data: TokenCreateData) => ({
  name: data.name,
  scopes: data.scopes,
  expiresAt: data.expiresAt
    ? new Date(data.expiresAt).toISOString()
    : undefined,
});

function useCreateServiceAccountMutation(queryClient: QueryClient) {
  return useMutation({
    ...createServiceAccountMutation(),
    onSuccess: async () => {
      await invalidateServiceAccounts(queryClient);
    },
    onError: handleMutationError,
  });
}

function useDeleteTokenMutation(queryClient: QueryClient, t: TFunction) {
  return useMutation({
    ...deleteServiceAccountTokenMutation(),
    onSuccess: async (_data, { path }) => {
      await invalidateServiceAccounts(queryClient, path.serviceAccountSlug);
      toast.success(
        t('Pages.Integrations.ServiceAccounts.Token.revokeSuccess'),
      );
    },
    onError: handleMutationError,
  });
}

/**
 * Creates a token on one service account. The plaintext comes back once, in the
 * mutation's data, and lives nowhere else: not in the query cache, not in the URL.
 */
export function useCreateServiceAccountToken(serviceAccountSlug: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...createServiceAccountTokenMutation(),
    // A mutation outlives its component for five minutes by default, data
    // included: drop it as soon as the page that showed the token is left.
    gcTime: 0,
    onSuccess: async () => {
      await invalidateServiceAccounts(queryClient, serviceAccountSlug);
    },
    onError: handleMutationError,
  });

  const createToken = (data: TokenCreateData) =>
    mutation
      .mutateAsync({
        path: { serviceAccountSlug },
        body: createTokenBody(data),
      })
      // Already reported by onError; the form only needs to stop submitting.
      .catch(() => undefined);

  return { createToken, createdToken: mutation.data ?? null };
}

/**
 * Deletes a service account. The API revokes every token it holds in the same
 * call, so the list is refetched and the account's own query dropped.
 */
function useDeleteServiceAccountMutation(
  queryClient: QueryClient,
  t: TFunction,
) {
  return useMutation({
    ...deleteServiceAccountMutation(),
    onSuccess: async (_data, { path }) => {
      queryClient.removeQueries({
        queryKey: getServiceAccountQueryKey({
          path: { serviceAccountSlug: path.serviceAccountSlug },
        }),
      });
      await invalidateServiceAccounts(queryClient);
      toast.success(t('Pages.Integrations.ServiceAccounts.deleteSuccess'));
    },
    onError: handleMutationError,
  });
}

export function useServiceAccountsMutations() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const createServiceAccount = useCreateServiceAccountMutation(queryClient);
  const deleteToken = useDeleteTokenMutation(queryClient, t);
  const deleteServiceAccount = useDeleteServiceAccountMutation(queryClient, t);

  const handleCreateSA = (name: string) => {
    createServiceAccount.mutate({
      body: { name },
    });
  };

  const handleRevokeToken = (saSlug: string, tokenSlug: string) => {
    deleteToken.mutate({
      path: { serviceAccountSlug: saSlug, tokenSlug },
    });
  };

  const handleDeleteServiceAccount = (saSlug: string) => {
    deleteServiceAccount.mutate({
      path: { serviceAccountSlug: saSlug },
    });
  };

  return {
    mutations: {
      createServiceAccount,
      deleteToken,
      deleteServiceAccount,
    },
    handlers: {
      handleCreateSA,
      handleRevokeToken,
      handleDeleteServiceAccount,
    },
  };
}
