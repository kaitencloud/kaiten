import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { formRecoveryCollectionExists } from '@/lib/form-recovery';
import { useFormRecovery } from '..';
import { installRecoveryTranslations } from './recovery-test-utils';
import { demoDefaults, demoRecovery } from '../stories/recovery-demo-form';

vi.mock('sonner', () => ({ toast: vi.fn() }));

beforeEach(() => {
  installRecoveryTranslations();
  vi.stubEnv('VITE_E2E_BYPASS_AUTH', 'true');
});

afterEach(() => {
  vi.unstubAllEnvs();
  document.body.innerHTML = '';
});

type DemoOptions = { enabled?: boolean };

function mount(options: DemoOptions = {}) {
  return renderHook(
    (props: { pristine: ReturnType<typeof demoDefaults> }) =>
      useFormRecovery(demoRecovery, {
        enabled: true,
        pristine: props.pristine,
        ...options,
      }),
    { initialProps: { pristine: demoDefaults() } },
  );
}

describe('useFormRecovery', () => {
  it('freezes the initial values at the first render', () => {
    const first = demoDefaults();
    const { result, rerender } = mount();

    const frozen = result.current.pristine;
    rerender({ pristine: { ...first, name: 'moved under our feet' } });

    expect(result.current.pristine).toBe(frozen);
    expect(result.current.pristine.name).toBe('');
  });

  it('keeps the same key for the subtree until something is restored', () => {
    const { result, rerender } = mount();
    const key = result.current.sessionKey;

    rerender({ pristine: demoDefaults() });
    act(() => result.current.restart());

    expect(result.current.sessionKey).not.toBe(key);
  });

  it('is off, and says so, on a form that does not use it', () => {
    const { result } = mount({ enabled: false });

    expect(result.current.persistent).toBe(false);
    expect(result.current.writer).toEqual({ status: 'disabled' });
    expect(result.current.offer).toBeNull();
    expect(result.current.notices).toEqual([]);
    expect(formRecoveryCollectionExists()).toBe(false);
  });

  it('passes a send through when it is off', async () => {
    const { result } = mount({ enabled: false });
    const request = vi.fn().mockResolvedValue('done');

    await expect(result.current.send(request)).resolves.toBe('done');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('gives the default focus to a dialog while the resume button is not there, then the button', () => {
    const { result } = mount();

    expect(result.current.focusOffer()).toBe(true);

    const button = document.createElement('button');
    button.setAttribute('data-form-recovery-resume', '');
    document.body.append(button);
    expect(result.current.focusOffer()).toBe(button);
  });

  it('is inert without a signed-in person', () => {
    vi.stubEnv('VITE_E2E_BYPASS_AUTH', 'false');
    const { result } = mount();

    expect(result.current.persistent).toBe(false);
    expect(formRecoveryCollectionExists()).toBe(false);
  });
});
