// What a dialog needs to give the focus back to the control that opened it when the page was
// drawn again in between. A route dialog is opened by a link, and the navigation that opens or
// closes it renders the page again: the link the dialog remembers is gone, and the focus would
// fall to `<body>`. Nothing here is specific to a dialog component; the dialog primitive
// calls it (`components/ui/use-dialog-final-focus`) and the app switches the tracking on once
// (`main.tsx`).

/** What identifies a control, to find it again once the page has drawn a new one in its place. */
export type Opener = {
  href: string | null;
  label: string;
  tag: string;
};

// How long after a close the focus is watched, and how soon the title of the page is accepted
// when the control that opened the dialog is nowhere to be found.
const WATCH_MS = 800;
const TITLE_AFTER_MS = 100;

const DIALOG =
  '[data-slot="dialog-content"], [role="dialog"], [role="alertdialog"]';
const CONTROL = 'a[href], button, [role="button"], [role="menuitem"]';

const isFocusLost = () => {
  const active = document.activeElement;

  return (
    !active || active === document.body || active === document.documentElement
  );
};

const labelOf = (element: HTMLElement) =>
  (element.getAttribute('aria-label') ?? element.textContent ?? '').trim();

function describe(element: Element | null): Opener | null {
  if (
    !(element instanceof HTMLElement) ||
    element === document.body ||
    element.closest(DIALOG)
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
// does: when the dialog opens, the link that was clicked is gone and nothing holds the focus.
// So the control the person used last is noted as they use it, and believed until they use
// something else: how long the dialog takes to open (a request to a payment provider can take
// seconds) does not matter.
let lastUsed: Opener | null = null;
let stopTracking: (() => void) | null = null;

function noteUse(target: EventTarget | null) {
  if (!(target instanceof Element) || target.closest(DIALOG)) {
    return;
  }
  lastUsed = describe(target.closest(CONTROL));
}

/**
 * Starts noting the control the person used last, from a click or from the keyboard. It has to
 * run before the person acts, so the app calls it once when it starts; calling it again does
 * nothing. Returns the function that stops it.
 */
export function trackLastUsedControl(): () => void {
  if (stopTracking) {
    return stopTracking;
  }
  const onUse = (event: Event) => noteUse(event.target);
  document.addEventListener('focusin', onUse, true);
  document.addEventListener('pointerdown', onUse, true);
  stopTracking = () => {
    document.removeEventListener('focusin', onUse, true);
    document.removeEventListener('pointerdown', onUse, true);
    lastUsed = null;
    stopTracking = null;
  };

  return stopTracking;
}

/**
 * What opened the dialog that is opening now, before the focus moves into it: what holds the
 * focus, or else the control the person used last.
 */
export function captureOpener(): Opener | null {
  return describe(document.activeElement) ?? lastUsed;
}

const isUsable = (element: HTMLElement) =>
  !element.closest(DIALOG) &&
  !element.hasAttribute('disabled') &&
  element.getClientRects().length > 0;

/** The control on the page that looks like `opener`: same tag, same address, same name. */
export function findOpener(opener: Opener | null): HTMLElement | null {
  if (!opener) {
    return null;
  }
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(opener.tag.toLowerCase()),
  );

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
export function findTitle(): HTMLElement | null {
  const title =
    document.querySelector<HTMLElement>('main h1') ??
    document.querySelector<HTMLElement>('h1');
  if (title && !title.hasAttribute('tabindex')) {
    title.setAttribute('tabindex', '-1');
  }

  return title;
}

/**
 * Watches the focus for a moment after a dialog closed, and puts it back when it is lost. The
 * control that looks like the opener is found again; when there is none, the page's title takes
 * the focus. A person who pressed a key or clicked since keeps the focus where they put it.
 */
export function keepFocusAfterClose(opener: Opener | null) {
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
      (
        findOpener(opener) ?? (elapsed > TITLE_AFTER_MS ? findTitle() : null)
      )?.focus();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
