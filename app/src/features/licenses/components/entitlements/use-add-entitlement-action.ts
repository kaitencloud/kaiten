import { useCallback } from 'react';
import type { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  UNLIMITED_OVERAGE_PERCENT,
  UNLIMITED_THRESHOLD,
} from '@/domains/entitlement-usage';
import type {
  LicenseEntitlementsCardStoreActions,
  LicenseEntitlementsCardStoreState,
} from '../../store';
import { isNumericEntitlementType } from '../../utils/license-entitlements.utils';
import type {
  AddEntitlementPayload,
  LicenseEntitlementsCardProps,
} from './license-entitlements-card.types';

type CardStore = LicenseEntitlementsCardStoreState &
  LicenseEntitlementsCardStoreActions;

export function useAddEntitlementAction({
  closeAddDialog,
  newBooleanValue,
  newConfigValue,
  newOveragePercent,
  newThreshold,
  newThresholdUnlimited,
  onAddEntitlement,
  resetAddDialogState,
  selectedEntitlement,
  selectedEntitlementId,
  t,
}: Pick<LicenseEntitlementsCardProps, 'onAddEntitlement'> &
  Pick<
    CardStore,
    | 'closeAddDialog'
    | 'newBooleanValue'
    | 'newConfigValue'
    | 'newOveragePercent'
    | 'newThreshold'
    | 'newThresholdUnlimited'
    | 'resetAddDialogState'
  > & {
    selectedEntitlement:
      | LicenseEntitlementsCardProps['entitlements'][number]
      | null;
    selectedEntitlementId: string | null;
    t: ReturnType<typeof useTranslation>['t'];
  }) {
  return useCallback(async () => {
    if (!selectedEntitlementId || !selectedEntitlement) {
      return;
    }

    const payload: AddEntitlementPayload = {
      entitlementId: selectedEntitlementId,
      entitlementType: selectedEntitlement.type ?? undefined,
    };

    if (isNumericEntitlementType(selectedEntitlement.type)) {
      if (newThresholdUnlimited) {
        payload.threshold = UNLIMITED_THRESHOLD;
        payload.limitCapExceededOveragePercent = UNLIMITED_OVERAGE_PERCENT;
      } else {
        // A capped grant needs a value; the control leaves it null while empty.
        if (newThreshold === null) {
          toast.error(t('Pages.Licenses.Entitlements.thresholdError'));
          return;
        }

        payload.threshold = newThreshold;
        // Cleared reads as no allowance at all, which is a hard limit.
        payload.limitCapExceededOveragePercent = newOveragePercent ?? 0;
      }
    } else if (selectedEntitlement.type === 'BOOLEAN') {
      payload.enabled = newBooleanValue;
    } else if (selectedEntitlement.type === 'CONFIG') {
      try {
        payload.configValue = JSON.parse(newConfigValue) as Record<
          string,
          unknown
        >;
      } catch {
        toast.error(
          t(
            'Pages.Licenses.Entitlements.configError',
            'Configuration must be valid JSON',
          ),
        );
        return;
      }
    } else {
      payload.enabled = newBooleanValue;
    }

    try {
      await onAddEntitlement(payload);
    } catch {
      // The mutation owning the request already reports the failure, and the
      // dialog stays open for another try.
      return;
    }
    resetAddDialogState();
    closeAddDialog();
  }, [
    closeAddDialog,
    newBooleanValue,
    newConfigValue,
    newOveragePercent,
    newThreshold,
    newThresholdUnlimited,
    onAddEntitlement,
    resetAddDialogState,
    selectedEntitlement,
    selectedEntitlementId,
    t,
  ]);
}
