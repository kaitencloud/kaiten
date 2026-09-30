import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLicenseEntitlementsCardStore } from '../../hooks/use-license-entitlements-card-store';
import { getEntitlementSlug } from '../../utils/license-entitlements.utils';
import type { LicenseEntitlementsCardProps } from './license-entitlements-card.types';
import { getCardDescriptionParts } from './license-entitlements-card-utils';
import { useAddEntitlementAction } from './use-add-entitlement-action';
import { useInlineEditActions } from './use-inline-edit-actions';

type UseLicenseEntitlementsCardOptions = Pick<
  LicenseEntitlementsCardProps,
  | 'description'
  | 'entitlements'
  | 'onAddEntitlement'
  | 'onUpdateEntitlementGrant'
  | 'rows'
>;

function useLicenseEntitlementsCardData({
  description,
  entitlements,
  rows,
  selectedEntitlementId,
  t,
}: Pick<
  UseLicenseEntitlementsCardOptions,
  'description' | 'entitlements' | 'rows'
> & {
  selectedEntitlementId: string | null;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const cardDescriptionText =
    description ?? t('Pages.Licenses.Entitlements.cardDescription');
  const entitlementSlugById = useMemo(
    () =>
      new Map(
        entitlements.map((entitlement) => [
          entitlement.id,
          getEntitlementSlug(entitlement),
        ]),
      ),
    [entitlements],
  );
  const attachedEntitlementIds = useMemo(
    () =>
      new Set(
        rows
          .map((entitlement) => entitlement.entitlementId)
          .filter((entitlementId): entitlementId is string =>
            Boolean(entitlementId),
          ),
      ),
    [rows],
  );
  const availableEntitlements = useMemo(
    () =>
      entitlements.filter(
        (entitlement) => !attachedEntitlementIds.has(entitlement.id),
      ),
    [attachedEntitlementIds, entitlements],
  );
  const selectedEntitlement = useMemo(
    () =>
      entitlements.find(
        (entitlement) => entitlement.id === selectedEntitlementId,
      ) ?? null,
    [entitlements, selectedEntitlementId],
  );
  const [cardDescriptionSummary, cardDescriptionDetails] = useMemo(
    () => getCardDescriptionParts(cardDescriptionText),
    [cardDescriptionText],
  );

  return {
    availableEntitlements,
    cardDescriptionDetails,
    cardDescriptionSummary,
    entitlementSlugById,
    selectedEntitlement,
  };
}

export function useLicenseEntitlementsCard({
  description,
  entitlements,
  onAddEntitlement,
  onUpdateEntitlementGrant,
  rows,
}: UseLicenseEntitlementsCardOptions) {
  const { t } = useTranslation();
  const store = useLicenseEntitlementsCardStore();
  const {
    editingEntitlementId,
    editingField,
    newBooleanValue,
    newConfigValue,
    newOveragePercent,
    newThreshold,
    newThresholdUnlimited,
    savingEntitlementIds,
    selectedEntitlementId,
    beginSave,
    closeAddDialog,
    closeEdit,
    endSave,
    resetAddDialogState,
    startEdit,
  } = store;
  const {
    availableEntitlements,
    cardDescriptionDetails,
    cardDescriptionSummary,
    entitlementSlugById,
    selectedEntitlement,
  } = useLicenseEntitlementsCardData({
    description,
    entitlements,
    rows,
    selectedEntitlementId,
    t,
  });
  const handleAddEntitlement = useAddEntitlementAction({
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
  });
  const {
    handleSaveEditedCell,
    handleStartEditThreshold,
    handleStartEditOveragePercent,
  } = useInlineEditActions({
    beginSave,
    closeEdit,
    editingEntitlementId,
    editingField,
    endSave,
    onUpdateEntitlementGrant,
    rows,
    store: store.store,
    savingEntitlementIds,
    startEdit,
    t,
  });

  // A row can disappear under an open editor: the version form's Reset, a
  // re-sync from another base version, or a deletion. Nothing would close the
  // edit otherwise, and the cell would reopen in edit mode if the row came
  // back.
  useEffect(() => {
    if (
      !editingEntitlementId ||
      rows.some((row) => row.entitlementId === editingEntitlementId)
    ) {
      return;
    }

    closeEdit();
  }, [closeEdit, editingEntitlementId, rows]);

  return {
    ...store,
    availableEntitlements,
    cardDescriptionDetails,
    cardDescriptionSummary,
    entitlementSlugById,
    handleAddEntitlement,
    handleSaveEditedCell,
    handleStartEditThreshold,
    handleStartEditOveragePercent,
    t,
  };
}
