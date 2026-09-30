import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  FILTER_OPERATOR_LABELS,
  getDefaultOperatorForFieldType,
} from '../../logic/filter-logic';
import type { FilterToolbarQuickAccessFiltersProps } from '../../types/toolbar.types';
import { NormalFilterPopover } from '../shared/filter-toolbar-normal-filter-popover';
import { getFilterBadgeLabel } from '../shared';
import { useFilterToolbarContext } from './filter-toolbar-provider';

export function FilterToolbarQuickAccessFilters({
  className,
}: FilterToolbarQuickAccessFiltersProps) {
  const {
    controller,
    labels: copy,
    showFilterRow,
    openNormalFilterId,
    setOpenNormalFilterId,
  } = useFilterToolbarContext<unknown>();

  if (controller.normal.quickAccessFields.length === 0) {
    return null;
  }

  function renderQuickAccessField(
    field: (typeof controller.normal.quickAccessFields)[number],
  ) {
    const value = controller.normal.values[field.id] ?? '';
    const operatorLabel =
      FILTER_OPERATOR_LABELS[getDefaultOperatorForFieldType(field.type)];
    const badgeLabel = getFilterBadgeLabel(field, value, copy);

    return (
      <NormalFilterPopover
        key={field.id}
        field={field}
        labels={copy}
        open={openNormalFilterId === field.id}
        onOpenChange={(open) => setOpenNormalFilterId(open ? field.id : null)}
        onValueChange={(nextValue) => {
          controller.normal.setValue(field.id, nextValue);
        }}
        onClear={() => controller.normal.setValue(field.id, '')}
        operatorLabel={operatorLabel}
        value={value}
        trigger={
          <button
            type="button"
            className="bg-secondary text-secondary-foreground inline-flex h-9 max-w-full items-center rounded-full border border-border px-3 text-sm"
            title={badgeLabel}
          >
            {/* A long value (a webhook URL) is cut short here and reads in
                full in the title, so the chip never runs off the toolbar. */}
            <span className="max-w-80 truncate">{badgeLabel}</span>
          </button>
        }
      />
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {controller.normal.quickAccessFields.map(renderQuickAccessField)}

      {!showFilterRow && controller.hasActiveFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={controller.resetAll}
        >
          <RotateCcw className="size-4" />
          {copy.reset}
        </Button>
      ) : null}
    </div>
  );
}
