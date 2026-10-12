import { useTranslation } from 'react-i18next';
import type { Customer } from '@/api-client';
import { DetailCard } from '@/functionals/detail-card';
import { formatDetailDateTime, getAuditDisplayName } from '@/lib/detail';
import { useCustomerBilling } from '../../hooks/use-customer-billing';

type CustomerDetailsCardProps = {
  customer: Customer;
};

type AuditStampProps = {
  actorName: string;
  align?: 'left' | 'right';
  byLabel: string;
  label: string;
  value: string;
};

const AuditStamp = ({
  actorName,
  align = 'left',
  byLabel,
  label,
  value,
}: AuditStampProps) => (
  <div className={align === 'right' ? 'space-y-1 text-right' : 'space-y-1'}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm">{value}</p>
    {actorName ? (
      <p className="text-xs text-muted-foreground">
        {byLabel} {actorName}
      </p>
    ) : null}
  </div>
);

const EMPTY_VALUE_CLASS_NAME = 'font-normal text-muted-foreground';

export const CustomerDetailsCard = ({ customer }: CustomerDetailsCardProps) => {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en-US';
  const byLabel = t('Pages.Customers.Detail.customerDetails.by');
  const { isBillingEnabled } = useCustomerBilling();

  return (
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title>
          {t('Pages.Customers.Detail.customerDetails.title')}
        </DetailCard.Title>
        <DetailCard.Description>
          {t('Pages.Customers.Detail.customerDetails.description')}
        </DetailCard.Description>
      </DetailCard.Header>
      <DetailCard.Content>
        <DetailCard.Rows>
          <DetailCard.Row
            label={t('Pages.Customers.Detail.customerDetails.fields.name')}
            value={customer.name}
          />
          <DetailCard.Row
            label={t(
              'Pages.Customers.Detail.customerDetails.fields.externalId',
            )}
            value={customer.externalCustomerId ?? '—'}
            valueClassName={
              customer.externalCustomerId ? undefined : EMPTY_VALUE_CLASS_NAME
            }
          />
          <DetailCard.Row
            label={t('Pages.Customers.Detail.customerDetails.fields.domain')}
            value={customer.domain ?? '—'}
            valueClassName={
              customer.domain ? undefined : EMPTY_VALUE_CLASS_NAME
            }
          />
          {isBillingEnabled ? (
            <DetailCard.Row
              label={t(
                'Pages.Customers.Detail.customerDetails.fields.billingEmail',
              )}
              value={
                customer.billingEmail ??
                t('Pages.Customers.Detail.customerDetails.billingEmailNone')
              }
              valueClassName={
                customer.billingEmail ? undefined : EMPTY_VALUE_CLASS_NAME
              }
            />
          ) : null}
        </DetailCard.Rows>

        <DetailCard.Divider />

        {/* The audit stamps close the card, as on the instance card, instead
            of taking two cells of the details grid. */}
        <div className="flex items-start justify-between gap-4">
          <AuditStamp
            actorName={getAuditDisplayName({ actor: customer.createdBy })}
            byLabel={byLabel}
            label={t('Pages.Customers.Detail.customerDetails.fields.createdAt')}
            value={formatDetailDateTime(customer.createdAt, locale)}
          />
          <AuditStamp
            actorName={getAuditDisplayName({ actor: customer.updatedBy })}
            align="right"
            byLabel={byLabel}
            label={t('Pages.Customers.Detail.customerDetails.fields.updatedAt')}
            value={formatDetailDateTime(customer.updatedAt, locale)}
          />
        </div>
      </DetailCard.Content>
    </DetailCard>
  );
};
