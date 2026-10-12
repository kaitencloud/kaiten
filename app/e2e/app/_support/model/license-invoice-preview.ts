import type {
  Addon,
  AddonAmount,
  AddonEntitlement,
  Entitlement,
  ErrorDetail,
  InvoiceLine,
  InvoicePreview,
  InvoicePreviewScenario,
  LicenseEntitlement,
  Price,
} from '@/api-client';
import { CURRENCY_EXPONENTS } from '@/lib/currency-exponents';
import { type AddonContribution } from './billing-instance-addons';
import { composeDiscounts, type DiscountSource } from './billing-discounts';
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
import { composeEffectiveNumber } from './effective-entitlement';
import { NULL_LINE_MEMBERS } from '../fixtures/build-invoice';
import { LicenseProblem } from './license-problem';

/**
 * The RENEWAL invoice a subscription to a license version would be billed at a
 * boundary now, composed the way the API does it
 * (api/internal/modules/billing/rating): the base price for the period that
 * starts, the usage rated in arrears over the period that ends, with the lines
 * ordered by service start, type and display order. The usage is a sample given
 * entitlement by entitlement, or the journal of an instance over its current
 * period. The add-ons listed are priced in: their fees for the period of the base,
 * their metered prices, and their grants, which raise the limit the sample is
 * rated against. A voucher is applied as a redemption would be, and consumes
 * nothing. It exists for the mocks that stand in for the API: the console shows
 * the lines it is given and never composes one.
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

/** An add-on version a preview prices in: what a unit of it grants and what it is sold for. */
export type PreviewAddon = {
  addon: Pick<Addon, 'id' | 'name' | 'slug'>;
  grants: AddonEntitlement[];
  prices: Price[];
};

/** What a preview reads of an instance. */
export type PreviewInstance = {
  /**
   * What the instance used of an entitlement in `[from, to)`, in measured units, and how
   * much of it was over its limit, when its journal is known; none without a report.
   */
  measure?: (
    entitlementSlug: string,
    from: Date,
    to: Date,
  ) => { overage: string; usage: string } | undefined;
  /** The start of the period its live subscription is in; absent without one. */
  periodStart?: string;
  /** Where the usage the organization keeps begins; absent when it keeps all of it. */
  retentionStart?: string;
};

/**
 * What a preview reads of the rest of the organization: the add-ons it can price in, the
 * instances whose usage it can rate and the vouchers whose discount it can apply. A
 * preview made where the organization has none of these refuses what names one.
 */
export type PreviewWorld = {
  addon(slug: string): PreviewAddon | undefined;
  instance(slug: string): PreviewInstance | undefined;
  /**
   * The moment the preview is composed at, when the other slots keep a clock of their own: the
   * period of an instance is dated by it, so the boundary is read on the same one. The
   * model of the licenses reads its own logical clock otherwise.
   */
  now?(): Date;
  /** The discount a code gives, or why it gives none. */
  voucher(code: string): DiscountSource | 'invalid' | 'unknown';
};

const NOTHING_ELSE: PreviewWorld = {
  addon: () => undefined,
  instance: () => undefined,
  voucher: () => 'unknown',
};

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
  /** The add-ons, instances and vouchers a preview can name; none when left out. */
  world?: PreviewWorld;
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

/** What the version and the add-ons listed grant of an entitlement together: the limit, and how far past it usage is accepted. */
type EffectiveGrant = { limit: number; percent: number };

/** A sample quantity measured as one window against a constant grant. */
function measureSample(
  quantity: Decimal,
  { limit, percent: grantedPercent }: EffectiveGrant,
): Measure {
  if (!Number.isFinite(limit) || limit < 0) {
    return {
      capped: false,
      limits: [{ limitValue: null, overagePercent: -1 }],
      overage: ZERO,
      unlimited: true,
      usage: quantity,
    };
  }
  const percent = Math.max(grantedPercent, 0);
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

/** The place of each type among the lines that start together. */
const RANK = { ADDON: 1, BASE: 0, OVERAGE: 3, USAGE: 2 } as const;

function problemOf(
  code: string,
  detail: string,
  status = 422,
  errors?: ErrorDetail[],
) {
  return new LicenseProblem(status, `${OPERATION}.${code}`, detail, errors);
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

/** An add-on to price in: named once, in a quantity of one or more. */
function checkAddOn(entry: AddonAmount, seen: Set<string>) {
  if (!Number.isInteger(entry.quantity) || entry.quantity < 1) {
    throw problemOf(
      'InvalidAddOns',
      `add-on "${entry.addonSlug}" is listed with a quantity below 1`,
    );
  }
  if (seen.has(entry.addonSlug)) {
    throw problemOf(
      'InvalidAddOns',
      `add-on "${entry.addonSlug}" is listed twice`,
    );
  }
  seen.add(entry.addonSlug);
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

const byDisplayOrder = (left: Price, right: Price) =>
  left.displayOrder - right.displayOrder || left.id.localeCompare(right.id);

/**
 * The add-ons and the instance a body names, found, or refused as the API refuses, in the
 * order it asks: the list add-on by add-on (a repeated one or a quantity below 1 before the
 * next is looked for), then the instance. The voucher is looked for later, once the
 * usage has been read, as the API composes the invoice before it applies one.
 */
function lookUp(scenario: InvoicePreviewScenario, world: PreviewWorld) {
  const seen = new Set<string>();
  const chosen = (scenario.addOns ?? []).map((entry) => {
    checkAddOn(entry, seen);
    const found = world.addon(entry.addonSlug);
    if (!found) {
      throw problemOf(
        'AddonNotFound',
        `add-on "${entry.addonSlug}" not found`,
        404,
      );
    }

    return { entry, found };
  });
  const instance =
    scenario.instanceSlug === undefined
      ? undefined
      : world.instance(scenario.instanceSlug);
  if (scenario.instanceSlug !== undefined && !instance) {
    throw problemOf(
      'InstanceNotFound',
      `instance "${scenario.instanceSlug}" not found`,
      404,
    );
  }

  return { chosen, instance };
}

/** The discount a code gives, or the refusal of the API when it gives none. */
function voucherOf(
  scenario: InvoicePreviewScenario,
  world: PreviewWorld,
): DiscountSource | undefined {
  const voucher =
    scenario.voucherCode === undefined
      ? undefined
      : world.voucher(scenario.voucherCode);
  if (voucher === 'unknown') {
    throw problemOf('VoucherNotFound', 'no voucher has this code', 404);
  }
  if (voucher === 'invalid') {
    throw problemOf(
      'VoucherInvalid',
      'the voucher is not an ACTIVE PRICE voucher: a draft, an archived one or a boost has no discount to apply',
    );
  }

  return voucher;
}

type Window = { from: Date; to: Date };
type Owner = ReturnType<typeof lookUp>['chosen'][number];

/** What the pieces of a composition read together. */
type Composition = {
  /** The add-ons priced in, with the units listed. */
  chosen: Owner[];
  currency: string;
  entitlements: Entitlement[];
  /** What the version grants, by entitlement. */
  grantBySlug: Map<string | undefined, LicenseEntitlement>;
  instance: PreviewInstance | undefined;
  license: { name: string; slug: string };
  now: Date;
  samples: Map<string, Decimal>;
  /** The period that starts at the boundary, and the one that ends there. */
  windows: { advance: Window; arrears: Window };
};

/**
 * The entitlements an invoice meters: those an active metered price of the version
 * measures, where the version grants the entitlement, and those an active metered price
 * of an add-on in the list measures.
 */
function metersOf(
  prices: readonly Price[],
  grantBySlug: ReadonlyMap<string | undefined, LicenseEntitlement>,
  chosen: readonly Owner[],
): Set<string> {
  const meters = new Set<string>();
  for (const price of prices) {
    const slug = price.metered?.entitlementSlug;
    if (price.status === 'ACTIVE' && slug && grantBySlug.has(slug)) {
      meters.add(slug);
    }
  }
  for (const { found } of chosen) {
    for (const price of found.prices) {
      const slug = price.metered?.entitlementSlug;
      if (price.status === 'ACTIVE' && slug) {
        meters.add(slug);
      }
    }
  }

  return meters;
}

/** A sample is for an entitlement that an active price of the version or of an add-on in the list meters. */
function rejectUnmeteredSamples(
  samples: ReadonlyMap<string, Decimal>,
  meters: ReadonlySet<string>,
) {
  for (const slug of samples.keys()) {
    if (!meters.has(slug)) {
      throw problemOf(
        'InvalidSampleUsage',
        `no active price of this version or of the listed add-ons meters ${slug}`,
      );
    }
  }
}

/**
 * The period that starts at the boundary and the one that ends there. The usage of an
 * instance is rated from the start of its current period, which the usage that is kept must
 * reach back to, when there is any usage to read: an invoice that meters nothing does not
 * look at the history.
 */
function windowsOf(
  base: Price,
  instance: PreviewInstance | undefined,
  now: Date,
  metersAnything: boolean,
): Composition['windows'] {
  const months = base.billingPeriod ? PERIOD_MONTHS[base.billingPeriod] : 1;
  const arrears = {
    from: instance?.periodStart
      ? new Date(instance.periodStart)
      : addMonthsClamped(now, -months),
    to: now,
  };
  if (
    metersAnything &&
    instance?.retentionStart &&
    arrears.from.getTime() < Date.parse(instance.retentionStart)
  ) {
    throw problemOf(
      'OutsideRetention',
      `the usage history is kept from ${instance.retentionStart}: the period to rate starts before it`,
      422,
      [
        {
          location: 'retentionStart',
          message: 'retentionStart',
          value: instance.retentionStart,
        },
      ],
    );
  }

  return { advance: { from: now, to: addMonthsClamped(now, months) }, arrears };
}

/** The flat fee the invoice starts from. */
function baseDraft(base: Price, c: Composition): Draft {
  const service =
    base.billingTiming === 'ARREARS' ? c.windows.arrears : c.windows.advance;
  const unit = parseDecimal(base.unitAmountDecimal);

  return {
    displayOrder: base.displayOrder,
    line: {
      ...NULL_LINE_MEMBERS,
      amount: Number(roundToInteger(unit)),
      billingModel: base.billingModel,
      billingTiming: base.billingTiming,
      description: arithmetic(fromInteger(1), unit, c.currency, undefined),
      label: base.displayLabel || `${c.license.name} — base`,
      licensePriceId: base.id,
      quantity: '1',
      seq: 0,
      serviceFrom: service.from.toISOString(),
      serviceTo: service.to.toISOString(),
      type: 'BASE',
      unitAmountDecimal: base.unitAmountDecimal,
    },
    priceId: base.id,
    rank: RANK.BASE,
  };
}

/** The default fee of each add-on for the period of the base, in the quantity listed. */
function addonFeeDrafts(base: Price, c: Composition): Draft[] {
  return c.chosen.flatMap(({ entry, found }): Draft[] => {
    const fee = [...found.prices]
      .sort(byDisplayOrder)
      .find(
        (price) =>
          price.billingModel === 'FLAT_FEE' &&
          price.status === 'ACTIVE' &&
          price.isDefault &&
          price.billingPeriod === base.billingPeriod,
      );
    if (!fee) {
      return [];
    }
    const service =
      fee.billingTiming === 'ARREARS' ? c.windows.arrears : c.windows.advance;
    const unit = parseDecimal(fee.unitAmountDecimal);

    return [
      {
        displayOrder: fee.displayOrder,
        line: {
          ...NULL_LINE_MEMBERS,
          addonId: found.addon.id,
          addonPriceId: fee.id,
          amount: Number(
            roundToInteger(multiply(fromInteger(entry.quantity), unit)),
          ),
          billingModel: fee.billingModel,
          billingTiming: fee.billingTiming,
          description: arithmetic(
            fromInteger(entry.quantity),
            unit,
            c.currency,
            undefined,
          ),
          label: fee.displayLabel || `${found.addon.name} × ${entry.quantity}`,
          quantity: String(entry.quantity),
          seq: 0,
          serviceFrom: service.from.toISOString(),
          serviceTo: service.to.toISOString(),
          type: 'ADDON',
          unitAmountDecimal: fee.unitAmountDecimal,
        },
        priceId: fee.id,
        rank: RANK.ADDON,
      },
    ];
  });
}

/**
 * What the version and the add-ons grant of an entitlement together (the composition of
 * the limit of an instance): the limit a sample is rated against, and how far past it usage
 * is accepted.
 */
function effectiveGrantOf(slug: string, c: Composition): EffectiveGrant {
  const own = c.grantBySlug.get(slug);
  if (own?.value.type === 'number' && own.value.value === -1) {
    return { limit: -1, percent: -1 };
  }
  const contributions = c.chosen.flatMap(({ entry, found }) =>
    found.grants.flatMap((grant): AddonContribution[] =>
      grant.entitlementSlug === slug &&
      grant.value.type === 'number' &&
      typeof grant.value.value === 'number'
        ? [
            {
              addonEntitlementId: grant.id,
              addonId: found.addon.id,
              attachedAt: c.now.toISOString(),
              behavior: grant.overrideBehavior,
              entitlementSlug: slug,
              instanceAddonId: '',
              overagePercent: grant.limitCapExceededOveragePercent,
              quantity: entry.quantity,
              value: grant.value.value,
            },
          ]
        : [],
    ),
  );
  // An entitlement that only an add-on grants has nothing to add to.
  const granted = (
    own?.value.type === 'number'
      ? own
      : {
          entitlementSlug: slug,
          licenseSlug: c.license.slug,
          limitCapExceededOveragePercent: 0,
          value: { type: 'number', value: 0 },
        }
  ) as LicenseEntitlement & { value: { type: 'number'; value: number } };
  const { limit, limitCapExceededOveragePercent } = composeEffectiveNumber(
    granted,
    contributions,
    [],
  );

  return {
    limit:
      limit?.type === 'number' && typeof limit.value === 'number'
        ? limit.value
        : -1,
    percent: limitCapExceededOveragePercent ?? 0,
  };
}

/**
 * What was used of an entitlement: the journal of the instance over the period, or the
 * sample given. An entitlement with neither used nothing.
 */
function measureOf(slug: string, c: Composition): Measure | undefined {
  if (c.instance) {
    const used = c.instance.measure?.(
      slug,
      c.windows.arrears.from,
      c.windows.arrears.to,
    );
    if (!used) {
      return undefined;
    }
    const effective = effectiveGrantOf(slug, c);

    return {
      capped: false,
      limits:
        effective.limit < 0
          ? [{ limitValue: null, overagePercent: -1 }]
          : [
              {
                limitValue: String(effective.limit),
                overagePercent: Math.max(effective.percent, 0),
              },
            ],
      overage: parseDecimal(used.overage),
      unlimited: effective.limit < 0,
      usage: parseDecimal(used.usage),
    };
  }
  const sample = c.samples.get(slug);

  return sample === undefined
    ? undefined
    : measureSample(sample, effectiveGrantOf(slug, c));
}

/** The line of a metered price, rated on what was measured; none when nothing is billed. */
function meteredDraft(
  price: Price,
  owner: Owner | undefined,
  c: Composition,
): Draft | undefined {
  const slug = price.metered?.entitlementSlug;
  // A price of the version meters what the version grants; one of an add-on, what it grants.
  const meters =
    owner !== undefined || (slug !== undefined && c.grantBySlug.has(slug));
  if (price.status !== 'ACTIVE' || !price.metered || !slug || !meters) {
    return undefined;
  }
  const measure = measureOf(slug, c);
  const isOverage = price.billingModel === 'OVERAGE';
  if (!measure || (isOverage && measure.unlimited)) {
    return undefined;
  }
  const measured = isOverage ? measure.overage : measure.usage;
  const factor = parseDecimal(price.metered.saleUnitFactor);
  const quantity = divide(
    measured,
    isPositive(factor) ? factor : fromInteger(1),
    QUANTITY_PLACES,
  );
  if (!isPositive(measured) || !isPositive(quantity)) {
    return undefined;
  }
  const unit = parseDecimal(price.unitAmountDecimal);
  const entitlement = c.entitlements.find(
    (candidate) => candidate.slug === slug,
  );
  let description = arithmetic(
    quantity,
    unit,
    c.currency,
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

  return {
    displayOrder: price.displayOrder,
    line: {
      ...NULL_LINE_MEMBERS,
      addonId: owner?.found.addon.id ?? null,
      addonPriceId: owner ? price.id : null,
      amount: Number(roundToInteger(multiply(quantity, unit))),
      billingModel: price.billingModel,
      billingTiming: price.billingTiming,
      capped: measure.capped || undefined,
      description,
      entitlementSlug: slug,
      label:
        price.displayLabel ||
        `${entitlement?.name ?? slug}${isOverage ? ' — overage' : ''}`,
      licensePriceId: owner ? null : price.id,
      metering: {
        ledger: null,
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
        : null,
      quantity: formatDecimal(quantity),
      seq: 0,
      serviceFrom: c.windows.arrears.from.toISOString(),
      serviceTo: c.windows.arrears.to.toISOString(),
      type: isOverage ? 'OVERAGE' : 'USAGE',
      unitAmountDecimal: price.unitAmountDecimal,
    },
    priceId: price.id,
    rank: isOverage ? RANK.OVERAGE : RANK.USAGE,
  };
}

/** The lines of the metered prices of the version and of the add-ons listed. */
function meteredDrafts(prices: readonly Price[], c: Composition): Draft[] {
  const owned = c.chosen.flatMap((owner) =>
    [...owner.found.prices]
      .sort(byDisplayOrder)
      .map((price) => meteredDraft(price, owner, c)),
  );

  return [
    ...prices.map((price) => meteredDraft(price, undefined, c)),
    ...owned,
  ].filter((draft): draft is Draft => draft !== undefined);
}

/**
 * The lines in the order of the API: by the start of the period each bills, then by type,
 * the display order of the price and its id.
 */
function numberedLines(drafts: Draft[]): InvoiceLine[] {
  return [...drafts]
    .sort(
      (left, right) =>
        left.line.serviceFrom.localeCompare(right.line.serviceFrom) ||
        left.rank - right.rank ||
        left.displayOrder - right.displayOrder ||
        left.priceId.localeCompare(right.priceId),
    )
    .map(({ line }, index) => ({ ...line, seq: index + 1 }));
}

/**
 * The voucher discounts the lines it bears on, as a redemption of it would at this boundary.
 * Nothing is redeemed, so a line names no redemption, and a preview has no identifiers.
 */
function discountLines(
  lines: InvoiceLine[],
  voucher: DiscountSource,
  c: Composition,
): InvoiceLine[] {
  return composeDiscounts({
    at: c.now.getTime(),
    currency: c.currency,
    invoiceId: 'preview',
    lines,
    sources: [voucher],
  }).map(({ line }) => ({ ...line, id: undefined, instanceVoucherId: null }));
}

/** Composes the preview; refuses as the API does. */
export function composeLicenseInvoicePreview(
  input: PreviewInput,
): InvoicePreview {
  const { grants, license, prices, scenario } = input;
  const world = input.world ?? NOTHING_ELSE;
  const now = world.now?.() ?? input.now;
  const samples = parseSamples(scenario.sampleUsage);
  if (scenario.instanceSlug !== undefined && samples.size > 0) {
    throw problemOf(
      'InvalidSampleUsage',
      'instanceSlug and sampleUsage are exclusive: rate the usage of one instance, or a sample',
    );
  }
  const ordered = [...prices].sort(byDisplayOrder);
  const base = basePriceOf(ordered, scenario.basePriceId);
  const { chosen, instance } = lookUp(scenario, world);
  const grantBySlug = new Map(
    grants.map((grant) => [grant.entitlementSlug, grant] as const),
  );
  const meters = metersOf(ordered, grantBySlug, chosen);
  const windows = windowsOf(base, instance, now, meters.size > 0);
  rejectUnmeteredSamples(samples, meters);
  const composition: Composition = {
    chosen,
    currency: base.currency,
    entitlements: input.entitlements,
    grantBySlug,
    instance,
    license,
    now,
    samples,
    windows,
  };

  const lines = numberedLines([
    baseDraft(base, composition),
    ...addonFeeDrafts(base, composition),
    ...meteredDrafts(ordered, composition),
  ]);
  const voucher = voucherOf(scenario, world);
  if (voucher) {
    lines.push(...discountLines(lines, voucher, composition));
  }
  // The server composes the totals: the mock adds the lines up so that the
  // console never has to.
  let subtotal = 0;
  let discountTotal = 0;
  for (const line of lines) {
    if (line.type === 'DISCOUNT') {
      discountTotal -= line.amount;
    } else {
      subtotal += line.amount;
    }
  }

  return {
    asOf: now.toISOString(),
    boundaryAt: now.toISOString(),
    currency: base.currency,
    discountTotal,
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
    total: subtotal - discountTotal,
    wouldHold: [],
  };
}
