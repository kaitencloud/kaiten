import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { Entitlement } from '@/api-client';
import { AddEntitlementDialog } from '../add-entitlement-dialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) => {
      if (key === 'Pages.Licenses.Entitlements.Status.unlimited') {
        return 'Unlimited';
      }

      if (key === 'Pages.Licenses.Entitlements.Dialog.maximumAllowedUsage') {
        return `Accepted up to ${String((fallback as { max?: string })?.max)}`;
      }

      return typeof fallback === 'string' ? fallback : key;
    },
  }),
}));

const availableEntitlements = [
  { id: 'ent-seats', name: 'Seats', slug: 'seats', type: 'NUMBER' },
  { id: 'ent-sso', name: 'SSO', slug: 'sso', type: 'BOOLEAN' },
  {
    id: 'ent-ai',
    name: 'AI Credits',
    slug: 'ai-credits',
    type: 'NUMBER_AI_CREDIT',
  },
] as Entitlement[];

function renderDialog({
  newOveragePercent = 0,
  newThreshold = null,
  newThresholdUnlimited = false,
  onNewOveragePercentChange = vi.fn(),
  onNewThresholdUnlimitedChange = vi.fn(),
  selectedEntitlementId = 'ent-seats',
}: {
  newOveragePercent?: number | null;
  newThreshold?: number | null;
  newThresholdUnlimited?: boolean;
  onNewOveragePercentChange?: (value: number | null) => void;
  onNewThresholdUnlimitedChange?: (unlimited: boolean) => void;
  selectedEntitlementId?: string;
} = {}) {
  return render(
    <AddEntitlementDialog
      availableEntitlements={availableEntitlements}
      newBooleanValue
      newConfigValue="{}"
      newOveragePercent={newOveragePercent}
      newThreshold={newThreshold}
      newThresholdUnlimited={newThresholdUnlimited}
      onAddEntitlement={vi.fn()}
      onNewBooleanValueChange={vi.fn()}
      onNewConfigValueChange={vi.fn()}
      onNewOveragePercentChange={onNewOveragePercentChange}
      onNewThresholdChange={vi.fn()}
      onNewThresholdUnlimitedChange={onNewThresholdUnlimitedChange}
      onOpenChange={vi.fn()}
      onSelectedEntitlementIdChange={vi.fn()}
      open
      selectedEntitlementId={selectedEntitlementId}
    />,
  );
}

const thresholdInput = () =>
  screen.queryByLabelText('Pages.Licenses.Entitlements.Dialog.thresholdLabel', {
    selector: 'input',
  });
// The slider shares the field's accessible name -- they set one value -- so
// the lookups say which of the two they mean.
const overageInput = () =>
  screen.queryByLabelText(
    'Pages.Licenses.Entitlements.Dialog.overagePercentLabel',
    { selector: 'input:not([type="range"])' },
  );
const overageSlider = () => screen.findByRole('slider');
const unlimitedSwitch = () => screen.getByRole('switch', { name: 'Unlimited' });

describe('AddEntitlementDialog', () => {
  it('offers the allowance on a capped grant', () => {
    renderDialog({ newThreshold: 100 });

    expect(thresholdInput()).toBeEnabled();
    expect(unlimitedSwitch()).not.toBeChecked();
    expect(overageInput()).toBeInTheDocument();
  });

  // Nothing caps an unlimited grant, so there is no allowance to set and no
  // value to type.
  it('hides the allowance and disables the value when unlimited is on', () => {
    renderDialog({ newThresholdUnlimited: true });

    expect(unlimitedSwitch()).toBeChecked();
    expect(thresholdInput()).toBeDisabled();
    expect(overageInput()).not.toBeInTheDocument();
  });

  it('reports the switch instead of asking for a typed word', async () => {
    const user = userEvent.setup();
    const onNewThresholdUnlimitedChange = vi.fn();

    renderDialog({ newThreshold: 100, onNewThresholdUnlimitedChange });

    await user.click(unlimitedSwitch());

    expect(onNewThresholdUnlimitedChange).toHaveBeenCalledWith(true, expect.any(Object));
  });

  it('reports the allowance as a number, not typed text', async () => {
    const user = userEvent.setup();
    const onNewOveragePercentChange = vi.fn();

    renderDialog({ newThreshold: 100, onNewOveragePercentChange });

    const input = overageInput() as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '25');

    expect(onNewOveragePercentChange).toHaveBeenLastCalledWith(25);
  });

  // Dragging and typing set the same value, so neither can drift from the
  // other.
  it('drives the allowance from the slider as well as the field', async () => {
    const onNewOveragePercentChange = vi.fn();

    renderDialog({
      newOveragePercent: 25,
      newThreshold: 100,
      onNewOveragePercentChange,
    });

    const slider = await overageSlider();

    expect(slider).toHaveValue('25');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '100');
    expect(overageInput()).toHaveValue('25');

    slider.focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(onNewOveragePercentChange).toHaveBeenLastCalledWith(26);
  });

  // The allowance is a percentage of the granted value, so the stepper stops
  // at a hundred rather than letting the field run away.
  it('does not step the allowance past a hundred percent', async () => {
    const user = userEvent.setup();
    const onNewOveragePercentChange = vi.fn();

    renderDialog({
      newOveragePercent: 100,
      newThreshold: 100,
      onNewOveragePercentChange,
    });

    // Each number field has its own stepper, so scope to the allowance one.
    const group = (overageInput() as HTMLInputElement).parentElement as HTMLElement;
    await user.click(within(group).getByRole('button', { name: 'Increase value' }));

    for (const call of onNewOveragePercentChange.mock.calls) {
      expect(call[0]).toBeLessThanOrEqual(100);
    }
  });

  // The field has to hold three digits: a hundred percent is reachable by
  // dragging the slider to the end.
  it('shows a full hundred percent without clipping it', async () => {
    const user = userEvent.setup();

    renderDialog({ newOveragePercent: 100, newThreshold: 100 });

    const input = overageInput() as HTMLInputElement;
    expect(input).toHaveValue('100');

    await user.click(input);
    input.select();
    await user.keyboard('100');

    expect(input).toHaveValue('100');
  });

  // The percentage on its own says nothing about how much usage it buys.
  it('states the usage the allowance actually buys', () => {
    const { unmount } = renderDialog({
      newOveragePercent: 31,
      newThreshold: 1000,
    });

    expect(screen.getByText('Accepted up to 1,310')).toBeInTheDocument();
    unmount();

    // A hard limit stops at the granted value itself.
    renderDialog({ newOveragePercent: 0, newThreshold: 1000 });

    expect(screen.getByText('Accepted up to 1,000')).toBeInTheDocument();
  });

  // A percentage of a granted value rarely lands on a whole number, and the
  // reader is being told a usage count.
  it('states it as a whole number', () => {
    renderDialog({ newOveragePercent: 53, newThreshold: 999 });

    expect(screen.getByText('Accepted up to 1,528')).toBeInTheDocument();
  });

  it('says nothing about a ceiling while there is no value to compute one from', () => {
    renderDialog({ newOveragePercent: 25, newThreshold: null });

    expect(screen.queryByText(/Accepted up to/)).not.toBeInTheDocument();
  });

  it('never offers a value or an allowance to a non-numeric entitlement', () => {
    renderDialog({ newThreshold: 100, selectedEntitlementId: 'ent-sso' });

    expect(thresholdInput()).not.toBeInTheDocument();
    expect(overageInput()).not.toBeInTheDocument();
  });

  it('offers both to an AI credit entitlement', () => {
    renderDialog({ newThreshold: 100, selectedEntitlementId: 'ent-ai' });

    expect(thresholdInput()).toBeInTheDocument();
    expect(overageInput()).toBeInTheDocument();
  });
});
