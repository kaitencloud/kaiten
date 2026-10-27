import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import { useAppForm } from '@/hooks/form';
import en from '@/lib/i18n/locales/en';
import { EntitlementUnitFields } from '../entitlement-unit-fields';

type Values = {
  unitSingular?: string;
  unitPlural?: string;
  saleUnitSingular?: string;
  saleUnitPlural?: string;
  saleUnitFactor?: number;
};

let current: { values: () => Values } | undefined;

function Harness({ defaultValues }: { defaultValues: Values }) {
  const form = useAppForm({ defaultValues });
  current = { values: () => form.state.values };

  return <EntitlementUnitFields form={form} />;
}

const toggle = () =>
  screen.getByRole('switch', { name: 'Feature is sold in different units' });

beforeEach(() => {
  testI18n.addResourceBundle(
    'en',
    'translation',
    { Pages: { Entitlements: en.Pages.Entitlements } },
    true,
    true,
  );
  current = undefined;
});

describe('the sale unit section of the unit fields', () => {
  it('stays closed while the form holds no sale unit', () => {
    render(<Harness defaultValues={{ unitPlural: 'seats', unitSingular: 'seat' }} />);

    expect(toggle()).not.toBeChecked();
    expect(screen.queryByLabelText('Sale unit (singular)')).not.toBeInTheDocument();
  });

  it('draws the section for sale units the form was given, so that what is sent can be seen and edited', () => {
    render(
      <Harness
        defaultValues={{
          saleUnitFactor: 3,
          saleUnitPlural: 'packs',
          saleUnitSingular: 'pack',
          unitPlural: 'seats',
          unitSingular: 'seat',
        }}
      />,
    );

    expect(toggle()).toBeChecked();
    expect(screen.getByLabelText('Sale unit (singular)')).toHaveValue('pack');
    expect(screen.getByLabelText('Sale unit (plural)')).toHaveValue('packs');
    expect(screen.getByLabelText('Base units per sale unit')).toHaveValue(3);
  });

  it('draws the section when the values arrive after the first render, as a resume does', async () => {
    function Resumed() {
      const form = useAppForm({
        defaultValues: { unitPlural: 'seats', unitSingular: 'seat' } as Values,
      });

      return (
        <>
          <button
            type="button"
            onClick={() =>
              form.reset({
                saleUnitFactor: 3,
                saleUnitPlural: 'packs',
                saleUnitSingular: 'pack',
                unitPlural: 'seats',
                unitSingular: 'seat',
              })
            }
          >
            restore
          </button>
          <EntitlementUnitFields form={form} />
        </>
      );
    }
    render(<Resumed />);
    expect(toggle()).not.toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'restore' }));

    expect(toggle()).toBeChecked();
    expect(screen.getByLabelText('Sale unit (plural)')).toHaveValue('packs');
  });

  it('opens on the person\'s wish while empty, and clears the trio when switched off', async () => {
    const person = userEvent.setup();
    render(<Harness defaultValues={{ unitPlural: 'seats', unitSingular: 'seat' }} />);

    await person.click(toggle());
    expect(toggle()).toBeChecked();
    // Still open with nothing typed: it closes only by the person's hand.
    expect(screen.getByLabelText('Sale unit (singular)')).toHaveValue('');

    await person.type(screen.getByLabelText('Sale unit (singular)'), 'pack');
    await person.click(toggle());

    expect(toggle()).not.toBeChecked();
    expect(screen.queryByLabelText('Sale unit (singular)')).not.toBeInTheDocument();
    expect(current?.values().saleUnitSingular).toBe('');
    expect(current?.values().saleUnitFactor).toBeUndefined();
  });
});
