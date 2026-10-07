import { useQuery } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Entitlement, Price } from '@/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ProblemAlert } from '@/domains/billing';
import { useLicensePriceCopy } from '../../hooks/use-license-price-copy';
import { licenseQueryOptions, licensePricesQueryOptions } from '../../queries';
import { getPriceLabel } from '../../utils/license-price-display';
import {
  getCopyFailure,
  getPriceCopyState,
} from '../../utils/license-price-copy.utils';

type PriceCopyBannerProps = {
  entitlementBySlug: ReadonlyMap<string, Entitlement>;
  /** The version the prices are being copied from. */
  copyFrom: string;
  /** The version they are copied to, and what it has so far. */
  licenseSlug: string;
  /** Called once the copy is finished. */
  onDone: () => void;
  prices: readonly Price[];
};

// One side of the copy, a list named by its heading: what is in, or what is left.
function PriceCopyList({
  heading,
  labelOf,
  prices,
}: {
  heading: string;
  labelOf: (price: Price) => string;
  prices: readonly Price[];
}) {
  const headingId = useId();
  const renderPrice = (price: Price) => (
    <li key={price.id}>{labelOf(price)}</li>
  );

  return (
    <div>
      <p className="font-medium" id={headingId}>
        {heading}
      </p>
      <ul aria-labelledby={headingId} className="list-disc pl-5">
        {prices.map(renderPrice)}
      </ul>
    </div>
  );
}

/**
 * Where a copy of prices stopped, and the way to finish it. A new version is
 * given the prices of the version it starts from one call at a time, which the
 * API cannot make atomic: when one is refused the version stays a draft with the
 * prices that went through, and nothing is deleted. The banner lists what was
 * copied and what is left, and copies what is left from where it stopped. It
 * knows what is left from what each price is, so a version priced by hand since
 * does not hide it. It reads the source, never writes it.
 */
export function PriceCopyBanner({
  copyFrom,
  entitlementBySlug,
  licenseSlug,
  onDone,
  prices,
}: PriceCopyBannerProps) {
  const { t } = useTranslation();
  const { copyPrices } = useLicensePriceCopy();
  const { data: source } = useQuery(licenseQueryOptions(copyFrom));
  const { data: sourcePrices } = useQuery(licensePricesQueryOptions(copyFrom));
  const [failure, setFailure] = useState<unknown>(null);
  const [isCopying, setIsCopying] = useState(false);

  if (!source || !sourcePrices) {
    return null;
  }
  const { copied, pending } = getPriceCopyState(sourcePrices, prices);
  // Nothing left to copy: the copy is over, whoever finished it.
  if (pending.length === 0) {
    return null;
  }
  const labelOf = (price: Price) =>
    getPriceLabel(
      price,
      price.metered
        ? entitlementBySlug.get(price.metered.entitlementSlug)
        : undefined,
      t,
    );

  async function resume() {
    setFailure(null);
    setIsCopying(true);
    try {
      await copyPrices({ existing: prices, pending, targetSlug: licenseSlug });
      toast.success(t('Pages.Licenses.PriceCopy.Toasts.done'));
      onDone();
    } catch (error) {
      setFailure(getCopyFailure(error));
    } finally {
      setIsCopying(false);
    }
  }

  return (
    <Alert>
      <Copy />
      <AlertTitle>{t('Pages.Licenses.PriceCopy.title')}</AlertTitle>
      <AlertDescription>
        <p>
          {t('Pages.Licenses.PriceCopy.description', {
            copied: copied.length,
            name: source.name,
            total: copied.length + pending.length,
            version: source.version,
          })}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <PriceCopyList
            heading={t('Pages.Licenses.PriceCopy.copiedHeading')}
            labelOf={labelOf}
            prices={copied}
          />
          <PriceCopyList
            heading={t('Pages.Licenses.PriceCopy.pendingHeading')}
            labelOf={labelOf}
            prices={pending}
          />
        </div>
        {failure ? <ProblemAlert error={failure} /> : null}
        <div>
          <Button
            disabled={isCopying}
            onClick={resume}
            size="sm"
            type="button"
            variant="outline"
          >
            {t('Pages.Licenses.PriceCopy.resume')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
