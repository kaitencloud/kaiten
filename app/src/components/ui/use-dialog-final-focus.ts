import { useRef } from 'react';

type FinalFocus =
  | boolean
  | { current: HTMLElement | null }
  | ((closeType: '' | 'mouse' | 'touch' | 'pen' | 'keyboard') => boolean | HTMLElement | null | void);

// What identifies the control a dialog was opened from, to find it again once the page has drawn
// a new one in its place: a route dialog is opened by a link, and the navigation that closes it
// renders the page again.
type Opener = {
  href: string | null;
  label: string;
  tag: string;
};

// How long after a close the focus is watched, and how soon the title of the page is accepted
// when the control that opened the dialog is nowhere to be found.
const WATCH_MS = 800;
const TITLE_AFTER_MS = 100;

const isFocusLost = () => {
  const active = document.activeElement;

  return !active || active === document.body || active === document.documentElement;
};

const labelOf = (element: HTMLElement) =>
  (element.getAttribute('aria-label') ?? element.textContent ?? '').trim();

function describe(element: Element | null): Opener | null {
  if (
    !(element instanceof HTMLElement) ||
    element === document.body ||
    element.closest('[data-slot="dialog-content"], [role="dialog"], [role="alertdialog"]')
  ) {
    return null;
  }

  return {
    href: element.getAttribute('href'),
    label: labelOf(element),
    tag: element.tagName,
  };
}

// A route dialog is opened by a link, and the navigation draws the page again before the dialog
// does: when the dialog opens, the link that was clicked is gone and nothing holds the focus. So
// the control the person last used is noted as they use it, and believed for a moment.
const LAST_USE_MS = 1500;
let lastUsed: { at: number; opener: Opener } | null = null;

function noteUse(target: EventTarget | null) {
  const control =
    target instanceof Element
      ? target.closest('a[href], button, [role="button"], [role="menuitem"]')
      : null;
  const opener = describe(control);
  if (opener) {
    lastUsed = { at: performance.now(), opener };
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (event) => noteUse(event.target), true);
  document.addEventListener('pointerdown', (event) => noteUse(event.target), true);
}

function captureOpener(): Opener | null {
  return (
    describe(document.activeElement) ??
    (lastUsed && performance.now() - lastUsed.at < LAST_USE_MS ? lastUsed.opener : null)
  );
}

const isUsable = (element: HTMLElement) =>
  !element.closest('[data-slot="dialog-content"], [role="dialog"], [role="alertdialog"]') &&
  !element.hasAttribute('disabled') &&
  element.getClientRects().length > 0;

function findOpener(opener: Opener | null): HTMLElement | null {
  if (!opener) {
    return null;
  }
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(opener.tag.toLowerCase()));

  return (
    candidates.find(
      (element) =>
        isUsable(element) &&
        element.getAttribute('href') === opener.href &&
        labelOf(element) === opener.label,
    ) ?? null
  );
}

// The title of the page, which takes the focus when what opened the dialog is gone: a client
// that was just created, an invoice whose action is done.
function findTitle(): HTMLElement | null {
  const title = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('h1');
  if (title && !title.hasAttribute('tabindex')) {
    title.setAttribute('tabindex', '-1');
  }

  return title;
}

/**
 * Watches the focus for a moment after a dialog closed, and puts it back when it is lost. The
 * dialog gives the focus back to what opened it, but a route dialog is opened by a link and the
 * navigation that closes it draws the page again: the link it remembers is gone and the focus
 * falls to `<body>`. The control that looks like the opener is found again; when there is none,
 * the page's title takes the focus. A person who pressed a key or clicked since keeps the focus
 * where they put it.
 */
function keepFocusAfterClose(opener: Opener | null) {
  const start = performance.now();
  let acted = false;
  const onAct = () => {
    acted = true;
  };
  window.addEventListener('keydown', onAct, { capture: true, once: true });
  window.addEventListener('pointerdown', onAct, { capture: true, once: true });

  const tick = () => {
    const elapsed = performance.now() - start;
    if (acted || elapsed > WATCH_MS) {
      window.removeEventListener('keydown', onAct, { capture: true });
      window.removeEventListener('pointerdown', onAct, { capture: true });

      return;
    }
    if (isFocusLost()) {
      (findOpener(opener) ?? (elapsed > TITLE_AFTER_MS ? findTitle() : null))?.focus();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * The `finalFocus` of a dialog: what the caller asked for, or the dialog's own return of the
 * focus, kept from being lost (see `keepFocusAfterClose`). `rememberOpener` is called when the
 * dialog opens, before the focus moves into it: what holds the focus then is what opened it.
 */
export function useDialogFinalFocus(finalFocus?: FinalFocus) {
  const opener = useRef<Opener | null>(null);

  return {
    finalFocus:
      finalFocus ??
      (() => {
        keepFocusAfterClose(opener.current);

        return true;
      }),
    rememberOpener: () => {
      opener.current = captureOpener();
    },
  };
}
