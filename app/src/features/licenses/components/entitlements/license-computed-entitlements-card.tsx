import { useRouter } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { EntityIcon } from '@/components/ui/icon';
import { isAiEntitlement, useAiAccess } from '@/domains/ai-credits';
import { type ColumnDef, TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { formatDecimalQuantity } from '@/lib/decimal';
import {
  buildComputedEntitlements,
  type ComputedEntitlement,
  type EditableLicenseEntitlement,
} from '../../utils';

const KEY = 'Pages.Licenses.Entitlements.Computed';

type LicenseComputedEntitlementsCardProps = {
  /** The catalogue: the combined entitlements are in it, with their sources. */
  entitlements: Entitlement[];
  /** The grants of the version. */
  rows: EditableLicenseEntitlement[];
};

/**
 * The combined entitlements this version makes, under its grants. A combined entitlement
 * is granted by no license: it is the weighted sum of the sources the version grants,
 * computed when it is read, and it exists for an instance as soon as one of its sources
 * is granted to it. So it has no row to edit among the grants: it is read here, with what
 * it comes to for this version and what it is made of, and changes when the grants of
 * its sources do. Nothing is shown when the version grants no source of any.
 */
export function LicenseComputedEntitlementsCard({
  entitlements,
  rows,
}: LicenseComputedEntitlementsCardProps) {
  const { i18n, t } = useTranslation();
  const access = useAiAccess();
  const router = useRouter();
  const locale = i18n.resolvedLanguage ?? 'en-US';
  const EntitlementIcon = dataModelIcons.entitlement;
  // The sums of what the version shows: a credit pool it hides is no source of them.
  const computed = useMemo(
    () =>
      buildComputedEntitlements(
        entitlements.filter(
          (item) => access.available || !isAiEntitlement(item.type),
        ),
        rows.filter(
          (row) =>
            access.available || !isAiEntitlement(row.catalogueEntitlementType),
        ),
      ),
    [access.available, entitlements, rows],
  );
  const columns = useMemo<ColumnDef<ComputedEntitlement>[]>(
    () => [
      {
        id: 'entitlement',
        enableSorting: false,
        header: t(`${KEY}.Columns.entitlement`),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <EntityIcon
              token={row.original.entitlement.icon}
              className="size-4 shrink-0 text-muted-foreground"
            />
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">
                {row.original.entitlement.name}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {row.original.entitlement.slug}
              </span>
            </div>
          </div>
        ),
      },
      {
        id: 'limit',
        enableSorting: false,
        header: t(`${KEY}.Columns.limit`),
        cell: ({ row }) => {
          const { limit, entitlement } = row.original;

          return limit.unlimited ? (
            <span>{t(`${KEY}.unlimited`)}</span>
          ) : (
            <span className="tabular-nums">
              {formatDecimalQuantity(limit.limit, locale)}
              {entitlement.unitPlural ? ` ${entitlement.unitPlural}` : ''}
            </span>
          );
        },
      },
      {
        id: 'parts',
        enableSorting: false,
        header: t(`${KEY}.Columns.parts`),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.parts
              .map((part) =>
                t(part.grant === -1 ? `${KEY}.partUnlimited` : `${KEY}.part`, {
                  grant: part.grant.toLocaleString(locale),
                  name: part.name,
                  weight: formatDecimalQuantity(part.weight, locale),
                }),
              )
              .join(' + ')}
          </span>
        ),
      },
    ],
    [locale, t],
  );

  if (computed.length === 0) {
    return null;
  }

  const getPath = ({ entitlement }: ComputedEntitlement) =>
    entitlement.slug
      ? router.buildLocation({
          to: '/catalog/entitlements/$entitlementSlug',
          params: { entitlementSlug: entitlement.slug },
        }).pathname
      : undefined;

  return (
    <TableCard>
      <TableCard.Header>
        <TableCard.HeaderLeading>
          <TableCard.HeaderIcon>
            <EntitlementIcon />
          </TableCard.HeaderIcon>
          <TableCard.HeaderHeading>
            <TableCard.HeaderTitle>{t(`${KEY}.title`)}</TableCard.HeaderTitle>
            <TableCard.HeaderSubtitle>
              {t(`${KEY}.description`)}
            </TableCard.HeaderSubtitle>
          </TableCard.HeaderHeading>
        </TableCard.HeaderLeading>
      </TableCard.Header>
      <TableCard.Table
        columns={columns}
        data={computed}
        getPath={getPath}
        linkColumnId="entitlement"
        pagination={false}
        variant="simple"
      />
    </TableCard>
  );
}
