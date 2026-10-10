import type {
  Entitlement,
  InvoiceLine,
  InvoicePreview,
  InvoicePreviewScenario,
  LicenseEntitlement,
  Price,
} from '@/api-client';
import { CURRENCY_EXPONENTS } from '@/lib/currency-exponents';
import {
  add,
  compare,
  type Decimal,
  divide,
  formatDecimal,
  formatGrouped,
  fromInteger,
  isPositive,
  max,
  min,
  multiply,
  parseDecimal,
  roundToInteger,
  subtract,
  ZERO,
} from './decimal';
import { NULL_LINE_MEMBERS } from '../fixtures/build-invoice';
import { NULL_OBJECT } from '../fixtures/null-object';
import { LicenseProblem } from './license-problem';

/**
 * The RENEWAL invoice a subscription to a license version would be billed at a
 * boundary now, composed the way the API does it
 * (api/internal/modules/billing/rating): the base price for the period that
 * starts, the sample usage rated in arrears over the period that ends, with the
 * lines ordered by service start, type and display order. It exists for the
 * mocks that stand in for the API: the console shows the lines it is given and
 * never composes one.
 */

const OPERATION = 'PreviewLicenseInvoice';
const HUNDRED = fromInteger(100);
const QUANTITY_PLACES = 12;
const PERIOD_MONTHS = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
  ANNUAL: 12,
} as const;

export type PreviewInput = {
  /** The entitlement catalogue, for the names the lines carry. */
  entitlements: Entitlement[];
  /** What the version grants. */
  grants: LicenseEntitlement[];
  license: { name: string; slug: string };
  /** The boundary the invoice bills, now. */
  now: Date;
  /** Every price of the version, whatever its status. */
  prices: Price[];
  scenario: InvoicePreviewScenario;
};

/** `date` moved by `months`, the day clamped to the target month's last. */
export function addMonthsClamped(date: Date, months: number): Date {
  const first = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(date.getUTCDate(), lastDay));

  return first;
}

/** A minor-unit amount in major units, with at least the currency's decimals. */
function major(minor: Decimal, currency: string): string {
  const exponent = CURRENCY_EXPONENTS.get(currency) ?? 2;
  const shifted = { digits: minor.digits, scale: minor.scale + exponent };
  const text = formatDecimal(shifted);
  const decimals = text.split('.')[1]?.length ?? 0;
  if (decimals >= exponent) {
    return text;
  }

  return exponent === 0
    ? text
    : `${text}${decimals === 0 ? '.' : ''}${'0'.repeat(exponent - decimals)}`;
}

type Measure = {
  capped: boolean;
  limits: Array<{ limitValue: string | null; overagePercent: number }>;
  overage: Decimal;
  unlimited: boolean;
  usage: Decimal;
};

/** A sample quantity measured as one window against a constant grant. */
function measureSample(quantity: Decimal, grant: LicenseEntitlement): Measure {
  const limit = grant.value.type === 'number' ? grant.value.value : Number.NaN;
  if (!Number.isFinite(limit) || limit < 0) {
    return {
      capped: false,
      limits: [{ limitValue: null, overagePercent: -1 }],
      overage: ZERO,
      unlimited: true,
      usage: quantity,
    };
  }
  const percent = Math.max(grant.limitCapExceededOveragePercent ?? 0, 0);
  const limitValue = parseDecimal(String(limit));
  const allowance = divide(
    multiply(limitValue, fromInteger(percent)),
    HUNDRED,
    QUANTITY_PLACES,
  );
  const accepted = add(limitValue, allowance);

  return {
    capped: compare(quantity, accepted) > 0,
    limits: [
      { limitValue: formatDecimal(limitValue), overagePercent: percent },
    ],
    overage: min(max(ZERO, subtract(quantity, limitValue)), allowance),
    unlimited: false,
    usage: min(quantity, accepted),
  };
}

type Draft = {
  displayOrder: number;
  line: InvoiceLine;
  priceId: string;
  rank: number;
};

function problemOf(code: string, detail: string, status = 422) {
  return new LicenseProblem(status, `${OPERATION}.${code}`, detail);
}

function parseSamples(
  sampleUsage: InvoicePreviewScenario['sampleUsage'],
): Map<string, Decimal> {
  const samples = new Map<string, Decimal>();
  for (const sample of sampleUsage ?? []) {
    let quantity: Decimal;
    try {
      quantity = parseDecimal(sample.quantity);
    } catch {
      quantity = fromInteger(-1);
    }
    if (quantity.digits < 0n) {
      throw problemOf(
        'InvalidSampleUsage',
        'a sample quantity is a non-negative decimal string, in the entitlement’s measured units',
      );
    }
    if (samples.has(sample.entitlementSlug)) {
      throw problemOf(
        'InvalidSampleUsage',
        `sampleUsage names ${sample.entitlementSlug} twice`,
      );
    }
    samples.set(sample.entitlementSlug, quantity);
  }

  return samples;
}

function basePriceOf(prices: Price[], id: string | undefined): Price {
  if (id !== undefined) {
    const named = prices.find(
      (price) => price.id === id && price.billingModel === 'FLAT_FEE',
    );
    if (!named) {
      throw problemOf(
        'PriceNotFound',
        `basePriceId ${id} is not a FLAT_FEE price of this version`,
        404,
      );
    }

    return named;
  }
  const byDefault = prices.find(
    (price) =>
      price.isDefault &&
      price.status === 'ACTIVE' &&
      price.billingModel === 'FLAT_FEE',
  );
  if (!byDefault) {
    throw problemOf(
      'NoBasePrice',
      'this version has no default FLAT_FEE price: name one with basePriceId',
    );
  }

  return byDefault;
}

function arithmetic(
  quantity: Decimal,
  unit: Decimal,
  currency: string,
  saleUnit: string | undefined,
): string {
  const text = `${formatDecimal(quantity)} × ${major(unit, currency)} ${currency}`;

  return saleUnit ? `${text} (per ${saleUnit})` : text;
}

/** Composes the preview; refuses as the API does. */
export function composeLicenseInvoicePreview(
  input: PreviewInput,
): InvoicePreview {
  const { grants, license, now, prices, scenario } = input;
  const samples = parseSamples(scenario.sampleUsage);
  const ordered = [...prices].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder || left.id.localeCompare(right.id),
  );
  const base = basePriceOf(ordered, scenario.basePriceId);
  const grantBySlug = new Map(
    grants.map((grant) => [grant.entitlementSlug, grant]),
  );
  const meteredGrants = new Set(
    grants
      .filter((grant) => grant.value.type === 'number')
      .map((grant) => grant.entitlementSlug),
  );
  for (const slug of samples.keys()) {
    if (!meteredGrants.has(slug)) {
      throw problemOf(
        'InvalidSampleUsage',
        `no active price of this version meters ${slug}`,
      );
    }
  }

  const currency = base.currency;
  const months = base.billingPeriod ? PERIOD_MONTHS[base.billingPeriod] : 1;
  const advance = {
    from: now,
    to: addMonthsClamped(now, months),
  };
  const arrears = {
    from: addMonthsClamped(now, -months),
    to: now,
  };
  const drafts: Draft[] = [];

  const baseService = base.billingTiming === 'ARREARS' ? arrears : advance;
  drafts.push({
    displayOrder: base.displayOrder,
    line: {
      ...NULL_LINE_MEMBERS,
      amount: Number(roundToInteger(parseDecimal(base.unitAmountDecimal))),
      billingModel: base.billingModel,
      billingTiming: base.billingTiming,
      description: arithmetic(
        fromInteger(1),
        parseDecimal(base.unitAmountDecimal),
        currency,
        undefined,
      ),
      label: base.displayLabel || `${license.name} — base`,
      licensePriceId: base.id,
      quantity: '1',
      seq: 0,
      serviceFrom: baseService.from.toISOString(),
      serviceTo: baseService.to.toISOString(),
      type: 'BASE',
      unitAmountDecimal: base.unitAmountDecimal,
    },
    priceId: base.id,
    rank: 0,
  });

  for (const price of ordered) {
    const slug = price.metered?.entitlementSlug;
    const grant = slug ? grantBySlug.get(slug) : undefined;
    if (price.status !== 'ACTIVE' || !price.metered || !slug || !grant) {
      continue;
    }
    const sample = samples.get(slug);
    if (sample === undefined) {
      continue;
    }
    const measure = measureSample(sample, grant);
    const isOverage = price.billingModel === 'OVERAGE';
    if (isOverage && measure.unlimited) {
      continue;
    }
    const measured = isOverage ? measure.overage : measure.usage;
    if (!isPositive(measured)) {
      continue;
    }
    const factor = parseDecimal(price.metered.saleUnitFactor);
    const quantity = divide(
      measured,
      isPositive(factor) ? factor : fromInteger(1),
      QUANTITY_PLACES,
    );
    if (!isPositive(quantity)) {
      continue;
    }
    const unit = parseDecimal(price.unitAmountDecimal);
    const entitlement = input.entitlements.find(
      (candidate) => candidate.slug === slug,
    );
    let description = arithmetic(
      quantity,
      unit,
      currency,
      price.metered.saleUnitSingular,
    );
    if (isOverage) {
      const applied = measure.limits
        .map((limit) =>
          limit.limitValue === null
            ? 'unlimited'
            : formatGrouped(parseDecimal(limit.limitValue)),
        )
        .join(' → ');
      description += `; ${formatGrouped(measure.usage)} used; ${formatGrouped(measure.overage)} above the applied limit${applied ? ` (${applied})` : ''}`;
    }
    if (measure.capped) {
      description += '; sample capped at what the licence accepts';
    }
    const label =
      price.displayLabel ||
      `${entitlement?.name ?? slug}${isOverage ? ' — overage' : ''}`;
    drafts.push({
      displayOrder: price.displayOrder,
      line: {
        ...NULL_LINE_MEMBERS,
        amount: Number(roundToInteger(multiply(quantity, unit))),
        billingModel: price.billingModel,
        billingTiming: price.billingTiming,
        capped: measure.capped || undefined,
        description,
        entitlementSlug: slug,
        label,
        licensePriceId: price.id,
        metering: {
          ledger: NULL_OBJECT,
          measuredQuantity: formatDecimal(measured),
          negativeSegmentsFloored: 0,
          saleUnitFactor: formatDecimal(factor),
          windows: 1,
        },
        overage: isOverage
          ? {
              limits: measure.limits.map((limit) => ({ ...limit, rows: 0 })),
              overageMeasured: formatDecimal(measure.overage),
              usageMeasured: formatDecimal(measure.usage),
            }
          : NULL_OBJECT,
        quantity: formatDecimal(quantity),
        seq: 0,
        serviceFrom: arrears.from.toISOString(),
        serviceTo: arrears.to.toISOString(),
        type: isOverage ? 'OVERAGE' : 'USAGE',
        unitAmountDecimal: price.unitAmountDecimal,
      },
      priceId: price.id,
      rank: isOverage ? 3 : 2,
    });
  }

  drafts.sort(
    (left, right) =>
      left.line.serviceFrom.localeCompare(right.line.serviceFrom) ||
      left.rank - right.rank ||
      left.displayOrder - right.displayOrder ||
      left.priceId.localeCompare(right.priceId),
  );
  const lines = drafts.map(({ line }, index) => ({ ...line, seq: index + 1 }));
  // The server composes the totals: the mock adds the lines up so that the
  // console never has to.
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);

  return {
    asOf: now.toISOString(),
    boundaryAt: now.toISOString(),
    currency,
    discountTotal: 0,
    kind: 'RENEWAL',
    licenseSlug: license.slug,
    lines,
    serviceFrom: lines.map((line) => line.serviceFrom).sort()[0],
    serviceTo: lines
      .map((line) => line.serviceTo)
      .sort()
      .at(-1),
    status: 'PREVIEW',
    subtotal,
    total: subtotal,
    wouldHold: [],
  };
}
