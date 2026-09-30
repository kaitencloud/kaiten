import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { Suspense, useCallback, useState } from 'react';
import {
  ActionAccordionActions,
  ActionAccordionContent,
  ActionAccordionHeader,
  ActionAccordionItem,
  ActionAccordionTrigger,
} from '@/components/ui/action-accordion';
import type { VariantItemProps } from '../types';
import { VariantForm } from './variant-form';
import { VariantItemHeader } from './variant-item-header';

// No need for memo anymore since we're not passing onChange that changes

export function VariantItem({
  variant,
  index,
  isValid: initialIsValid,
  onUpdate,
  onDelete,
  type,
}: VariantItemProps) {
  // Local state for live preview in header
  const [displayVariant, setDisplayVariant] = useState<typeof variant | null>(
    null,
  );
  // Local state for validation from form
  const [isValid, setIsValid] = useState(true);
  const effectiveIsValid = initialIsValid && isValid;

  // Create stable callbacks
  const handleUpdate = useCallback(
    (v: typeof variant) => {
      onUpdate(index, v);
    },
    [index, onUpdate],
  );

  const handleDelete = useCallback(() => {
    onDelete(index);
  }, [index, onDelete]);

  return (
    <ActionAccordionItem
      value={`variant-${index}`}
      className={`border rounded-lg transition-colors last:border-b ${
        !effectiveIsValid
          ? 'border-destructive-subtle-foreground/30 bg-destructive-subtle'
          : ''
      }`}
    >
      <ActionAccordionHeader className="px-4">
        <ActionAccordionTrigger className="hover:no-underline">
          <VariantItemHeader
            variant={displayVariant ?? variant}
            isValid={effectiveIsValid}
            type={type}
          />
        </ActionAccordionTrigger>
        {type !== 'boolean' && (
          <ActionAccordionActions>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              className="h-7 w-7 text-destructive-subtle-foreground hover:text-destructive-subtle-foreground shrink-0"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </ActionAccordionActions>
        )}
      </ActionAccordionHeader>

      <ActionAccordionContent className="px-4">
        <Suspense
          fallback={
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                <div className="h-10 bg-muted animate-pulse rounded" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-10 bg-muted animate-pulse rounded" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                <div className="h-32 bg-muted animate-pulse rounded" />
              </div>
            </div>
          }
        >
          <VariantForm
            variant={variant}
            type={type}
            onLiveChange={setDisplayVariant}
            onChange={handleUpdate}
            onValidationChange={setIsValid}
          />
        </Suspense>
      </ActionAccordionContent>
    </ActionAccordionItem>
  );
}
