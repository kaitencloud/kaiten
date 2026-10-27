import { useAiAccess, isAiEntitlement } from '@/domains/ai-credits';
import { useCallback, useMemo } from 'react';
import { type Row, TableCard } from '@/functionals/table';
import type { EditableLicenseEntitlement } from '../../utils';
import { AddEntitlementDialog } from './add-entitlement-dialog';
import type { LicenseEntitlementsCardProps } from './license-entitlements-card.types';
import { useEntitlementColumns } from './license-entitlements-card-columns';
import { LicenseEntitlementsHeader } from './license-entitlements-card-header';
import { useLicenseEntitlementsCard } from './use-license-entitlements-card';

export type {
  AddEntitlementPayload,
  LicenseEntitlementsCardProps,
} from './license-entitlements-card.types';

export function LicenseEntitlementsCard({
  licenseSlug,
  addButtonLabel,
  description,
  emptyMessage,
  entitlements,
  onAddEntitlement,
  onClickEntitlement,
  onDeleteEntitlement,
  onUpdateEntitlementGrant,
  readOnly = false,
  resetAction,
  rows: canonicalRows,
}: LicenseEntitlementsCardProps) {
  const access = useAiAccess();
  // A projection only. The owning draft/save hooks retain every canonical grant.
  const rows = useMemo(
    () =>
      canonicalRows.filter(
        (row) =>
          access.available ||
          !isAiEntitlement(
            row.catalogueEntitlementType ??
              entitlements.find((item) => item.id === row.entitlementId)?.type,
          ),
      ),
    [canonicalRows, entitlements, access.available],
  );
  const visibleEntitlements = useMemo(
    () =>
      entitlements.filter(
        (item) => access.available || !isAiEntitlement(item.type),
      ),
    [entitlements, access.available],
  );
  const {
    addDialogOpen,
    availableEntitlements,
    cardDescriptionDetails,
    cardDescriptionSummary,
    closeAddDialog,
    closeEdit,
    editingEntitlementId,
    editingField,
    entitlementSlugById,
    handleAddEntitlement,
    handleSaveEditedCell,
    handleStartEditThreshold,
    handleStartEditOveragePercent,
    newBooleanValue,
    newConfigValue,
    newOveragePercent,
    newThreshold,
    newThresholdUnlimited,
    openAddDialog,
    resetAddDialogState,
    savingEntitlementIds,
    selectedEntitlementId,
    setEditingValue,
    setNewBooleanValue,
    setNewConfigValue,
    setNewOveragePercent,
    setNewThreshold,
    setNewThresholdUnlimited,
    setSelectedEntitlementId,
    store,
    t,
  } = useLicenseEntitlementsCard({
    description,
    entitlements: visibleEntitlements,
    onAddEntitlement,
    onUpdateEntitlementGrant,
    rows,
  });

  // A row being saved is not navigable: its disabled delete button lets the
  // click through to the row, which would otherwise leave the page mid-save.
  const isRowClickable = useCallback(
    (row: EditableLicenseEntitlement) =>
      Boolean(row.entitlementId) &&
      !savingEntitlementIds.has(row.entitlementId as string),
    [savingEntitlementIds],
  );

  const handleClickRow = useCallback(
    (row: Row<EditableLicenseEntitlement>) => {
      if (!onClickEntitlement || !row.original.entitlementId) return;
      const slug =
        entitlementSlugById.get(row.original.entitlementId) ??
        row.original.entitlementName;
      onClickEntitlement(slug);
    },
    [entitlementSlugById, onClickEntitlement],
  );

  const columns = useEntitlementColumns({
    licenseSlug,
    mayConfigureAi:
      access.allows('getLicenses') && access.allows('listConversionRules'),
    entitlements,
    closeEdit,
    editingEntitlementId,
    editingField,
    entitlementSlugById,
    onDeleteEntitlement,
    onSaveEditedCell: handleSaveEditedCell,
    onStartEditThreshold: handleStartEditThreshold,
    onStartEditOveragePercent: handleStartEditOveragePercent,
    readOnly,
    savingEntitlementIds,
    setEditingValue,
    store,
  });

  return (
    <TableCard>
      <LicenseEntitlementsHeader
        addButtonLabel={addButtonLabel}
        cardDescriptionDetails={cardDescriptionDetails}
        cardDescriptionSummary={cardDescriptionSummary}
        hasAvailableEntitlements={availableEntitlements.length > 0}
        onOpenAddDialog={openAddDialog}
        readOnly={readOnly}
        resetAction={resetAction}
      />

      <TableCard.Table
        columns={columns}
        data={rows}
        variant="simple"
        onClickRow={onClickEntitlement ? handleClickRow : undefined}
        isRowClickable={onClickEntitlement ? isRowClickable : undefined}
        emptyMessage={
          emptyMessage ?? t('Pages.Licenses.Entitlements.emptyMessage')
        }
      />

      <AddEntitlementDialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            openAddDialog();
            return;
          }

          closeAddDialog();
          resetAddDialogState();
        }}
        availableEntitlements={availableEntitlements}
        selectedEntitlementId={selectedEntitlementId}
        onSelectedEntitlementIdChange={setSelectedEntitlementId}
        newThreshold={newThreshold}
        onNewThresholdChange={setNewThreshold}
        newThresholdUnlimited={newThresholdUnlimited}
        onNewThresholdUnlimitedChange={setNewThresholdUnlimited}
        newOveragePercent={newOveragePercent}
        onNewOveragePercentChange={setNewOveragePercent}
        newBooleanValue={newBooleanValue}
        onNewBooleanValueChange={setNewBooleanValue}
        newConfigValue={newConfigValue}
        onNewConfigValueChange={setNewConfigValue}
        onAddEntitlement={handleAddEntitlement}
      />
    </TableCard>
  );
}
