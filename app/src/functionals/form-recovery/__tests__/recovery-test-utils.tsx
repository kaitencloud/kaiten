import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { vi } from 'vite-plus/test';
import en from '@/lib/i18n/locales/en';
import { testI18n } from '@/__tests__/test-i18n';
import {
  RecoveryDemoForm,
  type RecoveryDemoFormProps,
} from '../stories/recovery-demo-form';

/** The real English texts of the module, in the stub i18n of the tests. */
export function installRecoveryTranslations() {
  testI18n.addResourceBundle(
    'en',
    'translation',
    { Functionals: { FormRecovery: en.Functionals.FormRecovery } },
    true,
    true,
  );
}

export function setupUser() {
  return userEvent.setup({
    advanceTimers: (ms) => vi.advanceTimersByTime(ms),
  });
}

/** Lets the debounce of a second elapse, and the promises behind it settle. */
export async function elapse(ms = 1_100) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

export function mountDemo(
  props: RecoveryDemoFormProps = {},
  options: { strict?: boolean } = {},
) {
  const element = <RecoveryDemoForm {...props} />;
  return render(options.strict ? <StrictMode>{element}</StrictMode> : element);
}

export const input = (label: string) =>
  screen.getByLabelText(label) as HTMLInputElement;
