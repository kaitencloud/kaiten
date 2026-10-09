import { Navigate, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useAddonGrants } from '../../hooks';
import { useGrantDialogTarget } from '../../hooks/use-grant-dialog-target';
import { getEntitlementSlug } from '../../utils/addon-grant.utils';
import { FrozenVersionDialog } from '../frozen-version-dialog';
import { AddonGrantDialog } from './addon-grant-dialog';
import { AddonGrantsCard } from './addon-grants-card';

type AddonGrantsTabProps = {
  addonSlug: string;
  /** `new`, or the entitlement of the grant the URL opens the dialog on. */
  grantParam?: string;
};

/**
 * The grants of one add-on version: what one unit of quantity gives an instance that
 * holds it. A new grant or the edit of one opens in a dialog the URL controls; taking
 * one away asks first; and the way to a new version, when the version cannot be
 * changed where it is, is a dialog over the tab.
 */
export function AddonGrantsTab({ addonSlug, grantParam }: AddonGrantsTabProps) {
  const navigate = useNavigate();
  const grants = useAddonGrants(addonSlug);
  const dialog = useGrantDialogTarget({
    available: grants.available,
    grantParam,
    grants: grants.grants,
  });
  // What the API refused with when the version could not be changed any more.
  const [frozen, setFrozen] = useState<unknown>(null);

  const dropGrant = () =>
    void navigate({
      params: { addonSlug },
      search: (previous) => ({ ...previous, grant: undefined }),
      to: '/catalog/addons/$addonSlug/entitlements',
    });

  return (
    <>
      <AddonGrantsCard grants={grants} onFrozen={setFrozen} />
      {dialog.isOpen ? (
        <AddonGrantDialog
          addonName={grants.addon.name}
          addonSlug={addonSlug}
          grant={dialog.grant}
          onClose={dropGrant}
          onFrozen={(error) => {
            dropGrant();
            setFrozen(error);
          }}
          options={
            dialog.grant
              ? grants.entitlements.filter(
                  (entitlement) =>
                    getEntitlementSlug(entitlement) ===
                    dialog.grant?.entitlementSlug,
                )
              : grants.available
          }
        />
      ) : null}
      {dialog.shouldLeave ? (
        <Navigate
          params={{ addonSlug }}
          replace
          search={(previous) => ({ ...previous, grant: undefined })}
          to="/catalog/addons/$addonSlug/entitlements"
        />
      ) : null}
      {frozen ? (
        <FrozenVersionDialog
          addon={grants.addon}
          error={frozen}
          onClose={() => setFrozen(null)}
        />
      ) : null}
    </>
  );
}
