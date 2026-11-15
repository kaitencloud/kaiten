import { describe, expect, it } from 'vite-plus/test';
import { revealOffset } from '../reveal-cell';

const scroller = { left: 100, right: 900, top: 50, bottom: 650 };
const pinned = { left: 248, top: 120 };

describe('revealOffset', () => {
  it('moves nothing for a cell already clear of the first column and the head', () => {
    expect(revealOffset({ left: 400, right: 580, top: 200, bottom: 280 }, scroller, pinned)).toEqual({ x: 0, y: 0 });
  });

  it('scrolls right for a cell past the right edge, just enough', () => {
    expect(revealOffset({ left: 850, right: 1030, top: 200, bottom: 280 }, scroller, pinned).x).toBe(130);
  });

  it('scrolls left for a cell under the pinned first column', () => {
    expect(revealOffset({ left: 300, right: 480, top: 200, bottom: 280 }, scroller, pinned).x).toBe(-48);
  });

  it('scrolls up for a cell under the pinned head, down for one below the fold', () => {
    expect(revealOffset({ left: 400, right: 580, top: 100, bottom: 180 }, scroller, pinned).y).toBe(-70);
    expect(revealOffset({ left: 400, right: 580, top: 600, bottom: 700 }, scroller, pinned).y).toBe(50);
  });

  it('aligns a cell wider than the room left on its start', () => {
    expect(revealOffset({ left: 500, right: 1200, top: 200, bottom: 280 }, scroller, pinned).x).toBe(152);
  });
});
