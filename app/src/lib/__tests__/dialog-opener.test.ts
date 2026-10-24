import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  captureOpener,
  findOpener,
  findTitle,
  keepFocusAfterClose,
  trackLastUsedControl,
} from '../dialog-opener';

// jsdom lays nothing out: every element has no box, which the lookup reads as "not shown".
function shown() {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    {},
  ] as unknown as DOMRectList);
}

function page(html: string) {
  document.body.innerHTML = html;
}

const link = (name: string) =>
  [...document.querySelectorAll('a')].find((a) => a.textContent === name) as HTMLAnchorElement;

function pointerDown(target: Element) {
  target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
}

/** One frame of the watch, 16 ms later. */
const frame = (ms = 16) => vi.advanceTimersByTime(ms);

describe('findOpener', () => {
  beforeEach(shown);
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('finds the control again once the page drew another one in its place', () => {
    page('<a href="/customers/new">New Customer</a>');
    const opener = captureOpenerOf(link('New Customer'));

    page('<main><a href="/customers/new">New Customer</a></main>');

    expect(findOpener(opener)).toBe(link('New Customer'));
  });

  it('does not take a control with another address or another name', () => {
    page('<a href="/customers/new">New Customer</a>');
    const opener = captureOpenerOf(link('New Customer'));

    page('<a href="/instances/new">New Customer</a><a href="/customers/new">Add customer</a>');

    expect(findOpener(opener)).toBeNull();
  });

  it('does not take a control that is disabled or inside a dialog', () => {
    page('<button>Add</button>');
    const opener = captureOpenerOf(document.querySelector('button'));

    page('<button disabled>Add</button><div role="dialog"><button>Add</button></div>');

    expect(findOpener(opener)).toBeNull();
  });

  it('finds nothing for no opener', () => {
    expect(findOpener(null)).toBeNull();
  });
});

describe('findTitle', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('takes the title of the main content and lets it hold the focus', () => {
    page('<h1>Shell</h1><main><h1>Acme Corp</h1></main>');

    const title = findTitle();

    expect(title?.textContent).toBe('Acme Corp');
    expect(title).toHaveAttribute('tabindex', '-1');
  });

  it('keeps a tabindex the title already has', () => {
    page('<h1 tabindex="0">Acme Corp</h1>');

    expect(findTitle()).toHaveAttribute('tabindex', '0');
  });
});

describe('trackLastUsedControl', () => {
  let stop: () => void;

  beforeEach(() => {
    stop = trackLastUsedControl();
  });
  afterEach(() => {
    stop();
    document.body.innerHTML = '';
  });

  it('notes the control that was clicked, however late the dialog opens', () => {
    vi.useFakeTimers();
    page('<button>Add a payment method</button>');
    pointerDown(document.querySelector('button') as HTMLElement);

    // The button greyed out while its request was out, and the dialog opens seconds later.
    page('<button disabled>Add a payment method</button>');
    vi.advanceTimersByTime(10_000);

    expect(captureOpener()).toEqual({
      href: null,
      label: 'Add a payment method',
      tag: 'BUTTON',
    });
    vi.useRealTimers();
  });

  it('forgets it when the person used something else, a field or the page', () => {
    page('<button>Add</button><input aria-label="Name" /><p>Text</p>');
    pointerDown(document.querySelector('button') as HTMLElement);
    pointerDown(document.querySelector('p') as HTMLElement);

    expect(captureOpener()).toBeNull();
  });

  it('is not moved by what happens inside a dialog', () => {
    page('<a href="/customers/new">New Customer</a><div role="dialog"><button>Save</button></div>');
    pointerDown(link('New Customer'));
    pointerDown(document.querySelector('[role="dialog"] button') as HTMLElement);

    expect(captureOpener()?.label).toBe('New Customer');
  });

  it('takes a field that holds the focus as what opened the dialog', () => {
    page('<input aria-label="Name" />');
    (document.querySelector('input') as HTMLInputElement).focus();

    expect(captureOpener()).toEqual({ href: null, label: 'Name', tag: 'INPUT' });
  });

  it('forgets it when the focus reaches a field', () => {
    page('<button>Add</button><input aria-label="Name" />');
    pointerDown(document.querySelector('button') as HTMLElement);
    const input = document.querySelector('input') as HTMLInputElement;
    input.focus();
    input.blur();

    expect(captureOpener()).toBeNull();
  });

  it('takes the control used last when what holds the focus is not a control', () => {
    page('<a href="/customers/new">New Customer</a><main tabindex="-1">List</main>');
    pointerDown(link('New Customer'));
    (document.querySelector('main') as HTMLElement).focus();

    expect(captureOpener()?.label).toBe('New Customer');
  });

  it('prefers what holds the focus to what was used before', () => {
    page('<a href="/a">First</a><button>Second</button>');
    pointerDown(link('First'));
    document.querySelector('button')?.focus();

    expect(captureOpener()?.label).toBe('Second');
  });

  it('starts only once, and stopping forgets the control', () => {
    expect(trackLastUsedControl()).toBe(stop);
    page('<button>Add</button>');
    pointerDown(document.querySelector('button') as HTMLElement);
    stop();

    expect(captureOpener()).toBeNull();
  });
});

describe('keepFocusAfterClose', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
    });
    shown();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('gives the focus to the opener the page drew again', () => {
    page('<a href="/customers/new">New Customer</a>');
    const opener = captureOpenerOf(link('New Customer'));
    page('<main><h1>Customers</h1><a href="/customers/new">New Customer</a></main>');

    keepFocusAfterClose(opener);
    frame();

    expect(document.activeElement).toBe(link('New Customer'));
  });

  it('waits for the opener to be drawn, then takes it', () => {
    page('<button>Add</button>');
    const opener = captureOpenerOf(document.querySelector('button'));
    page('<main><h1>Customer</h1></main>');

    keepFocusAfterClose(opener);
    frame();
    expect(document.activeElement).toBe(document.body);

    page('<main><h1>Customer</h1><button>Add</button></main>');
    frame();
    expect(document.activeElement).toBe(document.querySelector('button'));
  });

  it('falls back to the title of the page once the opener is nowhere to be found', () => {
    page('<a href="/customers/new">New Customer</a>');
    const opener = captureOpenerOf(link('New Customer'));
    page('<main><h1>Acme Corp</h1></main>');

    keepFocusAfterClose(opener);
    frame(50);
    // The control may still be coming: the title is not taken at once.
    expect(document.activeElement).toBe(document.body);

    frame(100);
    expect(document.activeElement).toBe(document.querySelector('h1'));
  });

  it('moves from the title to the opener when a slow page draws it late', () => {
    page('<a href="/customers/new">New Customer</a>');
    const opener = captureOpenerOf(link('New Customer'));
    page('<main><h1>Customers</h1></main>');

    keepFocusAfterClose(opener);
    frame(200);
    expect(document.activeElement).toBe(document.querySelector('h1'));

    frame(1000);
    page('<main><h1>Customers</h1><a href="/customers/new">New Customer</a></main>');
    frame();
    expect(document.activeElement).toBe(link('New Customer'));
  });

  it('takes the title when it has no opener at all', () => {
    page('<main><h1>Acme Corp</h1></main>');

    keepFocusAfterClose(null);
    frame(200);

    expect(document.activeElement).toBe(document.querySelector('h1'));
  });

  it('leaves the focus to a person who acted since', () => {
    page('<main><h1>Acme Corp</h1><input aria-label="Search" /></main>');

    keepFocusAfterClose(null);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    frame(300);

    expect(document.activeElement).toBe(document.body);
  });

  it('leaves the focus where it is when it was not lost', () => {
    page('<main><h1>Acme Corp</h1><input aria-label="Search" /></main>');
    const input = document.querySelector('input') as HTMLInputElement;
    input.focus();

    keepFocusAfterClose(null);
    frame(300);

    expect(document.activeElement).toBe(input);
  });

  it('stops watching after a moment', () => {
    page('<main></main>');
    keepFocusAfterClose(null);
    frame(3000);

    page('<main><h1>Late</h1></main>');
    frame(100);

    expect(document.activeElement).toBe(document.body);
  });
});

// The control a dialog is opened from, as the dialog notes it when it opens.
function captureOpenerOf(element: Element | null) {
  (element as HTMLElement).focus();

  return captureOpener();
}
