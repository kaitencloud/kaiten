import type {
  ByRoleMatcher,
  ByRoleOptions,
  Matcher,
  SelectorMatcherOptions,
} from '@testing-library/dom';
import { expect, waitFor, within } from 'storybook/test';

function isVisible(element: HTMLElement) {
  try {
    expect(element).toBeVisible();
    return true;
  } catch {
    return false;
  }
}

export async function findVisibleByRole(
  container: HTMLElement,
  role: ByRoleMatcher,
  options?: ByRoleOptions,
) {
  let visible: HTMLElement | undefined;

  await waitFor(() => {
    visible = within(container)
      .getAllByRole(role, options)
      .find((element) => isVisible(element));

    expect(visible).toBeDefined();
  });

  return visible as HTMLElement;
}

export async function findVisibleByText(
  container: HTMLElement,
  text: Matcher,
  options?: SelectorMatcherOptions,
) {
  let visible: HTMLElement | undefined;

  await waitFor(() => {
    visible = within(container)
      .getAllByText(text, options)
      .find((element) => isVisible(element));

    expect(visible).toBeDefined();
  });

  return visible as HTMLElement;
}
