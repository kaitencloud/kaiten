import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EntityIcon } from '@/components/ui/icon';
import { Trash2 } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DeleteConfirmationDialog } from '@/components/dialog';
import { isUnlimitedThreshold } from '@/domains/entitlement-usage';
import type { ColumnDef } from '@/functionals/table';
import type {
  LicenseEntitlementEditingField,
  LicenseEntitlementsCardStore,
} from '../../store';
import type { EditableLicenseEntitlement } from '../../utils/license-entitlements.utils';
import {
  formatEntitlementOveragePercent,
  formatEntitlementThreshold,
} from '../../utils/license-entitlements.utils';
import { InlineEditInput } from './inline-edit-input';
import { InlineEditPencil } from './inline-edit-pencil';

// The card sits in a row-clickable table on the detail page: every interactive
// cell keeps its clicks to itself, or editing a value would also navigate to
// the entitlement.
const stopPropagation = (event: MouseEvent) => {
  event.stopPropagation();
};

type UseEntitlementColumnsOptions = {
  closeEdit: () => void;
  editingEntitlementId: string | null;
  editingField: LicenseEntitlementEditingField | null;
  entitlementSlugById: Map<string, string>;
  onDeleteEntitlement: (entitlementId: string) => Promise<void> | void;
  // Resolves to false when the value was rejected and the cell stays open.
  onSaveEditedCell: (input?: string) => Promise<boolean>;
  onStartEditThreshold: (entitlement: EditableLicenseEntitlement) => void;
  onStartEditOveragePercent: (entitlement: EditableLicenseEntitlement) => void;
  savingEntitlementIds: ReadonlySet<string>;
  setEditingValue: (value: string) => void;
  // The edit-in-progress state is read from the store rather than passed as
  // values: see the getters below.
  store: LicenseEntitlementsCardStore['store'];
};

export function useEntitlementColumns({
  closeEdit,
  editingEntitlementId,
  editingField,
  entitlementSlugById,
  onDeleteEntitlement,
  onSaveEditedCell,
  onStartEditThreshold,
  onStartEditOveragePercent,
  savingEntitlementIds,
  setEditingValue,
  store,
}: UseEntitlementColumnsOptions) {
  const { t } = useTranslation();
  // The edited text has to stay out of the memo below: as a dependency it would
  // rebuild every cell on each keystroke, remounting the very input the user is
  // typing into. So read it straight off the store at call time instead of
  // taking it as a value -- the store's identity never changes, so these two
  // getters are stable, and unlike the refs they replace they are legal to call
  // while rendering (which `defaultValue` in InlineEditInput does).
  const getEditingValue = useCallback(() => store.state.editingValue, [store]);
  const getSelectsOnFocus = useCallback(
    () => !store.state.editingValueTouched,
    [store],
  );
  const thresholdLabel = t('Pages.Licenses.Entitlements.Columns.threshold');
  const overagePercentLabel = t(
    'Pages.Licenses.Entitlements.Columns.overagePercent',
  );
  const thresholdPlaceholder = t(
    'Pages.Licenses.Entitlements.thresholdPlaceholder',
  );
  const overagePercentPlaceholder = t(
    'Pages.Licenses.Entitlements.overagePercentPlaceholder',
  );
  const editLabel = t('Common.edit');
  const inlineEditHint = t('Pages.Licenses.Entitlements.inlineEditHint');
  const overageNeedsLimitHint = t(
    'Pages.Licenses.Entitlements.overageNeedsLimit',
  );

  return useMemo<ColumnDef<EditableLicenseEntitlement>[]>(() => {
    const isEditingField = (
      entitlement: EditableLicenseEntitlement,
      field: LicenseEntitlementEditingField,
    ) =>
      Boolean(entitlement.entitlementId) &&
      editingEntitlementId === entitlement.entitlementId &&
      editingField === field;
    const isSaving = (entitlement: EditableLicenseEntitlement) =>
      Boolean(entitlement.entitlementId) &&
      savingEntitlementIds.has(entitlement.entitlementId as string);

    return [
      {
        accessorKey: 'entitlementName',
        header: t('Pages.Licenses.Entitlements.Columns.entitlement'),
        cell: ({ row }) => {
          const entitlement = row.original;
          const entitlementSlug = entitlement.entitlementId
            ? (entitlementSlugById.get(entitlement.entitlementId) ??
              entitlement.entitlementName)
            : entitlement.entitlementName;

          return (
            <div className="flex items-center gap-2">
              <EntityIcon
                token={entitlement.entitlementIcon}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">
                  {entitlement.entitlementName}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {entitlementSlug}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'entitlementType',
        header: t('Pages.Licenses.Entitlements.Columns.type'),
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.entitlementType === 'NUMBER'
                ? 'outline'
                : 'secondary'
            }
          >
            {t(
              `Pages.Entitlements.EntitlementTypes.${row.original.entitlementType}`,
            )}
          </Badge>
        ),
      },
      {
        accessorKey: 'threshold',
        header: thresholdLabel,
        cell: ({ row }) => {
          const entitlement = row.original;
          if (isEditingField(entitlement, 'threshold')) {
            return (
              <InlineEditInput
                ariaLabel={thresholdLabel}
                getInitialValue={getEditingValue}
                getSelectsOnFocus={getSelectsOnFocus}
                hint={inlineEditHint}
                onCancel={closeEdit}
                onChange={setEditingValue}
                onSave={onSaveEditedCell}
                placeholder={thresholdPlaceholder}
              />
            );
          }

          if (entitlement.entitlementType === 'NUMBER') {
            return (
              <button
                type="button"
                className="group/inline-edit inline-flex items-center gap-1.5 font-mono text-sm transition-colors hover:text-foreground/80 disabled:opacity-60"
                title={editLabel}
                onClick={(event) => {
                  stopPropagation(event);
                  onStartEditThreshold(entitlement);
                }}
                disabled={!entitlement.entitlementId || isSaving(entitlement)}
              >
                {formatEntitlementThreshold(entitlement, t)}
                <InlineEditPencil />
              </button>
            );
          }

          return (
            <span className="font-mono text-sm">
              {formatEntitlementThreshold(entitlement, t)}
            </span>
          );
        },
      },
      {
        accessorKey: 'limitCapExceededOveragePercent',
        header: overagePercentLabel,
        cell: ({ row }) => {
          const entitlement = row.original;
          if (isEditingField(entitlement, 'overagePercent')) {
            return (
              <InlineEditInput
                ariaLabel={overagePercentLabel}
                getInitialValue={getEditingValue}
                getSelectsOnFocus={getSelectsOnFocus}
                hint={inlineEditHint}
                inputMode="numeric"
                onCancel={closeEdit}
                onChange={setEditingValue}
                onSave={onSaveEditedCell}
                placeholder={overagePercentPlaceholder}
              />
            );
          }

          // Only a capped NUMBER grant has an overage to configure.
          const isEditable =
            Boolean(entitlement.entitlementId) &&
            entitlement.entitlementType === 'NUMBER' &&
            !isUnlimitedThreshold(entitlement.threshold);

          if (isEditable) {
            return (
              <button
                type="button"
                className="group/inline-edit inline-flex items-center gap-1.5 font-mono text-sm transition-colors hover:text-foreground/80 disabled:opacity-60"
                title={editLabel}
                onClick={(event) => {
                  stopPropagation(event);
                  onStartEditOveragePercent(entitlement);
                }}
                disabled={isSaving(entitlement)}
              >
                {formatEntitlementOveragePercent(entitlement, t)}
                <InlineEditPencil />
              </button>
            );
          }

          // An unlimited NUMBER grant has nothing to exceed: the dash says so
          // on hover rather than looking like a value that refuses to open.
          const needsLimitFirst =
            Boolean(entitlement.entitlementId) &&
            entitlement.entitlementType === 'NUMBER';

          return (
            <span
              className="font-mono text-sm text-muted-foreground"
              title={needsLimitFirst ? overageNeedsLimitHint : undefined}
            >
              {formatEntitlementOveragePercent(entitlement, t)}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: () => (
          <div className="text-right">
            {t('Pages.Licenses.Entitlements.Columns.actions')}
          </div>
        ),
        meta: {
          cellClassName: 'w-[96px] text-right',
          headerClassName: 'w-[96px] text-right',
        },
        cell: ({ row }) => {
          const entitlement = row.original;
          const hasValidEntitlementId = Boolean(entitlement.entitlementId);
          const isEditing =
            Boolean(entitlement.entitlementId) &&
            editingEntitlementId === entitlement.entitlementId;
          return (
            <div className="flex items-center justify-end gap-2">
              {!isEditing ? (
                <DeleteConfirmationDialog
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t(
                        'Pages.Licenses.Entitlements.removeAriaLabel',
                        { name: entitlement.entitlementName },
                      )}
                      className="text-destructive-subtle-foreground hover:text-destructive-subtle-foreground"
                      onClick={stopPropagation}
                      disabled={!hasValidEntitlementId || isSaving(entitlement)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  }
                  title={t('Pages.Licenses.Entitlements.confirmRemoveTitle', {
                    name: entitlement.entitlementName,
                  })}
                  description={t(
                    'Pages.Licenses.Entitlements.confirmRemoveDescription',
                  )}
                  cancelLabel={t('Common.cancel')}
                  confirmLabel={t('Pages.Licenses.Entitlements.removeAction')}
                  onConfirm={() => {
                    if (entitlement.entitlementId) {
                      void onDeleteEntitlement(entitlement.entitlementId);
                    }
                  }}
                />
              ) : null}
            </div>
          );
        },
      },
    ];
  }, [
    closeEdit,
    editingEntitlementId,
    editingField,
    editLabel,
    entitlementSlugById,
    getEditingValue,
    getSelectsOnFocus,
    inlineEditHint,
    onDeleteEntitlement,
    onSaveEditedCell,
    onStartEditThreshold,
    onStartEditOveragePercent,
    overageNeedsLimitHint,
    overagePercentLabel,
    overagePercentPlaceholder,
    savingEntitlementIds,
    setEditingValue,
    t,
    thresholdLabel,
    thresholdPlaceholder,
  ]);
}
