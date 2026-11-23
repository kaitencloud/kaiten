import { useMutation, useQueryClient } from '@tanstack/react-query';
import { refreshPlatformFlags } from '@/lib/feature-flags';
import { setBetaFeature } from './beta-features.api';
import { betaFeatureProblem } from './beta-features';
import type { BetaFeatureProblem } from './types';

type Toggle = { flagSlug: string; enabled: boolean };

export type BetaFeatureToggleFailure = Toggle & {
  problem: BetaFeatureProblem;
};

/**
 * Turns a beta on or off. The toggle's state is never the answer of the write:
 * it is the flag's evaluation, so after a success, and after a refusal that
 * says the beta is no longer open, the flags are read again, and the toggle
 * stays pending until they are.
 */
export function useBetaFeatureToggle() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ flagSlug, enabled }: Toggle) =>
      setBetaFeature(flagSlug, enabled),
    onSuccess: () => refreshPlatformFlags(queryClient),
    onError: (error) =>
      betaFeatureProblem(error) === 'not-toggleable'
        ? refreshPlatformFlags(queryClient)
        : undefined,
  });

  const failure: BetaFeatureToggleFailure | undefined =
    mutation.isError && mutation.variables
      ? { ...mutation.variables, problem: betaFeatureProblem(mutation.error) }
      : undefined;

  return {
    toggle: (toggle: Toggle) => mutation.mutate(toggle),
    retry: () => {
      if (mutation.variables) {
        mutation.mutate(mutation.variables);
      }
    },
    dismiss: () => mutation.reset(),
    pendingSlug: mutation.isPending ? mutation.variables?.flagSlug : undefined,
    failure,
  };
}
