import type {
  DataTablePaginationConfig,
  DataTablePaginationProp,
  DataTableVariant,
} from '../types/data-table.types';

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 50];
const MAX_VISIBLE_PAGE_BUTTONS = 5;

export const DATA_TABLE_VARIANT_CLASSES: Record<
  DataTableVariant,
  {
    body: string;
    cell: string;
    container: string;
    header: string;
    headerCell: string;
    headerRow: string;
    paginationContainer: string;
    row: string;
  }
> = {
  default: {
    container:
      'bg-background rounded-xl border border-border/70 overflow-hidden',
    header: 'bg-muted',
    headerRow: 'border-b border-border/80 bg-muted hover:bg-muted',
    headerCell:
      'h-11 border-b border-border/80 px-4 font-medium text-muted-foreground/95 first:pl-6 last:pr-6',
    body: '[&_tr]:bg-background',
    row: 'border-b border-border/60 bg-background hover:bg-muted/10',
    cell: 'px-4 py-3 first:pl-6 last:pr-6',
    paginationContainer:
      'border-t border-border/70 bg-muted/5 px-6 pt-2 shrink-0',
  },
  simple: {
    container: 'bg-transparent border-0 rounded-none overflow-hidden',
    header: 'bg-transparent',
    headerRow: 'border-b border-border/60 bg-transparent hover:bg-transparent',
    headerCell:
      'h-10 border-b border-border/60 px-4 font-medium text-muted-foreground/95 first:pl-6 last:pr-6',
    body: '[&_tr]:bg-transparent',
    row: 'border-b border-border/50 bg-transparent hover:bg-muted/5',
    cell: 'px-4 py-2 first:pl-6 last:pr-6',
    paginationContainer:
      'border-t border-border/60 bg-transparent px-6 pt-2 shrink-0',
  },
};

function normalizePositiveInteger(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.floor(value);
}

export function resolvePaginationConfig(
  pagination: DataTablePaginationProp,
): Required<DataTablePaginationConfig> {
  if (pagination === false) {
    return {
      enabled: false,
      defaultPageSize: DEFAULT_PAGE_SIZE,
      pageSizeOptions: DEFAULT_PAGE_SIZE_OPTIONS,
      showPageSizeSelector: false,
    };
  }

  if (pagination === true || pagination === undefined) {
    return {
      enabled: true,
      defaultPageSize: DEFAULT_PAGE_SIZE,
      pageSizeOptions: DEFAULT_PAGE_SIZE_OPTIONS,
      showPageSizeSelector: true,
    };
  }

  const defaultPageSize =
    normalizePositiveInteger(pagination.defaultPageSize ?? DEFAULT_PAGE_SIZE) ??
    DEFAULT_PAGE_SIZE;

  const pageSizeOptions = [
    ...new Set([
      ...DEFAULT_PAGE_SIZE_OPTIONS,
      ...(pagination.pageSizeOptions ?? []),
      defaultPageSize,
    ]),
  ]
    .map((option) => normalizePositiveInteger(option))
    .filter((option): option is number => option !== null)
    .sort((left, right) => left - right);

  return {
    enabled: pagination.enabled ?? true,
    defaultPageSize,
    pageSizeOptions:
      pageSizeOptions.length > 0 ? pageSizeOptions : DEFAULT_PAGE_SIZE_OPTIONS,
    showPageSizeSelector: pagination.showPageSizeSelector ?? true,
  };
}

export function buildVisiblePageIndexes(
  currentPageIndex: number,
  pageCount: number,
) {
  if (pageCount <= MAX_VISIBLE_PAGE_BUTTONS) {
    return Array.from({ length: pageCount }, (_, index) => index);
  }

  const halfWindow = Math.floor(MAX_VISIBLE_PAGE_BUTTONS / 2);
  let start = Math.max(0, currentPageIndex - halfWindow);
  const maxStart = pageCount - MAX_VISIBLE_PAGE_BUTTONS;
  start = Math.min(start, maxStart);

  return Array.from(
    { length: MAX_VISIBLE_PAGE_BUTTONS },
    (_, index) => start + index,
  );
}
