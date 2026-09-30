import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { DetailCard } from '@/functionals/detail-card';
import {
  ResetAnchorDisplay,
  ResetPeriodDisplay,
} from '../reset-period-display';

// Extra General card rows for the customer-facing presentation attributes
// (visibility flag + measurement units) and the usage-window cadence. Kept out
// of the card file so it stays within the 350-line budget.

export function UserFacingRow({ entitlement }: { entitlement: Entitlement }) {
  const { t } = useTranslation();
  const userFacing = entitlement.userFacing ?? false;

  return (
    <DetailCard.Row
      label={t(
        'Pages.Entitlements.Detail.Overview.general.fields.userFacing',
        'User facing',
      )}
      value={
        userFacing ? (
          <Badge variant="success">
            {t(
              'Pages.Entitlements.Detail.Overview.general.values.visible',
              'Visible',
            )}
          </Badge>
        ) : (
          <Badge variant="secondary">
            {t(
              'Pages.Entitlements.Detail.Overview.general.values.hidden',
              'Hidden',
            )}
          </Badge>
        )
      }
    />
  );
}

// The cadence and its phase are catalogue attributes, so they belong on the
// entitlement card. The *current* window is not: it is phased per instance
// when the anchor is LICENSE_START, so a single window shown here would be
// wrong for every instance but one. Window bounds live on the usage views.
export function ResetPeriodRows({ entitlement }: { entitlement: Entitlement }) {
  const { t } = useTranslation();

  if (
    entitlement.type !== 'NUMBER' &&
    entitlement.type !== 'NUMBER_AI_CREDIT'
  ) {
    return null;
  }

  return (
    <>
      <DetailCard.Row
        label={t(
          'Pages.Entitlements.Detail.Overview.general.fields.resetPeriod',
          'Usage resets',
        )}
        value={<ResetPeriodDisplay resetPeriod={entitlement.resetPeriod} />}
      />
      {entitlement.resetPeriod ? (
        <DetailCard.Row
          label={t(
            'Pages.Entitlements.Detail.Overview.general.fields.resetAnchor',
            'Window aligned on',
          )}
          value={<ResetAnchorDisplay resetAnchor={entitlement.resetAnchor} />}
        />
      ) : null}
    </>
  );
}

const formatUnitPair = (
  t: ReturnType<typeof useTranslation>['t'],
  singular: string | null | undefined,
  plural: string | null | undefined,
) => {
  if (!singular || !plural) {
    return null;
  }

  return t(
    'Pages.Entitlements.Detail.Overview.general.unitPair',
    '{{singular}} / {{plural}}',
    { singular, plural },
  );
};

// Unit labels only apply to NUMBER entitlements; the sale-unit and calculation
// rows share the same `saleUnit` guard so a partial sale trio never orphans a
// calculation row without its sale-unit row.
export function UnitRows({
  entitlement,
  locale,
  notAvailableLabel,
}: {
  entitlement: Entitlement;
  locale: string;
  notAvailableLabel: string;
}) {
  const { t } = useTranslation();

  if (entitlement.type !== 'NUMBER') {
    return null;
  }

  const baseUnit = formatUnitPair(
    t,
    entitlement.unitSingular,
    entitlement.unitPlural,
  );
  const saleUnit = formatUnitPair(
    t,
    entitlement.saleUnitSingular,
    entitlement.saleUnitPlural,
  );
  const calculation =
    saleUnit && entitlement.unitPlural && entitlement.saleUnitFactor != null
      ? t(
          'Pages.Entitlements.Detail.Overview.general.calculationFormula',
          '1 {{saleUnit}} = {{factor}} {{baseUnit}}',
          {
            saleUnit: entitlement.saleUnitSingular,
            factor: entitlement.saleUnitFactor.toLocaleString(locale),
            baseUnit: entitlement.unitPlural,
          },
        )
      : null;

  return (
    <>
      <DetailCard.Row
        label={t(
          'Pages.Entitlements.Detail.Overview.general.fields.baseUnit',
          'Base unit',
        )}
        value={baseUnit ?? notAvailableLabel}
      />
      {saleUnit ? (
        <DetailCard.Row
          label={t(
            'Pages.Entitlements.Detail.Overview.general.fields.saleUnit',
            'Sale unit',
          )}
          value={saleUnit}
        />
      ) : null}
      {calculation ? (
        <DetailCard.Row
          label={t(
            'Pages.Entitlements.Detail.Overview.general.fields.calculation',
            'Calculation',
          )}
          value={calculation}
        />
      ) : null}
    </>
  );
}
