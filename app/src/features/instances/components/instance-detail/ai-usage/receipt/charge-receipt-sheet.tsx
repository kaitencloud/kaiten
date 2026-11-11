import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { getApiErrorMessage } from '@/lib/errors';
import { ReceiptBody, ReceiptHeadline } from './receipt-body';
import { ReceiptActions } from './receipt-actions';
import type { ReceiptPool } from './receipt-view';
import { useReceipt } from './use-receipt';

type ChargeReceiptSheetProps = {
  instanceSlug: string;
  pool: ReceiptPool;
  transactionId: string;
  onClose: () => void;
};

/**
 * The charge receipt of one inference, in a sheet the URL opens
 * (`?receipt=<transactionId>`), so it can be linked to and Back closes it. It
 * explains a charge from the stored row: the call, how it was priced, what it
 * did to the pool, what was refunded and what it cost; and lets a session that
 * may refund what is left or name an unknown model.
 */
export function ChargeReceiptSheet({
  instanceSlug,
  pool,
  transactionId,
  onClose,
}: ChargeReceiptSheetProps) {
  const { t } = useTranslation();
  const receipt = useReceipt({ instanceSlug, pool, transactionId });

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="space-y-1 border-b pr-12">
          <SheetTitle>{t('AI.Receipt.title')}</SheetTitle>
          <SheetDescription className="break-all font-mono text-xs">
            {transactionId}
          </SheetDescription>
          {receipt.view ? <ReceiptHeadline view={receipt.view} /> : null}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {receipt.error ? (
            <p
              role="alert"
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              {getApiErrorMessage(receipt.error)}
              <Button variant="outline" size="sm" onClick={receipt.retry}>
                {t('Common.retry')}
              </Button>
            </p>
          ) : receipt.notFound ? (
            <p className="text-sm text-muted-foreground">
              {t('AI.Receipt.notFound', { id: transactionId })}
            </p>
          ) : receipt.view ? (
            <ReceiptBody
              view={receipt.view}
              licenceName={receipt.licenceName}
            />
          ) : (
            <div role="status" className="space-y-3">
              <span className="sr-only">{t('AI.Receipt.loading')}</span>
              <Skeleton className="h-24 w-full motion-reduce:animate-none" />
              <Skeleton className="h-40 w-full motion-reduce:animate-none" />
            </div>
          )}
        </div>
        {receipt.view ? (
          <SheetFooter className="flex-row flex-wrap justify-start border-t empty:hidden">
            <ReceiptActions
              instanceSlug={instanceSlug}
              models={receipt.models}
              view={receipt.view}
            />
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
