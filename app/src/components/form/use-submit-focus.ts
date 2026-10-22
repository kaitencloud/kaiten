import { useEffect, useLayoutEffect, useRef } from 'react';

type SubmitFocusState = {
  /** The button is disabled for whatever reason: submitting, invalid, pristine. */
  disabled: boolean;
  isSubmitting: boolean;
  isValidating: boolean;
  isValid: boolean;
};

// What takes the focus by itself, enabled.
const FOCUSABLE =
  'input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/**
 * Where the focus goes for an element that is marked invalid: the element itself when it
 * takes the focus, else the control inside it. A number field marks its group invalid as
 * well as its input, and the group, which comes first in the document, takes no focus.
 */
function focusTargetOf(element: HTMLElement) {
  return element.matches(FOCUSABLE)
    ? element
    : element.querySelector<HTMLElement>(FOCUSABLE);
}

/** The control of the first field the form shows an error on, in document order. */
function findFirstInvalidControl(form: HTMLFormElement | null) {
  for (const element of form?.querySelectorAll<HTMLElement>(
    '[aria-invalid="true"]',
  ) ?? []) {
    const target = focusTargetOf(element);
    if (target) {
      return target;
    }
  }

  return null;
}

/** Whether the person has been left with no place to type: nothing holds the focus. */
function isFocusLost(button: HTMLButtonElement) {
  const active = document.activeElement;
  return !active || active === document.body || active === button;
}

/**
 * Keeps the keyboard where it was when the submit button disables itself.
 *
 * The button is disabled while the form submits and stays disabled when the form ends up
 * invalid, and a disabled element cannot hold the focus: it falls to `<body>`, so the next Tab
 * starts from the top of the page and a screen reader says nothing about what went wrong. This
 * remembers that the button had the focus when it disabled itself and, once the form has
 * settled, puts the focus where the person can act: on the first field that shows an error, or
 * back on the button when the form is valid again. A person who moved the focus elsewhere in
 * the meantime keeps it there.
 */
export function useSubmitFocus(
  buttonRef: React.RefObject<HTMLButtonElement | null>,
  { disabled, isSubmitting, isValidating, isValid }: SubmitFocusState,
) {
  const hadFocus = useRef(false);

  // In the layout phase: the browser drops the focus from a disabled element on its next
  // rendering update, so the button is still the active element when this runs.
  useLayoutEffect(() => {
    const button = buttonRef.current;
    if (disabled && button && document.activeElement === button) {
      hadFocus.current = true;
    }
  }, [buttonRef, disabled]);

  useEffect(() => {
    if (!hadFocus.current || isSubmitting || isValidating) {
      return undefined;
    }

    // One frame later, so that the fields have drawn the errors the validation just produced
    // and the browser has finished with the focus of the disabled button.
    const frame = requestAnimationFrame(() => {
      const button = buttonRef.current;
      hadFocus.current = false;
      if (!button || !isFocusLost(button)) {
        return;
      }
      if (!isValid) {
        findFirstInvalidControl(button.form)?.focus();
      } else if (!button.disabled) {
        button.focus();
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [buttonRef, disabled, isSubmitting, isValidating, isValid]);
}
