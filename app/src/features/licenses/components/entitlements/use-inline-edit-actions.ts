import { useCallback } from 'react';
import type { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  isUnlimitedThreshold,
  resolveLimitCapExceededOveragePercent,
} from '@/domains/entitlement-usage';
import type {
  LicenseEntitlementsCardStore,
  LicenseEntitlementsCardStoreActions,
  LicenseEntitlementsCardStoreState,
} from '../../store';
import { resolveInlineEditSave } from '../../utils/license-entitlement-write.utils';
import type { LicenseEntitlementsCardProps } from './license-entitlements-card.types';

type CardStore = LicenseEntitlementsCardStoreState &
  LicenseEntitlementsCardStoreActions;

export function useInlineEditActions({
  beginSave,
  closeEdit,
  editingEntitlementId,
  editingField,
  endSave,
  onUpdateEntitlementGrant,
  rows,
  savingEntitlementIds,
  startEdit,
  store,
  t,
}: Pick<LicenseEntitlementsCardProps, 'onUpdateEntitlementGrant' | 'rows'> &
  Pick<
    CardStore,
    | 'beginSave'
    | 'closeEdit'
    | 'editingEntitlementId'
    | 'editingField'
    | 'endSave'
    | 'savingEntitlementIds'
    | 'startEdit'
  > & {
    store: LicenseEntitlementsCardStore['store'];
    t: ReturnType<typeof useTranslation>['t'];
  }) {
  const handleStartEditThreshold = useCallback(
    (entitlement: (typeof rows)[number]) => {
      if (
        !entitlement.entitlementId ||
        entitlement.entitlementType !== 'NUMBER' ||
        savingEntitlementIds.has(entitlement.entitlementId)
      ) {
        return;
      }

      startEdit(
        entitlement.entitlementId,
        'threshold',
        isUnlimitedThreshold(entitlement.threshold)
          ? t('Pages.Licenses.Entitlements.Status.unlimited')
          : String(entitlement.threshold),
      );
    },
    [savingEntitlementIds, startEdit, t],
  );

  const handleStartEditOveragePercent = useCallback(
    (entitlement: (typeof rows)[number]) => {
      if (
        !entitlement.entitlementId ||
        entitlement.entitlementType !== 'NUMBER' ||
        isUnlimitedThreshold(entitlement.threshold) ||
        savingEntitlementIds.has(entitlement.entitlementId)
      ) {
        return;
      }

      startEdit(
        entitlement.entitlementId,
        'overagePercent',
        String(
          resolveLimitCapExceededOveragePercent(
            entitlement.threshold,
            entitlement.limitCapExceededOveragePercent,
          ),
        ),
      );
    },
    [savingEntitlementIds, startEdit],
  );

  // Both cells save through the same call: the API derives enforcement from
  // the (threshold, percent) pair and resets an omitted percent, so editing
  // one side always re-sends the other. The edit closes before the request
  // leaves and the row stays locked until it settles, so no second edit can
  // start from rows that have not been refetched yet.
  //
  // Resolves to false when the typed value was rejected: the cell then stays
  // open so the user can correct it.
  const handleSaveEditedCell = useCallback(
    async (input?: string) => {
      if (!editingEntitlementId || !editingField) {
        return true;
      }

      const row = rows.find(
        (entitlement) => entitlement.entitlementId === editingEntitlementId,
      );

      if (!row) {
        closeEdit();
        return true;
      }

      const resolution = resolveInlineEditSave(
        editingField,
        // Fallback for a caller that saves without naming a value. Read off the
        // store rather than taken as a dependency: `editingValue` changes on
        // every keystroke, and a new identity here would rebuild every column
        // and remount the input being typed into.
        input ?? store.state.editingValue,
        row,
        [t('Pages.Licenses.Entitlements.Status.unlimited')],
      );

      if (resolution.kind === 'invalid') {
        toast.error(t(resolution.errorKey));
        return false;
      }

      if (resolution.kind === 'noop') {
        closeEdit();
        return true;
      }

      const savingEntitlementId = editingEntitlementId;

      beginSave(savingEntitlementId);
      closeEdit();

      try {
        await onUpdateEntitlementGrant(
          savingEntitlementId,
          resolution.threshold,
          resolution.limitCapExceededOveragePercent,
        );
      } catch {
        // The mutation owning the request already reports the failure.
      } finally {
        endSave(savingEntitlementId);
      }

      return true;
    },
    [
      beginSave,
      closeEdit,
      editingEntitlementId,
      editingField,
      endSave,
      onUpdateEntitlementGrant,
      rows,
      store,
      t,
    ],
  );

  return {
    handleSaveEditedCell,
    handleStartEditThreshold,
    handleStartEditOveragePercent,
  };
}
