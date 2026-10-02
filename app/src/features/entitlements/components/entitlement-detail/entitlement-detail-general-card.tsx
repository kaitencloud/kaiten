import { Button } from '@/components/ui/button';
import { EntityIcon } from '@/components/ui/icon';
import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { DetailCard } from '@/functionals/detail-card';
import { formatDetailDateTime } from '@/lib/detail';
import { AggregationMethodDisplay } from '../display/aggregation-method-display';
import { EntitlementGroupBadges } from '../groups/entitlement-group-badges';
import { EntitlementTypeDisplay } from '../display/entitlement-type-display';
import {
  ResetPeriodRows,
  UnitRows,
  UserFacingRow,
} from './entitlement-detail-metadata-rows';
import { getEntitlementAuditMetadata } from './entitlement-detail-overview.helpers';
import type { EntitlementAuditFields } from './entitlement-detail-overview.types';

type EntitlementDetailGeneralCardProps = {
  entitlement: Entitlement;
  entitlementAudit: EntitlementAuditFields;
  locale: string;
  onEdit: () => void;
};

function EntitlementGeneralCardHeader({
  disabled,
  onEdit,
}: {
  disabled: boolean;
  onEdit: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <DetailCard.Title>
          {t(
            'Pages.Entitlements.Detail.Overview.general.title',
            'General Information',
          )}
        </DetailCard.Title>
        <DetailCard.Description>
          {t(
            'Pages.Entitlements.Detail.Overview.general.description',
            'Core entitlement metadata aligned with the schema contract.',
          )}
        </DetailCard.Description>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={onEdit}
        disabled={disabled}
      >
        <Pencil className="size-4" />
        {t('Pages.Entitlements.Detail.buttons.edit', 'Edit')}
      </Button>
    </div>
  );
}

function EntitlementGeneralCardRows({
  entitlement,
  locale,
  notAvailableLabel,
}: {
  entitlement: Entitlement;
  locale: string;
  notAvailableLabel: string;
}) {
  const { t } = useTranslation();

  return (
    <DetailCard.Rows>
      <DetailCard.Row
        label={t(
          'Pages.Entitlements.Detail.Overview.general.fields.name',
          'Name',
        )}
        value={
          <span className="flex items-center gap-2">
            <EntityIcon
              token={entitlement.icon}
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span>{entitlement.name}</span>
          </span>
        }
      />
      <DetailCard.Row
        label={t(
          'Pages.Entitlements.Detail.Overview.general.fields.type',
          'Type',
        )}
        value={
          <EntitlementTypeDisplay
            entitlementType={entitlement.type ?? 'BOOLEAN'}
          />
        }
      />
      <DetailCard.Row
        label={t(
          'Pages.Entitlements.Detail.Overview.general.fields.aggregationMethod',
          'Aggregation Method',
        )}
        value={
          <AggregationMethodDisplay
            aggregationMethod={entitlement.aggregationMethod}
          />
        }
      />
      <ResetPeriodRows entitlement={entitlement} />
      <UnitRows
        entitlement={entitlement}
        locale={locale}
        notAvailableLabel={notAvailableLabel}
      />
      <UserFacingRow entitlement={entitlement} />
      <DetailCard.Row
        align="start"
        label={t(
          'Pages.Entitlements.Detail.Overview.general.fields.groups',
          'Groups',
        )}
        value={
          <EntitlementGroupBadges
            groups={
              entitlement.entitlementGroups?.map((group) => ({
                name: group.name,
                slug: group.slug,
              })) ?? []
            }
            maxVisible={4}
            emptyLabel={notAvailableLabel}
          />
        }
        valueClassName="max-w-md"
      />
      <DetailCard.Row
        align="start"
        label={t(
          'Pages.Entitlements.Detail.Overview.general.fields.description',
          'Description',
        )}
        value={entitlement.description ?? notAvailableLabel}
        valueClassName="max-w-md font-normal text-muted-foreground"
      />
    </DetailCard.Rows>
  );
}

function EntitlementGeneralCardAudit({
  createdAt,
  createdByName,
  locale,
  notAvailableLabel,
  updatedAt,
  updatedByName,
}: {
  createdAt?: string;
  createdByName: string;
  locale: string;
  notAvailableLabel: string;
  updatedAt?: string;
  updatedByName: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {t(
            'Pages.Entitlements.Detail.Overview.general.audit.createdAt',
            'Created at',
          )}
        </p>
        <p className="text-sm">
          {createdAt
            ? formatDetailDateTime(createdAt, locale)
            : notAvailableLabel}
        </p>
        {createdByName ? (
          <p className="text-xs text-muted-foreground">
            {t('Pages.Entitlements.Detail.Overview.general.audit.by', 'by')}{' '}
            {createdByName}
          </p>
        ) : null}
      </div>
      <div className="space-y-1 text-right">
        <p className="text-xs text-muted-foreground">
          {t(
            'Pages.Entitlements.Detail.Overview.general.audit.updatedAt',
            'Last update',
          )}
        </p>
        <p className="text-sm">
          {updatedAt
            ? formatDetailDateTime(updatedAt, locale)
            : notAvailableLabel}
        </p>
        {updatedByName ? (
          <p className="text-xs text-muted-foreground">
            {t('Pages.Entitlements.Detail.Overview.general.audit.by', 'by')}{' '}
            {updatedByName}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function EntitlementDetailGeneralCard({
  entitlement,
  entitlementAudit,
  locale,
  onEdit,
}: EntitlementDetailGeneralCardProps) {
  const { t } = useTranslation();
  const { createdAt, createdByName, updatedAt, updatedByName } =
    getEntitlementAuditMetadata(entitlementAudit);
  const notAvailableLabel = t(
    'Pages.Entitlements.Detail.fallback.notAvailable',
    'n/a',
  );

  return (
    <DetailCard className="xl:col-span-2">
      <DetailCard.Header>
        <EntitlementGeneralCardHeader
          disabled={!entitlement.slug}
          onEdit={onEdit}
        />
      </DetailCard.Header>
      <DetailCard.Content>
        <EntitlementGeneralCardRows
          entitlement={entitlement}
          locale={locale}
          notAvailableLabel={notAvailableLabel}
        />
        <DetailCard.Divider />
        <EntitlementGeneralCardAudit
          createdAt={createdAt}
          createdByName={createdByName}
          locale={locale}
          notAvailableLabel={notAvailableLabel}
          updatedAt={updatedAt}
          updatedByName={updatedByName}
        />
      </DetailCard.Content>
    </DetailCard>
  );
}
