import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AddonEntitlement, Entitlement } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import {
  type ColumnDef,
  createActionsColumn,
  DataTable,
} from '@/functionals/table';
import { formatNumber } from '@/lib/format-date';
import {
  OVERRIDE_BEHAVIOR_LABEL_KEYS,
  readGrantOverage,
  readGrantValue,
} from '../../utils/addon-grant.utils';
import { AddonGrantRowActions } from './addon-grant-row-actions';

type AddonGrantsTableProps = {
  addonSlug: string;
  entitlementBySlug: ReadonlyMap<string, Entitlement>;
  grants: readonly AddonEntitlement[];
  /** The API refused to remove a grant because the version cannot be changed where it is. */
  onFrozen: (error: unknown) => void;
};

function EntitlementCell({
  entitlement,
  grant,
}: {
  entitlement: Entitlement | undefined;
  grant: AddonEntitlement;
}) {
  return (
    <div className="space-y-0.5 whitespace-normal">
      <p className="font-medium">
        {entitlement?.name ?? grant.entitlementSlug}
      </p>
      {entitlement ? (
        <p className="font-mono text-xs text-muted-foreground">
          {grant.entitlementSlug}
        </p>
      ) : null}
    </div>
  );
}

// What one unit of the version grants: a number counts once per unit of quantity, a
// flag is on or off, a configuration is a document.
function ValueCell({ grant }: { grant: AddonEntitlement }) {
  const { t } = useTranslation();
  const held = readGrantValue(grant);

  switch (held.kind) {
    case 'number':
      return (
        <span>
          {held.value < 0
            ? t('Pages.Addons.Grants.Values.unlimited')
            : t('Pages.Addons.Grants.Values.perUnit', {
                value: formatNumber(held.value),
              })}
        </span>
      );
    case 'boolean':
      return (
        <span>
          {t(
            held.value
              ? 'Pages.Addons.Grants.Values.enabled'
              : 'Pages.Addons.Grants.Values.disabled',
          )}
        </span>
      );
    case 'config':
      return <span>{t('Pages.Addons.Grants.Values.configured')}</span>;
    case 'unknown':
      return <span className="text-muted-foreground">-</span>;
  }
}

function BehaviorCell({ grant }: { grant: AddonEntitlement }) {
  const { t } = useTranslation();

  // A boolean always ORs and a configuration always overrides: the setting is a
  // number's.
  return readGrantValue(grant).kind === 'number' ? (
    <span>{t(OVERRIDE_BEHAVIOR_LABEL_KEYS[grant.overrideBehavior])}</span>
  ) : (
    <span className="text-muted-foreground">-</span>
  );
}

function OverageCell({ grant }: { grant: AddonEntitlement }) {
  const { t } = useTranslation();
  const overage = readGrantOverage(grant);

  switch (overage.kind) {
    case 'inherit':
      return (
        <Badge variant="outline">
          {t('Pages.Addons.Grants.Overage.inherit')}
        </Badge>
      );
    case 'hard':
      return <span>{t('Pages.Addons.Grants.Overage.hard')}</span>;
    case 'soft':
      return (
        <span>
          {t('Pages.Addons.Grants.Overage.soft', { percent: overage.percent })}
        </span>
      );
    case 'unlimited':
      return <span>{t('Pages.Addons.Grants.Overage.unlimited')}</span>;
    case 'none':
      return <span className="text-muted-foreground">-</span>;
  }
}

/**
 * The grants of a version, in the order the API gives them. Each says what one unit
 * of quantity grants, how it combines with the license's grant of the same
 * entitlement, and the overage it allows: empty, it inherits the license's.
 */
export function AddonGrantsTable({
  addonSlug,
  entitlementBySlug,
  grants,
  onFrozen,
}: AddonGrantsTableProps) {
  const { t } = useTranslation();
  const columns = useMemo<ColumnDef<AddonEntitlement>[]>(
    () => [
      {
        cell: ({ row }) => (
          <EntitlementCell
            entitlement={entitlementBySlug.get(row.original.entitlementSlug)}
            grant={row.original}
          />
        ),
        enableSorting: false,
        header: t('Pages.Addons.Grants.Table.Columns.entitlement'),
        id: 'entitlement',
      },
      {
        cell: ({ row }) => (
          <Badge variant="secondary">
            {t(
              `Pages.Entitlements.EntitlementTypes.${row.original.entitlementType}`,
            )}
          </Badge>
        ),
        enableSorting: false,
        header: t('Pages.Addons.Grants.Table.Columns.type'),
        id: 'type',
      },
      {
        cell: ({ row }) => <ValueCell grant={row.original} />,
        enableSorting: false,
        header: t('Pages.Addons.Grants.Table.Columns.value'),
        id: 'value',
      },
      {
        cell: ({ row }) => <BehaviorCell grant={row.original} />,
        enableSorting: false,
        header: t('Pages.Addons.Grants.Table.Columns.behavior'),
        id: 'behavior',
      },
      {
        cell: ({ row }) => <OverageCell grant={row.original} />,
        enableSorting: false,
        header: t('Pages.Addons.Grants.Table.Columns.overage'),
        id: 'overage',
      },
      createActionsColumn<AddonEntitlement>((grant) => (
        <AddonGrantRowActions
          addonSlug={addonSlug}
          entitlement={entitlementBySlug.get(grant.entitlementSlug)}
          grant={grant}
          onFrozen={onFrozen}
        />
      )),
    ],
    [addonSlug, entitlementBySlug, onFrozen, t],
  );

  return (
    <DataTable
      columns={columns}
      data={[...grants]}
      emptyMessage={t('Pages.Addons.Grants.Table.empty')}
      getRowId={(grant) => grant.id}
      pagination={false}
      variant="simple"
    />
  );
}
