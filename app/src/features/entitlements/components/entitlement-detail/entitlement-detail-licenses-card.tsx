import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DetailCard } from '@/functionals/detail-card';
import { capitalizeFromUpperCase } from '@/lib/utils';
import {
  formatLimitOrState,
  type LicenseAggregate,
  type LinkedLicenseMapping,
} from './entitlement-detail-context';

const PREVIEW_SIZE = 5;

type EntitlementDetailLicensesCardProps = {
  isLoading: boolean;
  isUsageLoading: boolean;
  licenseAggregates: LicenseAggregate[];
  linkedLicenseMappings: LinkedLicenseMapping[];
  locale: string;
};

// The licenses that need a look first: over their limit, then near it, then
// the most used, then by name.
function rankLicenses(licenses: LicenseAggregate[]) {
  return [...licenses].sort(
    (left, right) =>
      right.overLimitCount - left.overLimitCount ||
      right.nearLimitCount - left.nearLimitCount ||
      right.instances - left.instances ||
      left.licenseName.localeCompare(right.licenseName),
  );
}

function LicenseRow({
  isUsageLoading,
  license,
  locale,
  mapping,
}: {
  isUsageLoading: boolean;
  license: LicenseAggregate;
  locale: string;
  mapping: LinkedLicenseMapping['mapping'] | undefined;
}) {
  const { t } = useTranslation();
  const meta = [
    t(
      `Pages.Licenses.Mutation.Form.Types.${capitalizeFromUpperCase(license.licenseType)}`,
    ),
    license.version ? `v${license.version}` : null,
    isUsageLoading
      ? null
      : `${license.instances.toLocaleString(locale)} ${t(
          'Pages.Entitlements.Detail.Overview.licenses.instances',
          { count: license.instances },
        )}`,
  ].filter(Boolean);

  return (
    <li className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Link
          to="/licenses/$licenseSlug"
          params={{ licenseSlug: license.licenseSlug }}
          className="text-sm font-medium hover:underline"
        >
          {license.licenseName}
        </Link>
        <p className="text-xs text-muted-foreground">{meta.join(' · ')}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm">
          {mapping ? formatLimitOrState(mapping, locale) : '-'}
        </p>
        {license.overLimitCount > 0 ? (
          <p className="text-xs text-destructive-subtle-foreground">
            {t(
              'Pages.Entitlements.Detail.stats.licenseAlerts.over',
              'Over limit',
            )}
            : {license.overLimitCount.toLocaleString(locale)}
          </p>
        ) : null}
        {license.nearLimitCount > 0 ? (
          <p className="text-xs text-warning-subtle-foreground">
            {t(
              'Pages.Entitlements.Detail.stats.licenseAlerts.near',
              'Near limit',
            )}
            : {license.nearLimitCount.toLocaleString(locale)}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function EntitlementDetailLicensesCard({
  isLoading,
  isUsageLoading,
  licenseAggregates,
  linkedLicenseMappings,
  locale,
}: EntitlementDetailLicensesCardProps) {
  const { t } = useTranslation();
  const mappingByLicenseSlug = new Map(
    linkedLicenseMappings.map(({ license, mapping }) => [
      license.slug,
      mapping,
    ]),
  );
  // Every license that grants the entitlement is listed here: the ones that
  // need a look first, then the rest on demand.
  const [expanded, setExpanded] = useState(false);
  const ranked = rankLicenses(licenseAggregates);
  const shown = expanded ? ranked : ranked.slice(0, PREVIEW_SIZE);
  const hidden = ranked.length - shown.length;

  return (
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title>
          {t(
            'Pages.Entitlements.Detail.Overview.licenses.title',
            'Linked licenses',
          )}
        </DetailCard.Title>
        <DetailCard.Description>
          {t(
            'Pages.Entitlements.Detail.Overview.licenses.description',
            'What each license grants for this entitlement.',
          )}
        </DetailCard.Description>
      </DetailCard.Header>
      <DetailCard.Content>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">
            {t('Pages.Entitlements.Detail.loading', 'Loading...')}
          </p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'Pages.Entitlements.Detail.Overview.licenses.empty',
              'No license grants this entitlement yet.',
            )}
          </p>
        ) : (
          <ul className="grid gap-3">
            {shown.map((license) => (
              <LicenseRow
                key={license.licenseSlug}
                isUsageLoading={isUsageLoading}
                license={license}
                locale={locale}
                mapping={mappingByLicenseSlug.get(license.licenseSlug)}
              />
            ))}
          </ul>
        )}
        {hidden > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 w-fit text-muted-foreground"
            onClick={() => setExpanded(true)}
          >
            {t('Pages.Entitlements.Detail.Overview.licenses.more', {
              count: hidden,
            })}
          </Button>
        ) : null}
      </DetailCard.Content>
    </DetailCard>
  );
}
