import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import type { ProvenanceAddon, ProvenanceBoost } from '@/api-client';
import { DataTable } from '@/functionals/table';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import type { InstanceEntitlementRow } from '../../../../../utils/instance-detail-entitlements.utils';
import {
  AddonSourceHint,
  EntitlementLimitFigure,
} from '../entitlement-limit';

const addon: ProvenanceAddon = {
  addonEntitlementId: 'addon-entitlement-1',
  addonId: 'addon-1',
  attachedAt: '2027-02-05T09:00:00.000Z',
  instanceAddonId: 'instance-addon-1',
  limitCapExceededOveragePercent: null,
  overrideBehavior: 'ADD',
  quantity: 3,
  value: { type: 'number', value: 1000 },
};
const boost: ProvenanceBoost = {
  effectiveExpiresAt: null,
  effectiveStartsAt: '2027-02-06T09:00:00.000Z',
  instanceVoucherId: 'instance-voucher-1',
  modifierType: 'MULTIPLY',
  modifierValue: 2,
  redeemedAt: '2027-02-06T09:00:00.000Z',
  voucherEntitlementGrantId: 'grant-1',
  voucherId: 'voucher-1',
};

const traces = (
  overrides: Partial<InstanceEntitlementRow> = {},
): InstanceEntitlementRow => ({
  enabled: null,
  entitlementGroups: [],
  entitlementId: 'ent-traces',
  entitlementName: 'Traces',
  entitlementSlug: 'traces',
  entitlementType: 'NUMBER',
  limitCapExceededOveragePercent: 0,
  provenance: {
    addons: [addon],
    boosts: [boost],
    license: {
      licenseEntitlementId: 'license-entitlement-1',
      limitCapExceededOveragePercent: null,
      value: { type: 'number', value: 10000 },
    },
    number: {
      afterAddons: 13000,
      boostAdd: null,
      boostMultiply: 2,
      boostSet: null,
      effective: 26000,
      license: 10000,
      unlimited: false,
    },
  },
  source: 'license',
  threshold: 26000,
  value: 4200,
  ...overrides,
});

const SENTENCE = '10,000 license + 3 × 1,000 add-on × 2 voucher = 26,000';

beforeAll(() => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
});

afterEach(async () => {
  await testI18n.changeLanguage('en');
});

const renderFigure = (row: InstanceEntitlementRow, locale = 'en') =>
  render(<EntitlementLimitFigure locale={locale} row={row} />);

describe('the effective limit of an entitlement', () => {
  it('says how it is composed when the user hovers it', async () => {
    renderFigure(traces());

    await userEvent.hover(screen.getByTestId('limit-provenance-trigger'));

    expect(await screen.findByTestId('limit-provenance')).toHaveTextContent(
      SENTENCE,
    );
  });

  it('says how it is composed to a keyboard, which reaches it with Tab and opens it with Enter', async () => {
    renderFigure(traces());

    await userEvent.tab();
    const trigger = screen.getByRole('button', {
      name: '26,000: how the limit of Traces is composed',
    });

    expect(trigger).toHaveFocus();
    expect(trigger).toHaveTextContent('26,000');
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByTestId('limit-provenance')).toHaveTextContent(
      SENTENCE,
    );
  });

  it('opens on a tap and closes on Escape, with a title that names what it says', async () => {
    renderFigure(traces());

    await userEvent.click(screen.getByTestId('limit-provenance-trigger'));
    const popup = await screen.findByRole('dialog');

    expect(popup).toHaveAccessibleName('How this limit is composed');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says it in French with the words of the console', async () => {
    await testI18n.changeLanguage('fr');
    renderFigure(traces(), 'fr');

    await userEvent.click(screen.getByTestId('limit-provenance-trigger'));

    expect(
      (await screen.findByTestId('limit-provenance')).textContent?.replace(
        /\s/g,
        ' ',
      ),
    ).toBe('10 000 licence + 3 × 1 000 add-on × 2 code promo = 26 000');
    expect(await screen.findByRole('dialog')).toHaveAccessibleName(
      'Comment cette limite est composée',
    );
  });

  it('is the figure alone for an identity row, whose number is null', () => {
    const row = traces({
      provenance: {
        addons: [],
        boosts: [],
        license: {
          licenseEntitlementId: 'license-entitlement-1',
          limitCapExceededOveragePercent: null,
          value: { type: 'number', value: 10000 },
        },
        number: null,
      },
      threshold: 10000,
    });
    renderFigure(row);

    expect(screen.getByText('10,000')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('limit-provenance-trigger')).toBeNull();
  });

  it('is the figure alone when the API sent no provenance at all', () => {
    renderFigure(traces({ provenance: undefined }));

    expect(screen.getByText('26,000')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each(['BOOLEAN', 'CONFIG'] as const)(
    'is a dash with no popover for a %s entitlement',
    (entitlementType) => {
      renderFigure(
        traces({ entitlementType, limitCapExceededOveragePercent: null }),
      );

      expect(screen.getByText('-')).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
    },
  );

  it('explains a limit that is unlimited by who grants it', async () => {
    renderFigure(
      traces({
        provenance: {
          addons: [{ ...addon, value: { type: 'number', value: -1 } }],
          boosts: [],
          license: {
            licenseEntitlementId: 'license-entitlement-1',
            limitCapExceededOveragePercent: null,
            value: { type: 'number', value: 10000 },
          },
          number: {
            afterAddons: -1,
            boostAdd: null,
            boostMultiply: null,
            boostSet: null,
            effective: -1,
            license: 10000,
            unlimited: true,
          },
        },
        threshold: -1,
      }),
    );

    expect(screen.getByTestId('limit-provenance-trigger')).toHaveTextContent(
      'Unlimited',
    );
    await userEvent.click(screen.getByTestId('limit-provenance-trigger'));
    expect(await screen.findByTestId('limit-provenance')).toHaveTextContent(
      'Unlimited, granted by an add-on',
    );
  });

  // The table follows a click on a row, and leaves to its own control a click that lands
  // on one marked `data-row-actions`.
  it('does not open the row of the table it is in', async () => {
    const onClickRow = vi.fn();
    render(
      <DataTable<InstanceEntitlementRow>
        columns={[
          {
            cell: ({ row }) => (
              <EntitlementLimitFigure locale="en" row={row.original} />
            ),
            header: 'Limit',
            id: 'limit',
          },
        ]}
        data={[traces()]}
        onClickRow={onClickRow}
        pagination={false}
      />,
    );

    await userEvent.click(screen.getByTestId('limit-provenance-trigger'));

    expect(await screen.findByTestId('limit-provenance')).toHaveTextContent(
      SENTENCE,
    );
    expect(onClickRow).not.toHaveBeenCalled();
  });
});

describe('where the add-ons grant an entitlement', () => {
  it('says so, in both languages', async () => {
    const { unmount } = render(<AddonSourceHint row={{ source: 'addon' }} />);

    expect(screen.getByTestId('limit-source')).toHaveTextContent(
      'from add-ons',
    );
    unmount();

    await testI18n.changeLanguage('fr');
    render(<AddonSourceHint row={{ source: 'addon' }} />);

    expect(screen.getByTestId('limit-source')).toHaveTextContent(
      'via les add-ons',
    );
  });

  it.each([{ source: 'license' }, {}] as const)(
    'says nothing where the license grants it (%o)',
    (row) => {
      render(<AddonSourceHint row={row} />);

      expect(screen.queryByTestId('limit-source')).toBeNull();
    },
  );
});
