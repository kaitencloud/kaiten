import type { AddonEntitlement, Entitlement } from '@/api-client';
import { useActionAccess } from '@/domains/billing';

type UseGrantDialogTargetOptions = {
  /** The entitlements the version does not grant yet. */
  available: readonly Entitlement[];
  grants: readonly AddonEntitlement[];
  /** What the URL asks for: `new`, or the entitlement of the grant to edit. */
  grantParam?: string;
};

/**
 * What the dialog of a grant is to show, from what the URL asks for. A new grant
 * opens it where there is an entitlement left to grant and the session may write; an
 * existing one opens it on that grant. A link to a dialog that cannot open (an unknown
 * grant, nothing left to grant, a session that may not write) leads back to the tab,
 * not to a dialog left blank, except while the scopes of the session are being read:
 * they are not known yet, and a link followed from outside must not be dropped for
 * that.
 */
export function useGrantDialogTarget({
  available,
  grantParam,
  grants,
}: UseGrantDialogTargetOptions) {
  const assign = useActionAccess('addonGrants.assign');
  const update = useActionAccess('addonGrants.update');

  const isNew = grantParam === 'new' && assign.allowed && available.length > 0;
  const existing =
    grantParam && grantParam !== 'new'
      ? grants.find((grant) => grant.entitlementSlug === grantParam)
      : undefined;
  const editable = existing !== undefined && update.allowed;
  const isOpen = isNew || editable;

  return {
    /** The grant being edited; none for a new one. */
    grant: editable ? existing : undefined,
    isOpen,
    shouldLeave: !assign.isPending && grantParam !== undefined && !isOpen,
  };
}
