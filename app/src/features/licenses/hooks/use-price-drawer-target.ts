import type { Price } from '@/api-client';
import { useActionAccess } from '@/domains/billing';
import { canEditPrice, type PriceRules } from '../utils/license-price.utils';

type UsePriceDrawerTargetOptions = {
  /** What the URL asks for: `new`, or the id of the price to edit. */
  priceParam?: string;
  prices: readonly Price[];
  rules: PriceRules;
};

/**
 * What the drawer of a price is to show, from what the URL asks for. A new price
 * opens it where the version takes one and the session may write; an existing one
 * opens it on that price where it can be edited. A link to a drawer that cannot
 * open (an unknown price, a published version, a session that may not write)
 * leads back to the tab, not to a drawer left blank, except while the scopes of
 * the session are being read: they are not known yet, and a link followed from
 * outside must not be dropped for that.
 */
export function usePriceDrawerTarget({
  priceParam,
  prices,
  rules,
}: UsePriceDrawerTargetOptions) {
  const create = useActionAccess('licensePrices.create');
  const update = useActionAccess('licensePrices.update');

  const isNew = priceParam === 'new' && create.allowed && rules.canAdd;
  const existing =
    priceParam && priceParam !== 'new'
      ? prices.find((price) => price.id === priceParam)
      : undefined;
  const editable =
    existing !== undefined && update.allowed && canEditPrice(rules, existing);
  const isOpen = isNew || editable;

  return {
    isOpen,
    /** The price being edited; none for a new one. */
    price: editable ? existing : undefined,
    shouldLeave: !create.isPending && priceParam !== undefined && !isOpen,
  };
}
