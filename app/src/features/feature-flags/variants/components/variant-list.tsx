import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Accordion } from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { hasDuplicateNames, mapToApiVariants } from '../schemas/variant.schema';
import type { Variant, VariantListProps } from '../types';
import { VariantItem } from './variant-item';

// Default boolean variants
const DEFAULT_BOOLEAN_VARIANTS: Variant[] = [
  {
    name: 'true',
    description: 'Feature enabled',
    value: true,
  },
  {
    name: 'false',
    description: 'Feature disabled',
    value: false,
  },
];

export function VariantList({
  variants: initialVariants,
  type,
  onChange,
  disabled = false,
}: VariantListProps) {
  const { t } = useTranslation();
  const variants =
    type === 'boolean' && initialVariants.length === 0
      ? DEFAULT_BOOLEAN_VARIANTS
      : initialVariants;

  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  const seededBooleanDefaults = useRef(false);

  // Stable React keys keyed on variant object identity, so editing one variant
  // does not remount its item and pull focus out of the field being typed in.
  // The map and its counter live in a closure built once by the initializer
  // below, which keeps both out of refs that would be written during render.
  const [getVariantItemId] = useState(() => {
    const idsByVariant = new WeakMap<Variant, string>();
    let nextItemId = 0;

    return (variant: Variant) => {
      const existingId = idsByVariant.get(variant);
      if (existingId) {
        return existingId;
      }

      const id = `variant-${nextItemId++}`;
      idsByVariant.set(variant, id);
      return id;
    };
  });

  // Seed boolean defaults into the form state when needed.
  useEffect(() => {
    if (type !== 'boolean') {
      seededBooleanDefaults.current = false;
      return;
    }

    if (initialVariants.length > 0) {
      seededBooleanDefaults.current = false;
      return;
    }

    if (!seededBooleanDefaults.current) {
      seededBooleanDefaults.current = true;
      onChange(mapToApiVariants(DEFAULT_BOOLEAN_VARIANTS) as any);
    }
  }, [type, initialVariants, onChange]);

  const handleAdd = () => {
    const defaultValue: unknown =
      type === 'boolean'
        ? false
        : type === 'number'
          ? 0
          : type === 'object'
            ? {}
            : '';

    const newVariant: Variant = {
      name: '',
      description: '',
      value: defaultValue,
    };

    const newVariants = [...variants, newVariant];
    onChange(mapToApiVariants(newVariants) as any);
  };

  const handleUpdate = useCallback(
    (index: number, variant: Variant) => {
      const currentVariants = [...variants];
      currentVariants[index] = variant;
      onChange(mapToApiVariants(currentVariants) as any);
    },
    [variants, onChange],
  );

  const handleDelete = useCallback(
    (index: number) => {
      // Prevent deletion of boolean variants
      if (type === 'boolean') {
        setDeletingIndex(null);
        return;
      }

      setDeletingIndex(null);
      const updatedVariants = variants.filter((_, i) => i !== index);
      onChange(mapToApiVariants(updatedVariants) as any);
    },
    [variants, onChange, type],
  );

  // Show warning if duplicates
  const hasDuplicates = hasDuplicateNames(variants);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {t('Features.Variants.List.title')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('Features.Variants.List.description')}
          </p>
          {hasDuplicates && (
            <p className="text-sm text-destructive-subtle-foreground mt-1">
              {t('Features.Variants.List.duplicateWarning')}
            </p>
          )}
        </div>
        {type !== 'boolean' && (
          <Button
            type="button"
            onClick={handleAdd}
            disabled={disabled}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('Features.Variants.List.addButton')}
          </Button>
        )}
      </div>

      {variants.length === 0 && (
        <div className="border border-dashed rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t('Features.Variants.List.emptyState')}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={handleAdd}
            disabled={disabled}
            className="mt-4"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('Features.Variants.List.addFirstButton')}
          </Button>
        </div>
      )}

      <Accordion
        multiple
        className="space-y-3"
        defaultValue={variants.map((_, i) => `variant-${i}`)}
      >
        {variants.map((variant, index) => (
          <VariantItem
            key={getVariantItemId(variant)}
            variant={variant}
            index={index}
            isValid={true}
            type={type}
            onUpdate={handleUpdate}
            onDelete={setDeletingIndex}
          />
        ))}
      </Accordion>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deletingIndex !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingIndex(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('Features.Variants.List.deleteConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('Features.Variants.List.deleteConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Common.cancel')}</AlertDialogCancel>
            <AlertDialogClose
              render={
                <AlertDialogAction
                  onClick={() =>
                    deletingIndex !== null && handleDelete(deletingIndex)
                  }
                >
                  {t('Common.delete')}
                </AlertDialogAction>
              }
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
