import { type CellRef, formatCell } from './rate-card-model';

type Box = { left: number; right: number; top: number; bottom: number };

/**
 * How far a scroller has to move for a cell to be fully in view, given what
 * stays put over its content: the first column on the left, the head on top.
 * Zero on an axis where the cell is already clear of them. A cell wider or
 * taller than the room left is aligned on its start.
 */
export function revealOffset(
  cell: Box,
  scroller: Box,
  pinned: { left: number; top: number },
): { x: number; y: number } {
  const axis = (start: number, end: number, from: number, to: number) => {
    if (start < from || end - start > to - from) {
      return start - from;
    }

    return end > to ? end - to : 0;
  };

  return {
    x: axis(cell.left, cell.right, scroller.left + pinned.left, scroller.right),
    y: axis(cell.top, cell.bottom, scroller.top + pinned.top, scroller.bottom),
  };
}

/** The part of the scroller a panel laid over it leaves in sight. */
function visibleBox(scroller: HTMLElement, panel?: HTMLElement | null): Box {
  const box = scroller.getBoundingClientRect();
  if (!panel || getComputedStyle(panel).position !== 'fixed') {
    return box;
  }
  const over = panel.getBoundingClientRect();
  const covers = over.left < box.right && over.right > box.left;

  return {
    bottom: box.bottom,
    left: box.left,
    right: covers ? Math.min(box.right, over.left) : box.right,
    top: box.top,
  };
}

function findCell(cell: CellRef) {
  return document.querySelector<HTMLElement>(
    `[data-cell="${CSS.escape(formatCell(cell))}"]`,
  );
}

/**
 * Brings the cell of the open panel into view inside the grid's own scroller,
 * clear of the pinned first column and head. The panel takes room from the
 * grid when it opens, and a cell of a far column would otherwise end up out of
 * sight: the page itself never scrolls sideways for it. On a narrow screen the
 * panel is laid over the right of the grid instead: what it covers does not
 * count as in view.
 */
export function revealCell(cell: CellRef, panel?: HTMLElement | null) {
  const button = findCell(cell);
  const scroller = button?.closest<HTMLElement>(
    '[data-slot="table-container"]',
  );
  const corner = scroller?.querySelector<HTMLElement>('thead th');
  const head = scroller?.querySelector<HTMLElement>('thead');
  const target = button?.closest<HTMLElement>('td, th');
  if (!scroller || !corner || !head || !target) {
    return;
  }
  // A wildcard cell sits in the pinned head: only its column can be off view.
  const inHead = head.contains(target);
  const offset = revealOffset(
    target.getBoundingClientRect(),
    visibleBox(scroller, panel),
    {
      left: corner.getBoundingClientRect().width,
      top: inHead ? 0 : head.getBoundingClientRect().height,
    },
  );
  scroller.scrollLeft += offset.x;
  if (!inHead) {
    scroller.scrollTop += offset.y;
  }
}

export function focusCell(cell: CellRef) {
  requestAnimationFrame(() => findCell(cell)?.focus());
}
