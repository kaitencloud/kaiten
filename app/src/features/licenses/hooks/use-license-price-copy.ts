import { useAiAccess, isAiEntitlement } from '@/domains/ai-credits';
import { entitlementsQueryOptions } from '../queries';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Price } from '@/api-client';
import { createLicensePriceMutation } from '@/api-client/@tanstack/react-query.gen';
import { invalidateLicensePriceQueries } from '@/domains/billing';
import { licensePricesQueryOptions } from '../queries';
import {
  getCopiablePrices,
  PriceCopyError,
  priceCopyBody,
} from '../utils/license-price-copy.utils';

type CopyPricesOptions = {
  /** What the target has already: the copies are placed after it. */
  existing: readonly Price[];
  /** What is left to copy, in the order it is copied. */
  pending: readonly Price[];
  targetSlug: string;
};

/**
 * Copies the prices of a version to another: what a new version starts with, and
 * what is finished when a copy stopped halfway. The API creates one price at a
 * time and the console has no way to make that atomic, so the copy is one call
 * after the other, in display order, and stops at the first refusal with a
 * `PriceCopyError`: what was created stays, and what is left is known.
 */
export function useLicensePriceCopy() {
  const queryClient = useQueryClient();
  const access = useAiAccess();
  const { mutateAsync: createPrice } = useMutation(
    createLicensePriceMutation(),
  );

  function checkPrices(prices: readonly Price[]) {
    if (access.available) return;
    const catalogue =
      queryClient.getQueryData(entitlementsQueryOptions.queryKey)?.items ?? [];
    if (
      prices.some(
        (price) =>
          price.metered?.entitlementSlug &&
          !catalogue.some(
            (item) =>
              item.slug === price.metered?.entitlementSlug &&
              !isAiEntitlement(item.type),
          ),
      )
    )
      throw new Error('AIUsage.Disabled');
  }

  /** The prices of a version a new version starts with. */
  const fetchCopiablePrices = useCallback(
    async (sourceSlug: string) => {
      const prices = getCopiablePrices(
        (await queryClient.fetchQuery(licensePricesQueryOptions(sourceSlug))) ??
          [],
      );
      checkPrices(prices);
      return prices;
    },
    [access.available, queryClient],
  );

  const copyPrices = useCallback(
    async ({ existing, pending, targetSlug }: CopyPricesOptions) => {
      checkPrices(pending);
      const created: Price[] = [];
      try {
        for (const price of pending) {
          created.push(
            await createPrice({
              body: priceCopyBody(price, [...existing, ...created]),
              path: { licenseSlug: targetSlug },
            }),
          );
        }
      } catch (error) {
        throw new PriceCopyError(error);
      } finally {
        // Whether the copy finished or stopped, the target has what was created.
        await invalidateLicensePriceQueries(queryClient, targetSlug);
      }

      return created;
    },
    [access.available, createPrice, queryClient],
  );

  return { copyPrices, fetchCopiablePrices };
}
