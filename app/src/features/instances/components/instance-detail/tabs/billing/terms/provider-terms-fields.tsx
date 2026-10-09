import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { InstanceBilling } from '@/api-client';
import {
  customerBillingQueryOptions,
  hasUsablePaymentMethod,
  type InvoiceProviderKind,
  useBillingProvider,
  useCanPerform,
} from '@/domains/billing';
import { OpenInvoices } from './open-invoices';

const PROVIDERS = [
  'NOOP',
  'STRIPE',
] as const satisfies readonly InvoiceProviderKind[];
const METHODS = ['SEND_INVOICE', 'CHARGE_AUTOMATICALLY'] as const;

type Method = (typeof METHODS)[number];

const PROVIDER_LABEL_KEYS = {
  NOOP: 'Pages.Customers.Instances.Detail.Billing.Terms.Provider.NOOP',
  STRIPE: 'Pages.Customers.Instances.Detail.Billing.Terms.Provider.STRIPE',
} as const satisfies Record<InvoiceProviderKind, string>;

const METHOD_LABEL_KEYS = {
  CHARGE_AUTOMATICALLY:
    'Pages.Customers.Instances.Detail.Billing.Terms.Collection.CHARGE_AUTOMATICALLY',
  SEND_INVOICE:
    'Pages.Customers.Instances.Detail.Billing.Terms.Collection.SEND_INVOICE',
} as const satisfies Record<Method, string>;

type ProviderTermsFieldsProps = {
  /** The billing e-mail of the customer: Stripe sends the invoices there. */
  billingEmail: string | undefined;
  customerSlug: string;
  /** The form of the dialog, typed by `useAppForm`. */
  form: any;
  subscription: InstanceBilling;
};

type WarningProps = { customerSlug: string; message: string };

/** A thing the API would refuse that the screen can already tell, with the way to the customer who has to fix it. */
function Warning({ customerSlug, message }: WarningProps) {
  const { t } = useTranslation();

  return (
    <p
      className="flex items-start gap-2 text-sm text-warning-subtle-foreground"
      data-testid="terms-warning"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        {message}{' '}
        <Link
          className="underline underline-offset-4"
          params={{ customerSlug }}
          to="/customers/$customerSlug"
        >
          {t(
            'Pages.Customers.Instances.Detail.Billing.Terms.Warnings.customer',
          )}
        </Link>
      </span>
    </p>
  );
}

/**
 * What would stop the change, told before it is sent: a customer without a billing
 * e-mail cannot be sent invoices by Stripe, and one without a payment method it can use
 * cannot be charged. Both are refused by the API all the same; this only says it early,
 * and says where to fix it.
 */
function ProviderWarnings({
  billingEmail,
  customerSlug,
  method,
  provider,
  subscription,
}: Pick<
  ProviderTermsFieldsProps,
  'billingEmail' | 'customerSlug' | 'subscription'
> & {
  method: Method;
  provider: InvoiceProviderKind;
}) {
  const { t } = useTranslation();
  const mayReadCustomer = useCanPerform('customer.billing.read');
  const charges = provider === 'STRIPE' && method === 'CHARGE_AUTOMATICALLY';
  const customer = useQuery({
    ...customerBillingQueryOptions(customerSlug),
    enabled: charges && mayReadCustomer,
  });
  const base = 'Pages.Customers.Instances.Detail.Billing.Terms.Warnings';
  const sends = provider === 'STRIPE' && method === 'SEND_INVOICE';

  return (
    <>
      {sends && !billingEmail ? (
        <Warning
          customerSlug={customerSlug}
          message={t(`${base}.billingEmail`)}
        />
      ) : null}
      {charges && customer.data && !hasUsablePaymentMethod(customer.data) ? (
        <Warning
          customerSlug={customerSlug}
          message={t(`${base}.paymentMethod`)}
        />
      ) : null}
      {provider !== subscription.providerKind ? (
        <p className="text-sm text-muted-foreground">
          {t(`${base}.fromNextInvoice`)}
        </p>
      ) : null}
    </>
  );
}

/**
 * Who collects the invoices of the contract, and how: the provider (the organization's
 * own system, or Stripe once it is connected) and the collection method (sending the
 * invoice, or charging the card on file, which only a provider that charges by itself
 * can do). Moving to the organization's own system sends the invoice, since that is all
 * it does. Below them come what the API would refuse that can be told already, and, when
 * the provider changes, the invoices still open and what becomes of each.
 */
export function ProviderTermsFields({
  billingEmail,
  customerSlug,
  form,
  subscription,
}: ProviderTermsFieldsProps) {
  const { t } = useTranslation();
  const { isConnected, provider: stripe } = useBillingProvider('STRIPE');
  const base = 'Pages.Customers.Instances.Detail.Billing.Terms';
  const stripeCharges = Boolean(stripe?.capabilities.automaticCollection);

  return (
    <Suspense fallback={null}>
      <form.AppField name="providerKind">
        {(field: any) => (
          <field.SelectField
            description={t(`${base}.Provider.description`)}
            getOptionLabel={(provider: InvoiceProviderKind) =>
              t(PROVIDER_LABEL_KEYS[provider])
            }
            isOptionDisabled={(provider: InvoiceProviderKind) =>
              provider === 'STRIPE' && !isConnected
            }
            label={t(`${base}.Provider.label`)}
            options={PROVIDERS}
          />
        )}
      </form.AppField>
      <form.Subscribe selector={(state: any) => state.values.providerKind}>
        {(provider: InvoiceProviderKind) => (
          <form.AppField name="collectionMethod">
            {(field: any) => (
              <field.SelectField
                description={t(`${base}.Collection.description`)}
                getOptionLabel={(method: Method) =>
                  method === 'CHARGE_AUTOMATICALLY' &&
                  !(provider === 'STRIPE' && stripeCharges)
                    ? t(`${base}.Collection.unavailable`, {
                        method: t(METHOD_LABEL_KEYS[method]),
                      })
                    : t(METHOD_LABEL_KEYS[method])
                }
                isOptionDisabled={(method: Method) =>
                  method === 'CHARGE_AUTOMATICALLY' &&
                  !(provider === 'STRIPE' && stripeCharges)
                }
                label={t(`${base}.Collection.label`)}
                options={METHODS}
              />
            )}
          </form.AppField>
        )}
      </form.Subscribe>
      <form.Subscribe
        selector={(state: any) => ({
          method: state.values.collectionMethod,
          provider: state.values.providerKind,
        })}
      >
        {({
          method,
          provider,
        }: {
          method: Method;
          provider: InvoiceProviderKind;
        }) => (
          <>
            <ProviderWarnings
              billingEmail={billingEmail}
              customerSlug={customerSlug}
              method={method}
              provider={provider}
              subscription={subscription}
            />
            {provider !== subscription.providerKind ? (
              <OpenInvoices
                instanceSlug={subscription.instanceSlug}
                target={provider}
              />
            ) : null}
          </>
        )}
      </form.Subscribe>
    </Suspense>
  );
}
