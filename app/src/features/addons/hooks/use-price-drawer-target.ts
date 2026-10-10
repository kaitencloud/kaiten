import { useActionAccess } from '@/domains/billing';

type UsePriceDrawerTargetOptions = {
  /** Whether the version takes a new price: not an archived one. */
  canAdd: boolean;
  /** What the URL asks for: `new`. */
  priceParam?: string;
};

/**
 * Whether the drawer of a new price is to show, from what the URL asks for. A price
 * is created and never edited, so `new` is the only thing the URL can ask. It opens
 * where the version takes a price and the session may write; a link to a drawer that
 * cannot open (an archived version, a session that may not write, anything else in
 * place of `new`) leads back to the tab, not to a drawer left blank, except while the
 * scopes of the session are being read: they are not known yet, and a link followed
 * from outside must not be dropped for that.
 */
export function usePriceDrawerTarget({
  canAdd,
  priceParam,
}: UsePriceDrawerTargetOptions) {
  const create = useActionAccess('addonPrices.create');
  const isOpen = priceParam === 'new' && create.allowed && canAdd;

  return {
    isOpen,
    shouldLeave: !create.isPending && priceParam !== undefined && !isOpen,
  };
}
