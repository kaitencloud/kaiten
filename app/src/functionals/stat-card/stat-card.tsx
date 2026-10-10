import { Card } from '@/components/ui/card';
import {
  type ComponentProps,
  createContext,
  type PropsWithChildren,
  use,
} from 'react';
import { cn } from '@/lib/utils';

// Density is a property of a whole row: a `dense` row makes every card in it
// dense, so a page never passes the flag card by card. A card outside a row
// takes its own `dense` prop.
const DenseContext = createContext(false);

const useDense = () => use(DenseContext);

type StatCardRowProps = PropsWithChildren<{
  className?: string;
  columnsClassName?: string;
  dense?: boolean;
}>;

/**
 * A row of figures. Each card spans five tracks of the row's grid (label, two
 * values, two helper lines) and lays its parts out on them as a subgrid, so
 * the labels, the values and the helpers each sit on one line across the row,
 * whatever their neighbours wrap to or leave out.
 *
 * Two columns from `md`, four from `xl`: a label needs room to stay on one
 * line, and a page has four figures at most. A row with more, or fewer,
 * passes its own `columnsClassName`.
 */
const Row = ({
  className,
  columnsClassName = 'md:grid-cols-2 xl:grid-cols-4',
  dense = false,
  children,
}: StatCardRowProps) => (
  <DenseContext value={dense}>
    {/* A block formatting context of its own: the grid's negative bottom
        margin shortens this box instead of collapsing through it, so the
        row's outer spacing stays the page's (a `space-y-*`, a `mt-*`). */}
    <div className="flow-root">
      <div
        data-slot="stat-card-row"
        className={cn(
          // Two abreast on a phone: six full-width cards pushed every list
          // under the fold.
          'grid grid-cols-2 *:row-span-5 *:grid-rows-subgrid',
          // No row gap: the cards' subgrids share the row's tracks, so a row
          // gap would open between a card's own parts too. Each card keeps
          // its distance to the line below with a bottom margin instead,
          // which the grid takes back under its last line.
          dense
            ? 'gap-x-2 -mb-2 *:mb-2 md:gap-x-3 md:-mb-3 md:*:mb-3'
            : 'gap-x-3 -mb-3 *:mb-3 md:gap-x-4 md:-mb-4 md:*:mb-4 lg:gap-x-6 lg:-mb-6 lg:*:mb-6',
          columnsClassName,
          className,
        )}
      >
        {children}
      </div>
    </div>
  </DenseContext>
);

type StatCardRootProps = Omit<ComponentProps<typeof Card>, 'children'> &
  PropsWithChildren<{
    dense?: boolean;
  }>;

// What a card is given besides its look (a test id, a title, an aria attribute)
// goes to the card itself, so that a page can address one figure of a row.
const Root = ({ className, dense, children, ...props }: StatCardRootProps) => {
  const rowDense = useDense();
  const isDense = dense ?? rowDense;

  return (
    <DenseContext value={isDense}>
      <Card
        {...props}
        data-slot="stat-card"
        data-dense={isDense || undefined}
        className={cn(
          // The row's gap separates the cards, not the parts of one card: the
          // parts space themselves.
          'grid grid-cols-[minmax(0,1fr)_auto] content-start gap-x-3 gap-y-0',
          isDense ? 'px-3 py-2.5 md:px-4 md:py-3' : 'px-4 py-3 md:px-6 md:py-4',
          className,
        )}
      >
        {children}
      </Card>
    </DenseContext>
  );
};

type StatCardPartProps = PropsWithChildren<{ className?: string }>;

const Label = ({ className, children }: StatCardPartProps) => {
  const dense = useDense();

  return (
    <div
      data-slot="stat-card-label"
      className={cn(
        'col-start-1 row-start-1 min-w-0 text-muted-foreground',
        // The line height after the size: tailwind-merge drops a `leading-*`
        // that a later font size overrides.
        dense ? 'text-xs md:text-sm' : 'text-sm md:text-base',
        'leading-snug md:leading-snug',
        className,
      )}
    >
      {children}
    </div>
  );
};

// Takes a Lucide icon as its child; the icon draws in `currentColor`, so a
// tone goes on the slot's `className`.
const Icon = ({ className, children }: StatCardPartProps) => {
  const dense = useDense();

  return (
    <div
      data-slot="stat-card-icon"
      className={cn(
        'col-start-2 row-start-1 text-muted-foreground [&_svg]:shrink-0',
        dense
          ? 'mt-0.5 [&_svg]:size-3.5 md:[&_svg]:size-4'
          : 'mt-1 [&_svg]:size-4',
        className,
      )}
    >
      {children}
    </div>
  );
};

// Pinned to the bottom of its track: when labels wrap to different heights,
// the values still share one baseline. A card takes two at most, for two
// figures that weigh the same ("2 near limit", "1 limit reached"): the second
// sits right under the first, at the same size.
const Value = ({ className, children }: StatCardPartProps) => {
  const dense = useDense();

  return (
    <div
      data-slot="stat-card-value"
      className={cn(
        'col-span-full flex items-baseline gap-1.5 self-end font-semibold',
        // The size's own line height: it gives the figure room above its
        // helper.
        dense
          ? 'pt-1.5 text-xl md:text-2xl [[data-slot=stat-card-value]+&]:pt-0.5'
          : 'pt-3 text-2xl md:text-3xl [[data-slot=stat-card-value]+&]:pt-1',
        className,
      )}
    >
      {children}
    </div>
  );
};

// What the figure counts, set after it in the value ("2 near limit"), so the
// number keeps the numeral type and the words read as its caption.
const Unit = ({ className, children }: StatCardPartProps) => {
  const dense = useDense();

  return (
    <span
      data-slot="stat-card-unit"
      className={cn(
        'font-medium text-muted-foreground',
        dense ? 'text-sm md:text-base' : 'text-base md:text-lg',
        className,
      )}
    >
      {children}
    </span>
  );
};

// One size and one line height for every helper, whatever a caller renders in
// it, so the row's helpers sit on one line. A card takes two at most: the row
// gives it two tracks for them.
const Helper = ({ className, children }: StatCardPartProps) => {
  const dense = useDense();

  return (
    <div
      data-slot="stat-card-helper"
      className={cn(
        'col-span-full min-w-0 text-xs leading-4 text-muted-foreground',
        dense
          ? 'pt-0.5 [[data-slot=stat-card-value]+&]:pt-1'
          : 'pt-0.5 [[data-slot=stat-card-value]+&]:pt-2',
        className,
      )}
    >
      {children}
    </div>
  );
};

export const StatCard = Object.assign(Root, {
  Row,
  Label,
  Icon,
  Value,
  Unit,
  Helper,
});
