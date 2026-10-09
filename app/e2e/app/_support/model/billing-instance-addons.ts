import { z } from 'zod';
import type {
  Addon,
  AddonQuantity,
  InstanceAddon,
  InstanceBilling,
  NewInstanceAddon,
  Price,
  SubscriptionAddon,
} from '@/api-client';
import { zInstanceAddon } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { ArmedProblems, type ArmedBillingProblem } from './armed-problems';
import type { AddonCatalogue, AddonHolders } from './billing-addon-catalogue';
import { BillingProblem } from './billing-problem';

const clone = <T>(value: T): T => structuredClone(value);

/** What the mocks arm to fail with a problem document, once. */
export type InstanceAddonOperation =
  | 'attachInstanceAddon'
  | 'detachInstanceAddon'
  | 'listInstanceAddons'
  | 'setInstanceAddonQuantity';

export const INSTANCE_ADDON_OPERATIONS: readonly InstanceAddonOperation[] = [
  'attachInstanceAddon',
  'detachInstanceAddon',
  'listInstanceAddons',
  'setInstanceAddonQuantity',
];

/** What an attachment adds to an entitlement of its instance, per unit of quantity. */
export type AddonContribution = {
  behavior: 'ADD' | 'MAX' | 'OVERRIDE';
  entitlementSlug: string;
  quantity: number;
  /** What one unit grants. */
  value: number;
};

/** What the attachments ask of the rest of the model. */
export type InstanceAddonsDeps = {
  catalogue: AddonCatalogue;
  /** Whether the organization has the instance. */
  isKnown(instanceSlug: string): boolean;
  /** The slug of the license family the instance is on, which decides which add-ons fit it. */
  licenseFamilyOf(instanceSlug: string): string | undefined;
  now(): number;
  /** Its subscription, live or ended. */
  subscriptionOf(instanceSlug: string): InstanceBilling | undefined;
};

export type SerializedInstanceAddons = {
  armedProblems: Array<[InstanceAddonOperation, ArmedBillingProblem]>;
  attachments: Record<string, InstanceAddon[]>;
  sequence: number;
};

/** A subscription that bills: the add-ons it holds are frozen and billed. */
const isLive = (subscription: InstanceBilling | undefined) =>
  subscription !== undefined &&
  (subscription.status === 'TRIAL' ||
    subscription.status === 'ACTIVE' ||
    subscription.status === 'PAST_DUE');

/**
 * The add-ons the instances hold, as the Core API serves them (api/internal/modules/
 * addons/attachinstanceaddon, setinstanceaddonquantity, detachinstanceaddon,
 * listinstanceaddons): attaching one runs the checks the API runs, in the order it
 * runs them, with the codes it gives, so that the console is exercised against the
 * reasons it will really be shown. An attachment applies at once; a live subscription
 * bills the quantity held at each boundary, with no proration and no refund. A
 * subscribe attaches its add-ons in the same step and refuses as a whole.
 */
export class InstanceAddons implements AddonHolders {
  private readonly problems = new ArmedProblems<InstanceAddonOperation>();
  private attachments: Record<string, InstanceAddon[]>;
  private sequence = 1;

  constructor(
    private readonly deps: InstanceAddonsDeps,
    seed: Record<string, InstanceAddon[]> = {},
  ) {
    this.attachments = Object.fromEntries(
      Object.entries(seed).map(([slug, addons]) => [
        slug,
        parseContract(
          z.array(zInstanceAddon),
          addons,
          `InstanceAddons seed[${slug}]`,
        ).map(clone),
      ]),
    );
  }

  static fromSerialized(
    deps: InstanceAddonsDeps,
    state: SerializedInstanceAddons,
  ): InstanceAddons {
    const model = new InstanceAddons(deps, state.attachments);
    model.sequence = state.sequence;
    for (const [operation, problem] of state.armedProblems) {
      model.problems.arm(operation, problem);
    }

    return model;
  }

  serialize(): SerializedInstanceAddons {
    return {
      armedProblems: this.problems.serialize(),
      attachments: clone(this.attachments),
      sequence: this.sequence,
    };
  }

  /** Arm the next call of an operation to fail with a problem document. One-shot. */
  armProblem(operation: InstanceAddonOperation, problem: ArmedBillingProblem) {
    this.problems.arm(operation, problem);
  }

  // --- What the catalogue asks of the instances -----------------------------------

  private active(instanceSlug: string): InstanceAddon[] {
    return (this.attachments[instanceSlug] ?? []).filter(
      (attached) => attached.removedAt === undefined,
    );
  }

  isBilled(addonSlug: string): boolean {
    return Object.entries(this.attachments).some(
      ([instanceSlug, attached]) =>
        isLive(this.deps.subscriptionOf(instanceSlug)) &&
        attached.some(
          (candidate) =>
            candidate.addonSlug === addonSlug &&
            candidate.removedAt === undefined,
        ),
    );
  }

  wasAttached(addonSlug: string): boolean {
    return Object.values(this.attachments).some((attached) =>
      attached.some((candidate) => candidate.addonSlug === addonSlug),
    );
  }

  /** What an instance holds now, for the model to compose invoices from: a read of the model, not a call of the API. */
  activeOf(instanceSlug: string): InstanceAddon[] {
    return clone(this.active(instanceSlug));
  }

  /** Every attachment, for a spec that asserts what the model holds. */
  snapshot(): Record<string, InstanceAddon[]> {
    return clone(this.attachments);
  }

  // --- Reads --------------------------------------------------------------------

  /** `GET /instances/{instanceSlug}/addons`: the add-ons an instance holds, in attachment order. */
  list(instanceSlug: string, includeRemoved = false): InstanceAddon[] {
    this.problems.consume('listInstanceAddons');
    if (!this.deps.isKnown(instanceSlug)) {
      throw new BillingProblem(
        404,
        'ListInstanceAddons.InstanceNotFound',
        `instance "${instanceSlug}" not found`,
      );
    }

    return clone(
      (this.attachments[instanceSlug] ?? []).filter(
        (attached) => includeRemoved || attached.removedAt === undefined,
      ),
    );
  }

  /** The numbers the active attachments of an instance add to its entitlements. */
  contributionsOf(instanceSlug: string): AddonContribution[] {
    return this.active(instanceSlug).flatMap((attached) =>
      this.deps.catalogue
        .grantsOf(attached.addonSlug)
        .flatMap((grant): AddonContribution[] =>
          grant.value.type === 'number' && typeof grant.value.value === 'number'
            ? [
                {
                  behavior: grant.overrideBehavior,
                  entitlementSlug: grant.entitlementSlug,
                  quantity: attached.quantity,
                  value: grant.value.value,
                },
              ]
            : [],
        ),
    );
  }

  // --- Checks -------------------------------------------------------------------

  private refuse(
    prefix: string,
    status: number,
    code: string,
    detail: string,
  ): never {
    throw new BillingProblem(status, `${prefix}.${code}`, detail);
  }

  /** The prices a live subscription bills for an add-on: the default flat fee of its period and the active metered ones. */
  private pricesFor(
    addon: Addon,
    subscription: InstanceBilling | undefined,
  ): Price[] {
    if (!isLive(subscription)) {
      return [];
    }

    return this.deps.catalogue
      .pricesOf(addon.slug)
      .filter(
        (price) =>
          price.status === 'ACTIVE' &&
          (price.billingModel !== 'FLAT_FEE' ||
            (price.isDefault &&
              price.billingPeriod === subscription?.billingPeriod)),
      );
  }

  /**
   * The checks of an attachment, in the order the API makes them. `held` is what the
   * instance holds already, and what the same request attaches before it.
   */
  private validate(
    prefix: string,
    instanceSlug: string,
    addonSlug: string,
    quantity: number,
    subscription: InstanceBilling | undefined,
    heldFamilies: ReadonlySet<string>,
  ): Addon {
    const addon = this.deps.catalogue.find(addonSlug);
    if (!addon) {
      this.refuse(
        prefix,
        404,
        'AddonNotFound',
        `add-on "${addonSlug}" not found`,
      );
    }
    if (addon.lifecycleState === 'ARCHIVED') {
      this.refuse(
        prefix,
        422,
        'AddonArchived',
        'an archived add-on version cannot be attached',
      );
    }
    if (quantity < 1) {
      this.refuse(prefix, 422, 'InvalidQuantity', 'quantity is at least 1');
    }
    if (addon.maxQuantity !== undefined && quantity > addon.maxQuantity) {
      this.refuse(
        prefix,
        422,
        'QuantityExceedsMax',
        `this add-on allows at most ${addon.maxQuantity} units`,
      );
    }
    const family = this.deps.licenseFamilyOf(instanceSlug);
    if (
      family === undefined ||
      !this.deps.catalogue.compatibleFamilies(addonSlug).includes(family)
    ) {
      this.refuse(
        prefix,
        422,
        'Incompatible',
        "this add-on version does not fit the instance's licence family",
      );
    }
    if (isLive(subscription)) {
      this.validateForBilling(prefix, addon, subscription as InstanceBilling);
    }
    if (heldFamilies.has(addon.familySlug)) {
      this.refuse(
        prefix,
        409,
        'FamilyAlreadyAttached',
        'the instance already holds a version of this add-on: change its quantity, or detach it first',
      );
    }

    return addon;
  }

  // What a live subscription could not bill: a draft, another currency, no price for
  // its period.
  private validateForBilling(
    prefix: string,
    addon: Addon,
    subscription: InstanceBilling,
  ) {
    if (addon.lifecycleState !== 'PUBLISHED') {
      this.refuse(
        prefix,
        422,
        'AddonNotPublished',
        'a billed instance takes only a PUBLISHED add-on version',
      );
    }
    const prices = this.deps.catalogue.pricesOf(addon.slug);
    const currencies = [...new Set(prices.map((price) => price.currency))];
    if (currencies.length > 0 && !currencies.includes(subscription.currency)) {
      this.refuse(
        prefix,
        422,
        'CurrencyMismatch',
        `the add-on is priced in ${currencies.join(', ')} and the subscription bills in ${subscription.currency}`,
      );
    }
    const priced = prices.some(
      (price) =>
        price.billingModel === 'FLAT_FEE' &&
        price.status === 'ACTIVE' &&
        price.isDefault &&
        price.billingPeriod === subscription.billingPeriod,
    );
    if (addon.pricingType === 'PAID' && !priced) {
      this.refuse(
        prefix,
        422,
        'NoPriceForBillingPeriod',
        `the add-on has no default ACTIVE price for the subscription's ${subscription.billingPeriod} period`,
      );
    }
  }

  private insert(
    instanceSlug: string,
    addon: Addon,
    quantity: number,
    subscription: InstanceBilling | undefined,
  ): InstanceAddon {
    const attached: InstanceAddon = {
      addonId: addon.id,
      addonSlug: addon.slug,
      attachedAt: new Date(this.deps.now()).toISOString(),
      familySlug: addon.familySlug,
      id: `instance-addon-${instanceSlug}-${this.sequence++}`,
      maxQuantity: addon.maxQuantity,
      name: addon.name,
      prices: this.pricesFor(addon, subscription),
      quantity,
    };
    this.attachments[instanceSlug] = [
      ...(this.attachments[instanceSlug] ?? []),
      parseContract(zInstanceAddon, attached, 'InstanceAddons attach'),
    ];

    return attached;
  }

  // --- Writes -------------------------------------------------------------------

  /** `POST /instances/{instanceSlug}/addons`. */
  attach(instanceSlug: string, body: NewInstanceAddon): InstanceAddon {
    const prefix = 'AttachInstanceAddon';
    this.problems.consume('attachInstanceAddon');
    if (!this.deps.isKnown(instanceSlug)) {
      this.refuse(
        prefix,
        404,
        'InstanceNotFound',
        `instance "${instanceSlug}" not found`,
      );
    }
    const subscription = this.deps.subscriptionOf(instanceSlug);
    const addon = this.validate(
      prefix,
      instanceSlug,
      body.addonSlug,
      body.quantity ?? 1,
      subscription,
      new Set(this.active(instanceSlug).map((attached) => attached.familySlug)),
    );

    return clone(
      this.insert(instanceSlug, addon, body.quantity ?? 1, subscription),
    );
  }

  /**
   * The add-ons a subscribe starts with: every one is checked against the
   * subscription about to be written, and one refused refuses the whole, with the
   * code of its own in the first error. `commit` then attaches them.
   */
  checkForSubscription(
    instanceSlug: string,
    entries: readonly SubscriptionAddon[],
    subscription: InstanceBilling,
  ): Array<{ addon: Addon; quantity: number }> {
    const held = new Set(
      this.active(instanceSlug).map((attached) => attached.familySlug),
    );

    return entries.map((entry, index) => {
      const quantity = entry.quantity ?? 1;
      try {
        const addon = this.validate(
          'AttachInstanceAddon',
          instanceSlug,
          entry.addonSlug,
          quantity,
          subscription,
          held,
        );
        held.add(addon.familySlug);

        return { addon, quantity };
      } catch (error) {
        if (!(error instanceof BillingProblem)) {
          throw error;
        }
        throw new BillingProblem(
          422,
          'SubscribeInstance.AddonInvalid',
          // As the API answers: the subscribe's own words in `detail`, the reason
          // of the add-on in the error that locates it.
          'an add-on cannot be attached',
          {
            errors: [
              {
                location: `body.addOns[${index}]`,
                message: error.message,
                value: { code: error.code },
              },
            ],
          },
        );
      }
    });
  }

  /** Attaches what `checkForSubscription` accepted, to the subscription that has now been written. */
  commit(
    instanceSlug: string,
    checked: ReadonlyArray<{ addon: Addon; quantity: number }>,
    subscription: InstanceBilling,
  ): InstanceAddon[] {
    return checked.map(({ addon, quantity }) =>
      clone(this.insert(instanceSlug, addon, quantity, subscription)),
    );
  }

  private findActive(
    instanceSlug: string,
    addonSlug: string,
    code: string,
  ): InstanceAddon {
    const found = (this.attachments[instanceSlug] ?? []).find(
      (attached) =>
        attached.addonSlug === addonSlug && attached.removedAt === undefined,
    );
    if (!found) {
      throw new BillingProblem(
        404,
        code,
        `the instance does not hold add-on "${addonSlug}"`,
      );
    }

    return found;
  }

  /** `PATCH /instances/{instanceSlug}/addons/{addonSlug}`: changes how many units the instance holds. */
  setQuantity(
    instanceSlug: string,
    addonSlug: string,
    body: AddonQuantity,
  ): InstanceAddon {
    this.problems.consume('setInstanceAddonQuantity');
    const attached = this.findActive(
      instanceSlug,
      addonSlug,
      'SetInstanceAddonQuantity.NotAttached',
    );
    if (body.quantity < 1) {
      this.refuse(
        'SetInstanceAddonQuantity',
        422,
        'InvalidQuantity',
        'quantity is at least 1',
      );
    }
    if (
      attached.maxQuantity !== undefined &&
      body.quantity > attached.maxQuantity
    ) {
      this.refuse(
        'SetInstanceAddonQuantity',
        422,
        'QuantityExceedsMax',
        `this add-on allows at most ${attached.maxQuantity} units`,
      );
    }
    attached.quantity = body.quantity;

    return clone(attached);
  }

  /** `DELETE /instances/{instanceSlug}/addons/{addonSlug}`: the attachment stays, marked removed. */
  detach(instanceSlug: string, addonSlug: string) {
    this.problems.consume('detachInstanceAddon');
    const attached = this.findActive(
      instanceSlug,
      addonSlug,
      'DetachInstanceAddon.NotAttached',
    );
    attached.removedAt = new Date(this.deps.now()).toISOString();
  }
}
