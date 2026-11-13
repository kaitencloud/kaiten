import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  archiveConversionRule,
  createConversionRule,
  getConversionRule,
  updateConversionRule,
} from '@/api-client';
import { invalidateAiQueries } from '@/domains/ai-credits';
import { FRESH_READ_OPTIONS, writeOnFresh } from '@/lib/api/fresh-write';
import type { PricingTerms } from '../engine';
import type { RuleIdentity } from './rule-form.schema';

type CreateInput = { identity: RuleIdentity; terms: PricingTerms };
type UpdateInput = {
  /** What the form sends. */
  edited: PricingTerms;
  /** What the form opened with: only what differs from it is written. */
  opened: PricingTerms;
  ruleId: string;
};

/**
 * The three writes of a rule. Each refreshes what reads the rules, through REST
 * and through the graph, before it resolves: the grid shows the new price when
 * the panel says it is saved.
 */
export function useRuleWrites(licenseSlug: string) {
  const client = useQueryClient();
  const onSuccess = () => invalidateAiQueries(client);

  const create = useMutation({
    mutationFn: async ({ identity, terms }: CreateInput) => {
      const { data } = await createConversionRule({
        body: {
          ...terms,
          entitlementSlug: identity.entitlementSlug,
          modelSlug: identity.modelSlug,
          requestType: identity.requestType,
        },
        path: { licenseSlug: identity.licenseSlug },
        throwOnError: true,
      });

      return data;
    },
    onSuccess,
  });

  // The API replaces a rule as a whole: the rule is read again and only what
  // the form changed is written over it, so that a change made meanwhile in
  // another tab is not sent back undone.
  const update = useMutation({
    mutationFn: ({ edited, opened, ruleId }: UpdateInput) => {
      const path = { licenseSlug, ruleId };

      return writeOnFresh({
        edited,
        opened,
        read: async () =>
          (
            await getConversionRule({
              ...FRESH_READ_OPTIONS,
              path,
              throwOnError: true,
            })
          ).data,
        restate: (rule): PricingTerms => ({
          chargeOnError: rule.chargeOnError,
          maximumCreditsPerRequest: rule.maximumCreditsPerRequest,
          minimumCreditsPerRequest: rule.minimumCreditsPerRequest,
          rates: rule.rates,
        }),
        write: async (body) =>
          (await updateConversionRule({ body, path, throwOnError: true })).data,
      });
    },
    onSuccess,
  });

  const archive = useMutation({
    mutationFn: (ruleId: string) =>
      archiveConversionRule({
        path: { licenseSlug, ruleId },
        throwOnError: true,
      }),
    onSuccess,
  });

  return { archive, create, update };
}
