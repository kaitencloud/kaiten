import { ChevronDown, Columns3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useColumnChooser } from './column-chooser-context';

type DataTableColumnsButtonProps = {
  className?: string;
};

/**
 * The Columns button of a list's toolbar, beside its Filter button and drawn
 * like it: a menu with one checkbox per column the person may hide, named as
 * its header, and Reset, which shows every column again. It reads as set
 * (`secondary`) while a column is hidden. Renders nothing outside a layout
 * with a column chooser, or before its table has reported a column to choose.
 */
export function DataTableColumnsButton({
  className,
}: DataTableColumnsButtonProps) {
  const { t } = useTranslation();
  const chooser = useColumnChooser();

  if (!chooser || chooser.columns.length === 0) {
    return null;
  }

  const hiddenIds = new Set(chooser.hidden);
  const hiddenCount = chooser.columns.filter((column) =>
    hiddenIds.has(column.id),
  ).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant={hiddenCount > 0 ? 'secondary' : 'outline'}
            size="sm"
            className={cn('h-9 gap-2', className)}
            aria-label={
              hiddenCount > 0
                ? t('Functionals.TableColumns.buttonWithHidden', {
                    count: hiddenCount,
                  })
                : undefined
            }
          >
            <Columns3 className="size-4" aria-hidden />
            {t('Functionals.TableColumns.button')}
            <ChevronDown className="size-4 opacity-60" aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {t('Functionals.TableColumns.menuLabel')}
          </DropdownMenuLabel>
          {chooser.columns.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={!hiddenIds.has(column.id)}
              onCheckedChange={(checked) =>
                chooser.setColumnVisible(column.id, checked)
              }
            >
              <span className="truncate">{column.label}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={hiddenCount === 0} onClick={chooser.reset}>
          {t('Functionals.TableColumns.reset')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
