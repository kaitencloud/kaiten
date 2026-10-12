import { beforeAll, describe, expect, it } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import type {
  ProvenanceAddon,
  ProvenanceBoost,
  ProvenanceLicense,
  ProvenanceNumber,
} from '@/api-client';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';
import {
  explainLimit,
  formatLimitExplanation,
  type LimitExplanation,
  type ServedProvenance,
} from '../entitlement-provenance.utils';

// The shapes the API serves (api/internal/modules/instances/schema/provenance.go),
// one per way a limit is composed.

const license = (value: number): ProvenanceLicense => ({
  licenseEntitlementId: 'license-entitlement-1',
  limitCapExceededOveragePercent: null,
  value: { type: 'number', value },
});

const addon = (
  overrideBehavior: ProvenanceAddon['overrideBehavior'],
  quantity: number,
  value: number,
): ProvenanceAddon => ({
  addonEntitlementId: 'addon-entitlement-1',
  addonId: 'addon-1',
  attachedAt: '2027-02-05T09:00:00.000Z',
  instanceAddonId: 'instance-addon-1',
  limitCapExceededOveragePercent: null,
  overrideBehavior,
  quantity,
  value: { type: 'number', value },
});

const boost = (
  modifierType: ProvenanceBoost['modifierType'],
  modifierValue: number | null,
): ProvenanceBoost => ({
  effectiveExpiresAt: null,
  effectiveStartsAt: '2027-02-06T09:00:00.000Z',
  instanceVoucherId: 'instance-voucher-1',
  modifierType,
  modifierValue,
  redeemedAt: '2027-02-06T09:00:00.000Z',
  voucherEntitlementGrantId: 'grant-1',
  voucherId: 'voucher-1',
});

const number = (
  composition: Partial<ProvenanceNumber> & { effective: number },
): ProvenanceNumber => ({
  afterAddons: composition.effective,
  boostAdd: null,
  boostMultiply: null,
  boostSet: null,
  license: null,
  unlimited: false,
  ...composition,
});

const read = (
  provenance: ServedProvenance | null | undefined,
  locale = 'en',
): string | null => {
  const explanation = explainLimit(provenance);

  // The total is kept with its sign by a no-break space, which reads as a space.
  return explanation
    ? formatLimitExplanation(explanation, { locale, t: testI18n.t }).replace(
        /\u00a0/g,
        ' ',
      )
    : null;
};

beforeAll(async () => {
  testI18n.addResourceBundle('en', 'translation', en, true, true);
  testI18n.addResourceBundle('fr', 'translation', fr, true, true);
  await testI18n.changeLanguage('en');
});

describe('explaining how a limit is composed', () => {
  // The usual case: ten thousand from the license, three add-ons of a
  // thousand each, and a voucher that doubles it.
  const composed: ServedProvenance = {
    addons: [addon('ADD', 3, 1000)],
    boosts: [boost('MULTIPLY', 2)],
    license: license(10000),
    number: number({
      afterAddons: 13000,
      boostMultiply: 2,
      effective: 26000,
      license: 10000,
    }),
  };

  it('reads an add-on and a multiplying boost as a running total, in English', () => {
    expect(read(composed)).toBe(
      '10,000 license + 3 × 1,000 add-on × 2 voucher = 26,000',
    );
  });

  it('reads it in French with the words of the console', async () => {
    await testI18n.changeLanguage('fr');
    try {
      expect(read(composed, 'fr')?.replace(/\s/g, ' ')).toBe(
        '10 000 licence + 3 × 1 000 add-on × 2 code promo = 26 000',
      );
    } finally {
      await testI18n.changeLanguage('en');
    }
  });

  it('keeps the total with its sign, which a narrow popover does not break', () => {
    const explanation = explainLimit(composed);

    expect(
      explanation &&
        formatLimitExplanation(explanation, { locale: 'en', t: testI18n.t }),
    ).toMatch(/ =\u00a026,000$/);
  });

  it('keeps the terms as data, for a reader that is not a sentence', () => {
    expect(explainLimit(composed)).toEqual({
      effective: 26000,
      kind: 'composed',
      terms: [
        { amount: 10000, kind: 'license' },
        { amount: 1000, kind: 'addon', operation: 'add', quantity: 3 },
        { amount: 2, kind: 'voucher', operation: 'multiply' },
      ],
    } satisfies LimitExplanation);
  });

  it('drops the quantity of a single unit', () => {
    expect(
      read({
        addons: [addon('ADD', 1, 500)],
        license: license(100),
        number: number({ effective: 600, license: 100 }),
      }),
    ).toBe('100 license + 500 add-on = 600');
  });

  it('adds every add-on in turn, then the additions of the vouchers before their multiples', () => {
    expect(
      read({
        addons: [addon('ADD', 2, 500), addon('ADD', 1, 250)],
        boosts: [boost('MULTIPLY', 2), boost('ADD', 100)],
        license: license(1000),
        number: number({ effective: 4700, license: 1000 }),
      }),
    ).toBe(
      '1,000 license + 2 × 500 add-on + 250 add-on + 100 voucher × 2 voucher = 4,700',
    );
  });

  it('shows a fraction of a multiple as it is', () => {
    expect(
      read({
        addons: [],
        boosts: [boost('MULTIPLY', 1.5)],
        license: license(1000),
        number: number({ effective: 1500, license: 1000 }),
      }),
    ).toBe('1,000 license × 1.5 voucher = 1,500');
  });

  describe('where an add-on replaces the license', () => {
    it('says that it takes its place, and the latest attached is the one that counts', () => {
      expect(
        read({
          addons: [addon('OVERRIDE', 1, 3000), addon('OVERRIDE', 2, 5000)],
          license: license(1000),
          number: number({ effective: 10000, license: 1000 }),
        }),
      ).toBe('2 × 5,000 add-on (replaces the license) = 10,000');
    });

    it('lets the other add-ons and the vouchers go on from the replacement', () => {
      expect(
        read({
          addons: [addon('OVERRIDE', 1, 5000), addon('ADD', 2, 1000)],
          boosts: [boost('ADD', 500)],
          license: license(1000),
          number: number({ effective: 7500, license: 1000 }),
        }),
      ).toBe(
        '5,000 add-on (replaces the license) + 2 × 1,000 add-on + 500 voucher = 7,500',
      );
    });

    it('calls it the base when the license grants nothing', () => {
      expect(
        read({
          addons: [addon('OVERRIDE', 1, 5000)],
          license: null,
          number: number({ effective: 5000 }),
        }),
      ).toBe('5,000 add-on = 5,000');
    });
  });

  it('keeps the larger of the license and a MAX add-on, and goes on from it', () => {
    expect(
      read({
        addons: [addon('MAX', 1, 12000), addon('ADD', 1, 500)],
        license: license(10000),
        number: number({ effective: 12500, license: 10000 }),
      }),
    ).toBe('max(10,000 license, 12,000 add-on) + 500 add-on = 12,500');
  });

  it('reads a MAX add-on that is alone as the base', () => {
    expect(
      read({
        addons: [addon('MAX', 2, 400)],
        license: null,
        number: number({ effective: 800 }),
      }),
    ).toBe('2 × 400 add-on = 800');
  });

  describe('where a voucher sets the value', () => {
    it('says that it takes the place of the license and the add-ons, which no longer count', () => {
      expect(
        read({
          addons: [addon('ADD', 3, 1000)],
          boosts: [boost('SET', 5000)],
          license: license(10000),
          number: number({ boostSet: 5000, effective: 5000, license: 10000 }),
        }),
      ).toBe('5,000 voucher (replaces the license and the add-ons) = 5,000');
    });

    it('lets the other vouchers go on from it', () => {
      expect(
        read({
          addons: [],
          boosts: [boost('SET', 5000), boost('MULTIPLY', 2)],
          license: license(10000),
          number: number({ boostSet: 5000, effective: 10000, license: 10000 }),
        }),
      ).toBe(
        '5,000 voucher (replaces the license and the add-ons) × 2 voucher = 10,000',
      );
    });
  });

  describe('where nothing is limited', () => {
    it.each([
      [
        'the license',
        { addons: [addon('ADD', 1, 1000)], license: license(-1) },
        'Unlimited, granted by the license',
      ],
      [
        'an add-on',
        { addons: [addon('ADD', 1, -1)], license: license(100) },
        'Unlimited, granted by an add-on',
      ],
      [
        'a voucher',
        {
          addons: [],
          boosts: [boost('UNLIMITED', null)],
          license: license(100),
        },
        'Unlimited, granted by a voucher',
      ],
      [
        'the license and an add-on',
        { addons: [addon('ADD', 1, -1)], license: license(-1) },
        'Unlimited, granted by the license and an add-on',
      ],
    ] as const)('says who grants it: %s', (_, layers, sentence) => {
      expect(
        read({
          ...layers,
          number: number({ effective: -1, unlimited: true }),
        }),
      ).toBe(sentence);
    });

    it('still says it is unlimited when no layer can be named', () => {
      expect(
        read({
          addons: [],
          license: null,
          number: number({ effective: -1, unlimited: true }),
        }),
      ).toBe('Unlimited');
    });

    it('lists the sources in French', async () => {
      await testI18n.changeLanguage('fr');
      try {
        expect(
          read(
            {
              addons: [addon('ADD', 1, -1)],
              license: license(-1),
              number: number({ effective: -1, unlimited: true }),
            },
            'fr',
          ),
        ).toBe('Illimité, accordé par la licence et un add-on');
      } finally {
        await testI18n.changeLanguage('en');
      }
    });
  });

  describe('where there is nothing to explain', () => {
    it('gives none for an identity row: the license alone, and a number that is null', () => {
      expect(
        explainLimit({
          addons: [],
          boosts: [],
          license: license(10000),
          number: null,
        }),
      ).toBeNull();
    });

    it('gives none for a flag or a configuration, whose number is null', () => {
      for (const value of [
        { type: 'boolean', value: true },
        { type: 'object', value: { tier: 'basic' } },
      ] as const) {
        expect(
          explainLimit({
            addons: [],
            boosts: [],
            license: {
              licenseEntitlementId: 'license-entitlement-2',
              limitCapExceededOveragePercent: null,
              value: value as ProvenanceLicense['value'],
            },
            number: null,
          }),
        ).toBeNull();
      }
    });

    it('gives none when the API sent no provenance, or none of its members', () => {
      expect(explainLimit(undefined)).toBeNull();
      expect(explainLimit(null)).toBeNull();
      expect(explainLimit({})).toBeNull();
      expect(explainLimit({ license: null, number: undefined })).toBeNull();
    });

    it('gives none when an add-on cannot be read, rather than a sum that does not add up', () => {
      expect(
        explainLimit({
          addons: [
            {
              ...addon('ADD', 1, 100),
              overrideBehavior: 'SUBTRACT' as ProvenanceAddon['overrideBehavior'],
            },
          ],
          license: license(10000),
          number: number({ effective: 10100, license: 10000 }),
        }),
      ).toBeNull();
      expect(
        explainLimit({
          addons: [
            { ...addon('ADD', 1, 100), value: { type: 'boolean', value: true } },
          ],
          license: license(10000),
          number: number({ effective: 10100, license: 10000 }),
        }),
      ).toBeNull();
    });

    it('gives none when a voucher has no amount to apply', () => {
      expect(
        explainLimit({
          addons: [],
          boosts: [boost('MULTIPLY', null)],
          license: license(10000),
          number: number({ effective: 20000, license: 10000 }),
        }),
      ).toBeNull();
    });
  });

  // A voucher is spoken of by what it does; the API sends no code, and the explanation
  // would not show one if it did.
  it('never names a voucher by anything but its effect', () => {
    const text = read({
      addons: [],
      boosts: [
        {
          ...boost('ADD', 50000),
          instanceVoucherId: 'SECRET-CODE-2026',
          voucherId: 'SECRET-CODE-2026',
        },
      ],
      license: license(100000),
      number: number({ boostAdd: 50000, effective: 150000, license: 100000 }),
    });

    expect(text).toBe('100,000 license + 50,000 voucher = 150,000');
    expect(text).not.toContain('SECRET');
  });
});
