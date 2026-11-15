import { ChevronDown, Pin } from 'lucide-react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiUsage, Model } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { AiRequestType } from './engine';
import { ModelCell } from './rate-card-cell';
import { ModelHeader, VersionHeader } from './rate-card-headers';
import {
  type CellRef,
  isSameCell,
  type RateCardVersion,
  type VendorGroup,
} from './rate-card-model';
import { WildcardCell } from './rate-card-wildcard-cell';

export type RateCardGridProps = {
  /** Vendors whose models are folded away. */
  collapsed: ReadonlySet<string>;
  creditValue: string | null;
  /** What the body says when no model is left to show. */
  emptyMessage: string;
  /** A version a link pointed at: its column is marked. */
  focusVersion?: string;
  groups: readonly VendorGroup[];
  /** The whole catalogue, for what the wildcards cover. */
  models: readonly Model[];
  onSelect: (cell: CellRef) => void;
  onToggleVendor: (vendor: string) => void;
  /** The pool's name, for what the column heads say of its grants. */
  poolName: string;
  reference: AiUsage;
  selected: CellRef | null;
  type: AiRequestType;
  versions: readonly RateCardVersion[];
};

// Borders are drawn by the cells: a collapsed border does not travel with a
// sticky cell. The first column and the head stay put while the grid scrolls.
const CELL =
  'border-r border-b border-border bg-card p-0 align-top last:border-r-0';
const FIRST_COLUMN = 'sticky left-0 w-62 min-w-62 max-w-62 whitespace-normal';
const ROW = 'border-0 hover:bg-transparent';

/**
 * The rate card: one row per model, grouped by vendor, one column per licence
 * version, with the wildcards of each version pinned under the head. A plain
 * table, so that a screen reader announces the model and the version of a cell.
 */
export function RateCardGrid(props: RateCardGridProps) {
  const { t } = useTranslation();
  const { groups, versions } = props;
  const columns = versions.length + 1;

  function renderVersionHead(version: RateCardVersion) {
    return (
      <TableHead
        aria-description={
          props.focusVersion === version.slug
            ? t('AI.Pricing.grid.opened')
            : undefined
        }
        className={cn(
          CELL,
          'h-auto min-w-44 px-3 py-2.5 whitespace-normal',
          props.focusVersion === version.slug &&
            'shadow-[inset_0_3px_0_var(--primary)]',
        )}
        key={version.slug}
        scope="col"
      >
        <VersionHeader poolName={props.poolName} version={version} />
      </TableHead>
    );
  }

  function renderWildcard(version: RateCardVersion) {
    return (
      <TableCell
        className={cn(CELL, 'bg-secondary whitespace-normal')}
        key={version.slug}
      >
        <WildcardCell
          models={props.models}
          onSelect={props.onSelect}
          reference={props.reference}
          selected={isSameCell(props.selected, {
            licenseSlug: version.slug,
            modelSlug: null,
          })}
          type={props.type}
          version={version}
        />
      </TableCell>
    );
  }

  function renderModel(model: Model) {
    return (
      <TableRow className={ROW} key={model.slug}>
        <TableHead
          className={cn(CELL, FIRST_COLUMN, 'z-10 h-auto px-3 py-2')}
          scope="row"
        >
          <ModelHeader model={model} reference={props.reference} />
        </TableHead>
        {versions.map((version) => (
          <TableCell
            className={cn(CELL, 'whitespace-normal')}
            key={version.slug}
          >
            <ModelCell
              creditValue={props.creditValue}
              model={model}
              onSelect={props.onSelect}
              reference={props.reference}
              selected={isSameCell(props.selected, {
                licenseSlug: version.slug,
                modelSlug: model.slug,
              })}
              type={props.type}
              version={version}
            />
          </TableCell>
        ))}
      </TableRow>
    );
  }

  function renderGroup(group: VendorGroup) {
    const open = !props.collapsed.has(group.vendor);

    return (
      <Fragment key={group.vendor}>
        <TableRow className={ROW}>
          <TableHead
            className="h-auto border-b border-border bg-app-background p-0"
            colSpan={columns}
            scope="rowgroup"
          >
            <Button
              aria-expanded={open}
              className="sticky left-0 h-8 justify-start gap-2 rounded-none px-3 text-xs font-semibold text-muted-foreground focus-visible:ring-inset"
              onClick={() => props.onToggleVendor(group.vendor)}
              type="button"
              variant="ghost"
            >
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  'size-3.5 transition-transform motion-reduce:transition-none',
                  !open && '-rotate-90',
                )}
              />
              {t('AI.Pricing.grid.vendorGroup', {
                count: group.models.length,
                vendor: group.vendor,
              })}
            </Button>
          </TableHead>
        </TableRow>
        {open ? group.models.map(renderModel) : null}
      </Fragment>
    );
  }

  return (
    <Table
      aria-label={t('AI.Pricing.grid.region')}
      className="w-full border-separate border-spacing-0 text-[0.8125rem]"
      containerClassName="max-h-[calc(100dvh-9rem)] min-h-64 overflow-auto rounded-xl border bg-card"
    >
      <TableHeader className="sticky top-0 z-30 [&_tr]:border-0">
        <TableRow className={ROW}>
          <TableHead
            className={cn(
              CELL,
              FIRST_COLUMN,
              'z-40 h-auto px-3 py-2.5 align-bottom font-normal text-muted-foreground',
            )}
            scope="col"
          >
            <span className="font-medium text-foreground">
              {t('AI.Pricing.grid.corner')}
            </span>{' '}
            <span className="text-xs">· {t('AI.Pricing.grid.cornerHint')}</span>
          </TableHead>
          {versions.map(renderVersionHead)}
        </TableRow>
        <TableRow className={cn(ROW, 'shadow-[0_3px_6px_-4px_rgb(0_0_0/0.2)]')}>
          <TableHead
            className={cn(
              CELL,
              FIRST_COLUMN,
              'z-40 h-auto bg-secondary px-3 py-2',
            )}
            scope="row"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Pin aria-hidden="true" className="size-3.5" />
              {t('AI.Pricing.grid.anyModel')}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {t('AI.Pricing.grid.anyModelHint')}
            </span>
          </TableHead>
          {versions.map(renderWildcard)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.length === 0 ? (
          <TableRow className={ROW}>
            <TableCell
              className="p-6 text-center whitespace-normal text-muted-foreground"
              colSpan={columns}
            >
              {props.emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          groups.map(renderGroup)
        )}
      </TableBody>
    </Table>
  );
}
