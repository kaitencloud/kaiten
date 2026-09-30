import type { Entitlement } from '@/api-client';
import type { AddDraftEntitlementPayload } from '../../hooks/use-license-entitlements-draft';
import type { EditableLicenseEntitlement } from '../../utils';

export type AddEntitlementPayload = AddDraftEntitlementPayload & {
  entitlementType?: NonNullable<Entitlement['type']>;
};

export type LicenseEntitlementsCardProps = {
  addButtonLabel?: string;
  description?: string;
  emptyMessage?: string;
  entitlements: Entitlement[];
  onAddEntitlement: (payload: AddEntitlementPayload) => Promise<void> | void;
  onClickEntitlement?: (entitlementSlug: string) => void;
  onDeleteEntitlement: (entitlementId: string) => Promise<void> | void;
  // Threshold and overage percent always travel together: the API derives
  // enforcement from the pair and resets an omitted percent to its default.
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
};

export type LicenseEntitlementsCardResetAction = NonNullable<
  LicenseEntitlementsCardProps['resetAction']
>;
