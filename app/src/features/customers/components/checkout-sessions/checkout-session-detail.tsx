import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CheckoutSessionAdmin } from '@/api-client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatDateTime } from '@/lib/format-date';
import {
  getPeriodLabelKey,
  isExpiredWithRecords,
} from '../../utils/checkout-session';
import { CheckoutSessionLines } from './checkout-session-lines';
import {
  CheckoutCustomerLink,
  CheckoutInstanceLink,
} from './checkout-session-links';
import { CheckoutSessionStatusBadge } from './checkout-session-status-badge';

type CheckoutSessionDetailProps = {
  /** The label of the key whose page started the checkout, when the session may read the keys. */
  keyLabel?: string;
  session: CheckoutSessionAdmin;
};

const NONE = <span className="text-muted-foreground">—</span>;

function Row({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2 min-w-0 break-words">{children}</dd>
    </div>
  );
}

const instant = (value: string | null) =>
  value ? formatDateTime(value) : NONE;

/** The reason a trial was not granted, in words when the console knows the code. */
function TrialRefusal({ reason }: { reason: string | null }) {
  const { t } = useTranslation();

  if (!reason) {
    return null;
  }

  return (
    <p className="text-xs text-muted-foreground">
      {reason === 'ALREADY_CONSUMED'
        ? t('Pages.Customers.CheckoutSessions.Drawer.trialAlreadyConsumed')
        : reason}
    </p>
  );
}

/**
 * Everything the contract returns of one checkout: who started it and with which key, what
 * it asks for and how much today, the trial, the customer and instance a completion
 * created, and the moments of its life. It only reads.
 */
export function CheckoutSessionDetail({
  keyLabel,
  session,
}: CheckoutSessionDetailProps) {
  const { t } = useTranslation();
  const prefix = 'Pages.Customers.CheckoutSessions.Drawer';
  const periodKey = getPeriodLabelKey(session.billingPeriod);

  return (
    <div className="space-y-5" data-testid="checkout-session-detail">
      <div className="flex items-center gap-2">
        <CheckoutSessionStatusBadge status={session.status} />
      </div>
      {isExpiredWithRecords(session) ? (
        <Alert data-testid="checkout-session-expired-note">
          <Info />
          <AlertDescription>
            {t('Pages.Customers.CheckoutSessions.expiredNote')}
          </AlertDescription>
        </Alert>
      ) : null}
      <dl className="divide-y">
        <Row label={t(`${prefix}.email`)}>{session.email}</Row>
        <Row label={t(`${prefix}.clientReference`)}>
          {session.clientReferenceId ? (
            <span className="font-mono text-xs">
              {session.clientReferenceId}
            </span>
          ) : (
            NONE
          )}
        </Row>
        <Row label={t(`${prefix}.license`)}>{session.licenseSlug}</Row>
        <Row label={t(`${prefix}.period`)}>
          {periodKey ? t(periodKey) : session.billingPeriod}
        </Row>
        <Row label={t(`${prefix}.price`)}>
          <span className="font-mono text-xs">{session.priceId}</span>
        </Row>
        <Row label={t(`${prefix}.addOns`)}>
          {session.addOns.length === 0 ? (
            NONE
          ) : (
            <ul>
              {session.addOns.map((addOn) => (
                <li key={addOn.addonSlug}>
                  {t(`${prefix}.addOn`, {
                    quantity: addOn.quantity,
                    slug: addOn.addonSlug,
                  })}
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row label={t(`${prefix}.key`)}>
          {keyLabel ? <p>{keyLabel}</p> : null}
          <span className="font-mono text-xs text-muted-foreground">
            {session.publishableKeyId}
          </span>
        </Row>
        <Row label={t(`${prefix}.trial`)}>
          {session.trialEndsAt ? (
            t(`${prefix}.trialEnds`, {
              date: formatDateTime(session.trialEndsAt),
            })
          ) : (
            <span className="text-muted-foreground">
              {t(`${prefix}.noTrial`)}
            </span>
          )}
          <TrialRefusal reason={session.trialRefusedReason} />
        </Row>
        <Row label={t(`${prefix}.customer`)}>
          <CheckoutCustomerLink customerSlug={session.customerSlug} />
        </Row>
        <Row label={t(`${prefix}.instance`)}>
          <CheckoutInstanceLink instanceSlug={session.instanceSlug} />
        </Row>
        <Row label={t(`${prefix}.created`)}>{instant(session.createdAt)}</Row>
        <Row label={t(`${prefix}.expires`)}>{instant(session.expiresAt)}</Row>
        <Row label={t(`${prefix}.completed`)}>
          {instant(session.completedAt)}
        </Row>
        <Row label={t(`${prefix}.closed`)}>{instant(session.closedAt)}</Row>
      </dl>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t(`${prefix}.dueToday`)}</h3>
        <CheckoutSessionLines dueToday={session.dueToday} />
      </section>
    </div>
  );
}
