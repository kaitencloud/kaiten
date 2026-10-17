import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ProblemAlert } from '@/domains/billing';
import { useStripeConnector } from '../hooks';
import { readStripeRouting } from '../utils/stripe-refusals';

/** What still uses Stripe, in words, one line for each thing that does. */
function RoutingList({
  activeSubscriptions,
  openInvoices,
}: {
  activeSubscriptions: number;
  openInvoices: number;
}) {
  const { t } = useTranslation();

  return (
    <ul
      className="list-disc space-y-1 pl-5 text-sm"
      data-testid="stripe-routing"
    >
      {activeSubscriptions > 0 ? (
        <li>
          {t('Pages.Integrations.Connectors.Stripe.Disconnect.subscriptions', {
            count: activeSubscriptions,
          })}
        </li>
      ) : null}
      {openInvoices > 0 ? (
        <li>
          {t('Pages.Integrations.Connectors.Stripe.Disconnect.invoices', {
            count: openInvoices,
          })}
        </li>
      ) : null}
    </ul>
  );
}

/**
 * The button that disconnects Stripe, and the confirmation behind it. The API
 * refuses while a subscription that is not canceled, or an invoice that is not
 * settled, still routes to Stripe: they would be stranded, impossible to push or to
 * read back. The dialog then stays open on the API's own words, with how many there
 * are, and the connector stays connected. The key stays stored, so that connecting
 * again does not ask for it.
 */
export function StripeDisconnectDialog() {
  const { t } = useTranslation();
  const connector = useStripeConnector();
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const routing = failure ? readStripeRouting(failure) : undefined;

  async function disconnect() {
    setFailure(null);
    try {
      await connector.disconnect();
      toast.success(
        t('Pages.Integrations.Connectors.Stripe.Toast.disconnected'),
      );
      setOpen(false);
    } catch (error) {
      setFailure(error);
    }
  }

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setFailure(null);
      connector.resetDisconnect();
    }
  }

  return (
    <AlertDialog onOpenChange={changeOpen} open={open}>
      <AlertDialogTrigger
        render={
          <Button
            className="text-destructive-subtle-foreground hover:bg-destructive-subtle hover:text-destructive-subtle-foreground"
            size="sm"
            variant="ghost"
          >
            <Trash2 />
            {t('Pages.Integrations.Connectors.Stripe.disconnect')}
          </Button>
        }
      />
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive-subtle text-destructive-subtle-foreground">
            <Trash2 className="size-5" />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t('Pages.Integrations.Connectors.Stripe.Disconnect.title')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('Pages.Integrations.Connectors.Stripe.Disconnect.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure ? (
          <div className="space-y-3" data-testid="stripe-disconnect-refused">
            <ProblemAlert
              autoFocus
              error={failure}
              onRetry={() => void disconnect()}
            />
            {routing ? <RoutingList {...routing} /> : null}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          <Button
            disabled={connector.isDisconnecting}
            onClick={() => void disconnect()}
            variant="destructive"
          >
            {t('Pages.Integrations.Connectors.Stripe.Disconnect.confirm')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
