import type { Entitlement } from '@/api-client';
import type { AddDraftEntitlementPayload } from '../../hooks/use-license-entitlements-draft';
import type { EditableLicenseEntitlement } from '../../utils';

export type AddEntitlementPayload = AddDraftEntitlementPayload & {
  entitlementType?: NonNullable<Entitlement['type']>;
};

/**
 * The entitlement's own "user facing" flag, where a page lets it be changed from
 * the grants: the write belongs to the entitlements, so the route hands it in.
 */
export type EntitlementUserFacingControl = {
  /** Whether the session may change the flag; it is shown either way. */
  allowed: boolean;
  isPending: boolean;
  setUserFacing: (entitlement: Entitlement, userFacing: boolean) => void;
};

export type LicenseEntitlementsCardProps = {
  /** Exact persisted version; omitted by unsaved creation forms. */
  licenseSlug?: string;
  addButtonLabel?: string;
  description?: string;
  emptyMessage?: string;
  entitlements: Entitlement[];
  onAddEntitlement: (payload: AddEntitlementPayload) => Promise<void> | void;
  onClickEntitlement?: (entitlementSlug: string) => void;
  onDeleteEntitlement: (entitlementId: string) => Promise<void> | void;
  // Threshold and overage percent always travel together: the API derives
  // enforcement from the pair and resets an omitted percent to its default.
  /** The grants are shown and cannot be changed: no add, no reset, no inline edit, no removal. */
  readOnly?: boolean;
  onUpdateEntitlementGrant: (
    entitlementId: string,
    threshold: number,
    limitCapExceededOveragePercent: number,
  ) => Promise<void> | void;
  resetAction?: {
    disabled?: boolean;
    label?: string;
    onReset: () => void;
  };
  rows: EditableLicenseEntitlement[];
  /** Adds the User facing column and its switch. Omitted by the creation forms. */
  userFacing?: EntitlementUserFacingControl;
};

export type LicenseEntitlementsCardResetAction = NonNullable<
  LicenseEntitlementsCardProps['resetAction']
>;
