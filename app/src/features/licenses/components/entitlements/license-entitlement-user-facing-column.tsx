import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { Switch } from '@/components/ui/switch';
import type { ColumnDef } from '@/functionals/table';
import type { EditableLicenseEntitlement } from '../../utils';
import type { EntitlementUserFacingControl } from './license-entitlements-card.types';

const stopPropagation = (event: { stopPropagation: () => void }) => {
  event.stopPropagation();
};

/**
 * The column that shows whether each granted entitlement is user facing, with
 * the switch that changes it, or null where the page offers none. The flag is
 * the entitlement's own, read from the catalogue: a grant carries none.
 */
export function useUserFacingColumn(
  entitlements: Entitlement[],
  control: EntitlementUserFacingControl | undefined,
): ColumnDef<EditableLicenseEntitlement> | null {
  const { t } = useTranslation();
  const catalogueById = useMemo(
    () => new Map(entitlements.map((item) => [item.id, item])),
    [entitlements],
  );
  const setUserFacing = control?.setUserFacing;
  const locked = !control?.allowed || control.isPending;

  return useMemo(() => {
    if (!setUserFacing) return null;

    return {
      id: 'userFacing',
      header: t('Pages.Licenses.Entitlements.Columns.userFacing'),
      cell: ({ row }) => {
        const definition = catalogueById.get(row.original.entitlementId ?? '');
        if (!definition) return null;

        return (
          // The table's rows open the entitlement: data-row-actions keeps a
          // click here, even on the switch while it is off, from doing so, and
          // the key handler keeps Space and Enter for the switch.
          <div
            data-row-actions
            role="none"
            className="flex"
            onKeyDown={stopPropagation}
            title={t('Pages.Licenses.Entitlements.userFacingHint')}
          >
            <Switch
              aria-label={t('Pages.Licenses.Entitlements.userFacingSwitch', {
                name: definition.name,
              })}
              checked={definition.userFacing ?? false}
              disabled={locked}
              onCheckedChange={(userFacing) =>
                setUserFacing(definition, userFacing)
              }
              size="sm"
            />
          </div>
        );
      },
    };
  }, [catalogueById, locked, setUserFacing, t]);
}
