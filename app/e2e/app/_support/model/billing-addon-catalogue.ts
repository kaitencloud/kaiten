import { z } from 'zod';
import type {
  Addon,
  AddonChanges,
  AddonEntitlement,
  AddonFamily,
  AddonGrant,
  AddonFamilyVisibility,
  NewAddon,
  NewAddonGrant,
  NewAddonPrice,
  PageAddon,
  Price,
} from '@/api-client';
import {
  zAddon,
  zAddonEntitlement,
  zAddonFamily,
  zPrice,
} from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { buildPrice } from '../fixtures/build-pricing';
import { ArmedProblems, type ArmedBillingProblem } from './armed-problems';
import { type PageRequest, pageOfRows } from './billing-pages';
import { BillingProblem } from './billing-problem';

const clone = <T>(value: T): T => structuredClone(value);

/** A record of the contract the model changes in place: the contract marks its generated members readonly. */
type Editable<T> = { -readonly [K in keyof T]: T[K] };

/** What the mocks arm to fail with a problem document, once. */
export type AddonCatalogueOperation =
  | 'archiveAddon'
  | 'assignAddonEntitlement'
  | 'createAddon'
  | 'createAddonPrice'
  | 'deleteAddon'
  | 'deprecateAddonPrice'
  | 'listAddonCompatibility'
  | 'listAddonEntitlements'
  | 'listAddonFamilies'
  | 'listAddonPrices'
  | 'listAddons'
  | 'publishAddon'
  | 'removeAddonCompatibility'
  | 'setAddonCompatibility'
  | 'unarchiveAddon'
  | 'unassignAddonEntitlement'
  | 'updateAddon'
  | 'updateAddonEntitlement'
  | 'updateAddonFamily';

type EntitlementType = AddonEntitlement['entitlementType'];

/** What the catalogue asks of the instances to answer as the API does. */
export type AddonHolders = {
  /** Whether an instance with a live subscription holds the version: its grants and prices are frozen. */
  isBilled(addonSlug: string): boolean;
  /** Whether an instance ever held the version, removed or not: it is history and is not deleted. */
  wasAttached(addonSlug: string): boolean;
};

export type AddonCatalogueSeed = {
  /** What each version is declared compatible with, by the slug of the version: license family slugs. */
  compatibility?: Record<string, string[]>;
  /** The entitlements of the organization and their type: what a grant is checked against. */
  entitlements?: Record<string, EntitlementType>;
  /** What each version grants per unit of quantity, by the slug of the version. */
  grants?: Record<string, AddonEntitlement[]>;
  /** The license families that exist, by slug: compatibility refuses an unknown one. */
  licenseFamilies?: string[];
  /** The prices of each version, by its slug, in display order. */
  prices?: Record<string, Price[]>;
  /** The families listed in the public catalogue, by slug. */
  publicFamilies?: string[];
  /** Every version of every family, in any order. */
  versions?: Addon[];
};

export type SerializedAddonCatalogue = {
  armedProblems: Array<[AddonCatalogueOperation, ArmedBillingProblem]>;
  compatibility: Record<string, string[]>;
  entitlements: Record<string, EntitlementType>;
  grants: Record<string, AddonEntitlement[]>;
  lastVersions: Record<string, number>;
  licenseFamilies: string[];
  prices: Record<string, Price[]>;
  publicFamilies: string[];
  sequence: number;
  versions: Addon[];
};

const NOW = () => new Date().toISOString();

/**
 * The catalogue of add-ons as the Core API serves it (api/internal/modules/addons):
 * the families and their versions, what a version grants, what it is sold for and
 * which license families it fits, with the refusals the API gives and the codes it
 * gives them, so that the console is exercised against the reasons it will really be
 * shown. A version that an instance with a live subscription holds is frozen: its
 * grants and its prices answer 409 `*.BillingActive`, which the catalogue learns from
 * the instances through `holders`.
 */
export class AddonCatalogue {
  private readonly problems = new ArmedProblems<AddonCatalogueOperation>();
  private compatibility: Record<string, string[]>;
  private entitlements: Record<string, EntitlementType>;
  private grants: Record<string, Editable<AddonEntitlement>[]>;
  private lastVersions: Record<string, number> = {};
  private licenseFamilies: string[];
  private prices: Record<string, Editable<Price>[]>;
  private publicFamilies: string[];
  private sequence = 1;
  private versions: Editable<Addon>[];

  constructor(
    seed: AddonCatalogueSeed = {},
    private holders: AddonHolders = {
      isBilled: () => false,
      wasAttached: () => false,
    },
  ) {
    this.versions = parseContract(
      z.array(zAddon),
      seed.versions ?? [],
      'AddonCatalogue seed.versions',
    ).map(clone);
    for (const version of this.versions) {
      this.lastVersions[version.familySlug] = Math.max(
        this.lastVersions[version.familySlug] ?? 0,
        version.version,
      );
    }
    this.compatibility = clone(seed.compatibility ?? {});
    this.entitlements = clone(seed.entitlements ?? {});
    this.grants = Object.fromEntries(
      Object.entries(seed.grants ?? {}).map(([slug, grants]) => [
        slug,
        parseContract(
          z.array(zAddonEntitlement),
          grants,
          `AddonCatalogue seed.grants[${slug}]`,
        ).map(clone),
      ]),
    );
    this.licenseFamilies = [...(seed.licenseFamilies ?? [])];
    this.prices = Object.fromEntries(
      Object.entries(seed.prices ?? {}).map(([slug, prices]) => [
        slug,
        parseContract(
          z.array(zPrice),
          prices,
          `AddonCatalogue seed.prices[${slug}]`,
        ).map(clone),
      ]),
    );
    this.publicFamilies = [...(seed.publicFamilies ?? [])];
  }

  static fromSerialized(
    state: SerializedAddonCatalogue,
    holders?: AddonHolders,
  ): AddonCatalogue {
    const catalogue = new AddonCatalogue(
      {
        compatibility: state.compatibility,
        entitlements: state.entitlements,
        grants: state.grants,
        licenseFamilies: state.licenseFamilies,
        prices: state.prices,
        publicFamilies: state.publicFamilies,
        versions: state.versions,
      },
      holders,
    );
    catalogue.lastVersions = clone(state.lastVersions);
    catalogue.sequence = state.sequence;
    for (const [operation, problem] of state.armedProblems) {
      catalogue.problems.arm(operation, problem);
    }

    return catalogue;
  }

  serialize(): SerializedAddonCatalogue {
    return {
      armedProblems: this.problems.serialize(),
      compatibility: clone(this.compatibility),
      entitlements: clone(this.entitlements),
      grants: clone(this.grants),
      lastVersions: clone(this.lastVersions),
      licenseFamilies: [...this.licenseFamilies],
      prices: clone(this.prices),
      publicFamilies: [...this.publicFamilies],
      sequence: this.sequence,
      versions: clone(this.versions),
    };
  }

  /** Where the catalogue learns who holds a version: the instances are another part of the model. */
  setHolders(holders: AddonHolders) {
    this.holders = holders;
  }

  /** Arm the next call of an operation to fail with a problem document. One-shot. */
  armProblem(operation: AddonCatalogueOperation, problem: ArmedBillingProblem) {
    this.problems.arm(operation, problem);
  }

  /** Every version, for a spec that asserts what the model holds. */
  snapshot(): Addon[] {
    return clone(this.versions);
  }

  // --- Reading, for the instances -----------------------------------------------

  /** A version by its slug, or undefined: the instances look one up to attach it. */
  find(addonSlug: string): Addon | undefined {
    const found = this.versions.find((version) => version.slug === addonSlug);

    return found ? clone(found) : undefined;
  }

  /** The slugs of the license families a version fits. */
  compatibleFamilies(addonSlug: string): string[] {
    return [...(this.compatibility[addonSlug] ?? [])];
  }

  /** The grants of a version, as the instances compose them into effective values. */
  grantsOf(addonSlug: string): AddonEntitlement[] {
    return clone(this.grants[addonSlug] ?? []);
  }

  /** The prices of a version, flat and metered, active or not. */
  pricesOf(addonSlug: string): Price[] {
    return clone(this.prices[addonSlug] ?? []);
  }

  /** The type of an entitlement of the organization, for what is checked against one: a voucher boost. */
  entitlementTypeOf(slug: string): EntitlementType | undefined {
    return this.entitlements[slug];
  }

  /** Whether a version has this identifier: what a voucher names to apply to. */
  hasVersionId(id: string): boolean {
    return this.versions.some((version) => version.id === id);
  }

  /** Whether a price of any version has this identifier: what a voucher names to discount. */
  hasPriceId(id: string): boolean {
    return Object.values(this.prices).some((prices) =>
      prices.some((price) => price.id === id),
    );
  }

  // --- Errors -------------------------------------------------------------------

  private refuse(status: number, code: string, detail: string): never {
    throw new BillingProblem(status, code, detail);
  }

  private requireVersion(addonSlug: string, code: string): Editable<Addon> {
    const version = this.versions.find(
      (candidate) => candidate.slug === addonSlug,
    );
    if (!version) {
      this.refuse(404, code, `add-on "${addonSlug}" not found`);
    }

    return version;
  }

  private refuseBilled(operation: string, addonSlug: string) {
    if (this.holders.isBilled(addonSlug)) {
      this.refuse(
        409,
        `${operation}.BillingActive`,
        'an instance with a live subscription holds this add-on version: what it sells is frozen; publish a new version instead',
      );
    }
  }

  // --- Families -----------------------------------------------------------------

  private familyOf(slug: string): AddonFamily | undefined {
    const versions = this.versions
      .filter((version) => version.familySlug === slug)
      .sort((left, right) => right.version - left.version);
    if (versions.length === 0) {
      return undefined;
    }
    const current =
      versions.find((version) => version.isDefault) ??
      versions.find((version) => version.lifecycleState === 'PUBLISHED');

    return {
      currentVersion: current ? clone(current) : undefined,
      id: `addon-family-${slug}`,
      isPublic: this.publicFamilies.includes(slug),
      lastVersion: this.lastVersions[slug] ?? versions[0].version,
      slug,
      versions: clone(versions),
    };
  }

  /** `GET /addon-families`: every family with its versions, newest family first. */
  listFamilies(): AddonFamily[] {
    this.problems.consume('listAddonFamilies');
    const slugs = [
      ...new Set(this.versions.map((version) => version.familySlug)),
    ];

    return parseContract(
      z.array(zAddonFamily),
      slugs.flatMap((slug) => {
        const family = this.familyOf(slug);

        return family ? [family] : [];
      }),
      'AddonCatalogue listFamilies',
    );
  }

  /** `GET /addon-families/{familySlug}`. */
  getFamily(slug: string): AddonFamily {
    const family = this.familyOf(slug);
    if (!family) {
      this.refuse(
        404,
        'GetAddonFamily.NotFound',
        `add-on family "${slug}" not found`,
      );
    }

    return family;
  }

  /** `PATCH /addon-families/{familySlug}`: lists the family in the public catalogue, or takes it out. */
  updateFamily(slug: string, body: AddonFamilyVisibility): AddonFamily {
    this.problems.consume('updateAddonFamily');
    if (!this.familyOf(slug)) {
      this.refuse(
        404,
        'UpdateAddonFamily.NotFound',
        `add-on family "${slug}" not found`,
      );
    }
    this.publicFamilies = this.publicFamilies.filter(
      (candidate) => candidate !== slug,
    );
    if (body.isPublic) {
      this.publicFamilies.push(slug);
    }

    return this.getFamily(slug);
  }

  // --- Versions -----------------------------------------------------------------

  /** `GET /addons`: the versions, newest first, a cursor per page. */
  listVersions(
    filter: {
      familySlug?: string;
      lifecycleState?: Addon['lifecycleState'];
    },
    page: PageRequest = {},
  ): PageAddon {
    this.problems.consume('listAddons');

    return pageOfRows(
      clone(
        [...this.versions]
          .filter(
            (version) =>
              (!filter.familySlug ||
                version.familySlug === filter.familySlug) &&
              (!filter.lifecycleState ||
                version.lifecycleState === filter.lifecycleState),
          )
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      ),
      page,
      'Addons',
    );
  }

  /** `GET /addons/{addonSlug}`. */
  getVersion(addonSlug: string): Addon {
    return clone(this.requireVersion(addonSlug, 'GetAddon.NotFound'));
  }

  private checkMaxQuantity(operation: string, maxQuantity: number | undefined) {
    if (maxQuantity !== undefined && maxQuantity < 1) {
      this.refuse(
        422,
        `${operation}.InvalidMaxQuantity`,
        'maxQuantity is at least 1',
      );
    }
  }

  private clearDefault(familySlug: string, except?: string) {
    for (const version of this.versions) {
      if (
        version.familySlug === familySlug &&
        version.slug !== except &&
        version.isDefault
      ) {
        version.isDefault = false;
      }
    }
  }

  /** `POST /addons`: the first version of a new family, or the next one of the family named. */
  createVersion(body: NewAddon): Addon {
    this.problems.consume('createAddon');
    if (
      body.slug !== undefined &&
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)
    ) {
      this.refuse(
        422,
        'CreateAddon.InvalidSlug',
        `"${body.slug}" is not a valid slug`,
      );
    }
    this.checkMaxQuantity('CreateAddon', body.maxQuantity);
    const state = body.lifecycleState ?? 'PUBLISHED';
    if (body.isDefault && state !== 'PUBLISHED') {
      this.refuse(
        422,
        'CreateAddon.DefaultMustBePublished',
        "an add-on can only be its family's default while it is PUBLISHED",
      );
    }
    const familySlug = this.resolveFamily(body);
    const familyIsNew = !this.versions.some(
      (version) => version.familySlug === familySlug,
    );
    const version = (this.lastVersions[familySlug] ?? 0) + 1;
    const slug =
      body.slug ?? (familyIsNew ? familySlug : `${familySlug}-v${version}`);
    if (this.versions.some((candidate) => candidate.slug === slug)) {
      this.refuse(
        409,
        'CreateAddon.SlugConflict',
        `an add-on version with slug "${slug}" already exists`,
      );
    }
    if (body.isDefault) {
      this.clearDefault(familySlug);
    }
    const at = NOW();
    const created: Addon = {
      createdAt: at,
      description: body.description,
      familySlug,
      id: `addon-${slug}`,
      isDefault: Boolean(body.isDefault),
      lifecycleState: state,
      maxQuantity: body.maxQuantity,
      name: body.name,
      pricingType: body.pricingType,
      slug,
      updatedAt: at,
      version,
      versionName: body.versionName ?? `Version - ${version}`,
    };
    this.lastVersions[familySlug] = version;
    this.versions.unshift(
      parseContract(zAddon, created, 'AddonCatalogue createVersion'),
    );

    return clone(created);
  }

  // The family a new version joins: the one named, else a new one, which takes the slug
  // of its first version (or one made from the name).
  private resolveFamily(body: NewAddon): string {
    if (body.familySlug === undefined && body.familyId === undefined) {
      const slug =
        body.slug ??
        body.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      if (this.versions.some((version) => version.familySlug === slug)) {
        this.refuse(
          409,
          'CreateAddon.SlugConflict',
          `an add-on family with slug "${slug}" already exists`,
        );
      }

      return slug;
    }
    const known = this.versions.find(
      (version) =>
        version.familySlug === body.familySlug ||
        `addon-family-${version.familySlug}` === body.familyId,
    );
    if (!known) {
      this.refuse(404, 'CreateAddon.FamilyNotFound', 'add-on family not found');
    }

    return known.familySlug;
  }

  /** `PUT /addons/{addonSlug}`: replaces the name, the description, the version name, the default flag and the maximum. */
  updateVersion(addonSlug: string, body: AddonChanges): Addon {
    this.problems.consume('updateAddon');
    this.checkMaxQuantity('UpdateAddon', body.maxQuantity);
    const version = this.requireVersion(addonSlug, 'UpdateAddon.NotFound');
    if (body.isDefault && version.lifecycleState !== 'PUBLISHED') {
      this.refuse(
        422,
        'UpdateAddon.DefaultMustBePublished',
        "an add-on can only be its family's default while it is PUBLISHED",
      );
    }
    if (body.isDefault && !version.isDefault) {
      this.clearDefault(version.familySlug, version.slug);
    }
    version.name = body.name;
    version.description = body.description;
    version.versionName = body.versionName ?? `Version - ${version.version}`;
    version.isDefault = body.isDefault;
    version.maxQuantity = body.maxQuantity;
    version.updatedAt = NOW();

    return clone(version);
  }

  /** `POST /addons/{addonSlug}/publish|archive|unarchive`. */
  transition(
    addonSlug: string,
    kind: 'archive' | 'publish' | 'unarchive',
  ): Addon {
    const rules = {
      archive: {
        from: 'PUBLISHED',
        notFound: 'ArchiveAddon.NotFound',
        operation: 'archiveAddon',
        to: 'ARCHIVED',
        wrongState: 'ArchiveAddon.NotPublished',
      },
      publish: {
        from: 'DRAFT',
        notFound: 'PublishAddon.NotFound',
        operation: 'publishAddon',
        to: 'PUBLISHED',
        wrongState: 'PublishAddon.NotADraft',
      },
      unarchive: {
        from: 'ARCHIVED',
        notFound: 'UnarchiveAddon.NotFound',
        operation: 'unarchiveAddon',
        to: 'PUBLISHED',
        wrongState: 'UnarchiveAddon.NotArchived',
      },
    } as const;
    const rule = rules[kind];
    this.problems.consume(rule.operation);
    const version = this.requireVersion(addonSlug, rule.notFound);
    if (version.lifecycleState !== rule.from) {
      this.refuse(
        409,
        rule.wrongState,
        `add-on "${addonSlug}" is ${version.lifecycleState}, not ${rule.from}`,
      );
    }
    if (version.isDefault && kind === 'archive') {
      this.refuse(
        409,
        'ArchiveAddon.DefaultMustBePublished',
        `add-on "${addonSlug}" is its family's default, and a default must stay PUBLISHED; unset it first`,
      );
    }
    version.lifecycleState = rule.to;
    version.updatedAt = NOW();

    return clone(version);
  }

  /** `DELETE /addons/{addonSlug}`: a version nothing holds or ever held, and its family with its last version. */
  deleteVersion(addonSlug: string) {
    this.problems.consume('deleteAddon');
    const version = this.requireVersion(addonSlug, 'DeleteAddon.NotFound');
    if (this.holders.wasAttached(addonSlug)) {
      this.refuse(
        409,
        'DeleteAddon.InUseConflict',
        'this add-on version was attached to an instance: it is history and cannot be deleted; archive it instead',
      );
    }
    if ((this.grants[addonSlug] ?? []).length > 0) {
      this.refuse(
        409,
        'DeleteAddon.InUseConflict',
        'this add-on version still grants entitlements: remove its grants first',
      );
    }
    this.versions = this.versions.filter((candidate) => candidate !== version);
    delete this.prices[addonSlug];
    delete this.compatibility[addonSlug];
    if (
      !this.versions.some(
        (candidate) => candidate.familySlug === version.familySlug,
      )
    ) {
      this.publicFamilies = this.publicFamilies.filter(
        (family) => family !== version.familySlug,
      );
      delete this.lastVersions[version.familySlug];
    }
  }

  // --- Grants -------------------------------------------------------------------

  /** `GET /addons/{addonSlug}/entitlements`. */
  listGrants(addonSlug: string): AddonEntitlement[] {
    this.problems.consume('listAddonEntitlements');
    this.requireVersion(addonSlug, 'ListAddonEntitlements.AddonNotFound');

    return clone(this.grants[addonSlug] ?? []);
  }

  // What a grant is checked against, as the API does: the value shape of the entitlement
  // and, for a number, the overage percentage it may carry.
  private normalizeGrant(
    operation: string,
    entitlementType: EntitlementType,
    body: AddonGrant | NewAddonGrant,
  ): Pick<
    AddonEntitlement,
    'limitCapExceededOveragePercent' | 'overrideBehavior' | 'value'
  > {
    const { type, value } = body.value as { type?: unknown; value?: unknown };
    const expected =
      entitlementType === 'BOOLEAN'
        ? 'boolean'
        : entitlementType === 'CONFIG'
          ? 'object'
          : 'number';
    const valid =
      type === expected &&
      (expected === 'number'
        ? typeof value === 'number'
        : expected === 'boolean'
          ? typeof value === 'boolean'
          : typeof value === 'object' && value !== null);
    if (!valid) {
      this.refuse(
        422,
        `${operation}.InvalidValue`,
        `value.type must be "${expected}" for ${entitlementType} entitlements`,
      );
    }
    const percent = body.limitCapExceededOveragePercent;
    if (percent !== undefined) {
      const invalid = (detail: string): never =>
        this.refuse(
          422,
          `${operation}.InvalidLimitCapExceededOveragePercent`,
          detail,
        );
      if (expected !== 'number') {
        invalid(
          'limitCapExceededOveragePercent is only allowed when value.type is "number"',
        );
      }
      if (value === -1 && percent !== -1) {
        invalid(
          'limitCapExceededOveragePercent must be -1 when the entitlement value is unlimited',
        );
      }
      if (value !== -1 && percent < 0) {
        invalid(
          'limitCapExceededOveragePercent must be -1 (unlimited) or >= 0',
        );
      }
    }

    return {
      limitCapExceededOveragePercent: percent,
      overrideBehavior: body.overrideBehavior ?? 'MAX',
      value: body.value,
    };
  }

  /** `POST /addons/{addonSlug}/entitlements`. */
  assignGrant(addonSlug: string, body: NewAddonGrant): AddonEntitlement {
    this.problems.consume('assignAddonEntitlement');
    this.requireVersion(addonSlug, 'AssignAddonEntitlement.AddonNotFound');
    this.refuseBilled('AssignAddonEntitlement', addonSlug);
    const type = this.entitlements[body.entitlementSlug];
    if (!type) {
      this.refuse(
        404,
        'AssignAddonEntitlement.EntitlementNotFound',
        `entitlement "${body.entitlementSlug}" not found`,
      );
    }
    const grants = this.grants[addonSlug] ?? [];
    if (
      grants.some((grant) => grant.entitlementSlug === body.entitlementSlug)
    ) {
      this.refuse(
        409,
        'AssignAddonEntitlement.AlreadyAssigned',
        'the add-on version already grants this entitlement',
      );
    }
    const grant: AddonEntitlement = {
      entitlementSlug: body.entitlementSlug,
      entitlementType: type,
      id: `grant-${addonSlug}-${body.entitlementSlug}`,
      ...this.normalizeGrant('AssignAddonEntitlement', type, body),
    };
    this.grants[addonSlug] = [
      ...grants,
      parseContract(zAddonEntitlement, grant, 'AddonCatalogue assignGrant'),
    ];

    return clone(grant);
  }

  private requireGrant(
    addonSlug: string,
    entitlementSlug: string,
    code: string,
  ): AddonEntitlement {
    this.requireVersion(addonSlug, code);
    const grant = (this.grants[addonSlug] ?? []).find(
      (candidate) => candidate.entitlementSlug === entitlementSlug,
    );
    if (!grant) {
      this.refuse(
        404,
        code,
        `the add-on version does not grant "${entitlementSlug}"`,
      );
    }

    return grant;
  }

  /** `PUT /addons/{addonSlug}/entitlements/{entitlementSlug}`. */
  updateGrant(
    addonSlug: string,
    entitlementSlug: string,
    body: AddonGrant,
  ): AddonEntitlement {
    this.problems.consume('updateAddonEntitlement');
    const grant = this.requireGrant(
      addonSlug,
      entitlementSlug,
      'UpdateAddonEntitlement.NotFound',
    );
    this.refuseBilled('UpdateAddonEntitlement', addonSlug);
    Object.assign(
      grant,
      this.normalizeGrant(
        'UpdateAddonEntitlement',
        grant.entitlementType,
        body,
      ),
    );
    // The overage is replaced, not merged: a member left out inherits the license's.
    if (body.limitCapExceededOveragePercent === undefined) {
      delete grant.limitCapExceededOveragePercent;
    }

    return clone(grant);
  }

  /** `DELETE /addons/{addonSlug}/entitlements/{entitlementSlug}`. */
  unassignGrant(addonSlug: string, entitlementSlug: string) {
    this.problems.consume('unassignAddonEntitlement');
    this.requireGrant(
      addonSlug,
      entitlementSlug,
      'UnassignAddonEntitlement.NotFound',
    );
    this.refuseBilled('UnassignAddonEntitlement', addonSlug);
    if (
      (this.prices[addonSlug] ?? []).some(
        (price) =>
          price.status === 'ACTIVE' &&
          price.metered?.entitlementSlug === entitlementSlug,
      )
    ) {
      this.refuse(
        409,
        'UnassignAddonEntitlement.MeteredByPrice',
        'an ACTIVE price of the version meters this entitlement: deprecate the price first',
      );
    }
    this.grants[addonSlug] = (this.grants[addonSlug] ?? []).filter(
      (grant) => grant.entitlementSlug !== entitlementSlug,
    );
  }

  // --- Prices -------------------------------------------------------------------

  /** `GET /addons/{addonSlug}/prices`. */
  listPrices(addonSlug: string, status?: Price['status']): Price[] {
    this.problems.consume('listAddonPrices');
    this.requireVersion(addonSlug, 'ListAddonPrices.AddonNotFound');

    return clone(
      [...(this.prices[addonSlug] ?? [])]
        .filter((price) => !status || price.status === status)
        .sort(
          (left, right) =>
            left.displayOrder - right.displayOrder ||
            left.id.localeCompare(right.id),
        ),
    );
  }

  /** `POST /addons/{addonSlug}/prices`: a flat fee, or a metered price the API takes and never values. */
  createPrice(addonSlug: string, body: NewAddonPrice): Price {
    this.problems.consume('createAddonPrice');
    const version = this.requireVersion(
      addonSlug,
      'CreateAddonPrice.AddonNotFound',
    );
    if (body.billingModel === 'FLAT_FEE' && body.billingPeriod === undefined) {
      this.refuse(
        422,
        'CreateAddonPrice.BillingPeriodRequired',
        'billingPeriod is required on a FLAT_FEE price',
      );
    }
    if (!/^\d+(\.\d{1,12})?$/.test(body.unitAmountDecimal)) {
      this.refuse(
        422,
        'CreateAddonPrice.InvalidAmount',
        'unitAmountDecimal is a decimal string of minor units, with at most 12 decimals',
      );
    }
    if (version.lifecycleState === 'ARCHIVED') {
      this.refuse(
        409,
        'CreateAddonPrice.VersionArchived',
        'an archived add-on version takes no new price',
      );
    }
    this.refuseBilled('CreateAddonPrice', addonSlug);
    const prices = this.prices[addonSlug] ?? [];
    if (prices.length > 0 && prices[0].currency !== body.currency) {
      this.refuse(
        422,
        'CreateAddonPrice.CurrencyMismatch',
        'this add-on version already has prices in another currency: one currency per version',
      );
    }
    if (body.isDefault && body.billingPeriod !== undefined) {
      for (const price of prices) {
        if (price.isDefault && price.billingPeriod === body.billingPeriod) {
          price.isDefault = false;
        }
      }
    }
    const created = parseContract(
      zPrice,
      buildPrice({
        billingModel: body.billingModel,
        billingPeriod: body.billingPeriod,
        billingTiming: body.billingTiming,
        createdAt: NOW(),
        currency: body.currency,
        displayLabel: body.displayLabel,
        displayOrder: body.displayOrder ?? 0,
        id: `price-${addonSlug}-${this.sequence++}`,
        isDefault: Boolean(body.isDefault),
        unitAmountDecimal: body.unitAmountDecimal,
      }),
      'AddonCatalogue createPrice',
    );
    this.prices[addonSlug] = [...prices, created];

    return clone(created);
  }

  /** `POST /addons/{addonSlug}/prices/{priceId}/deprecate`: never the default price of a period. */
  deprecatePrice(addonSlug: string, priceId: string): Price {
    this.problems.consume('deprecateAddonPrice');
    this.requireVersion(addonSlug, 'DeprecateAddonPrice.AddonNotFound');
    const price = (this.prices[addonSlug] ?? []).find(
      (candidate) => candidate.id === priceId,
    );
    if (!price) {
      this.refuse(
        404,
        'DeprecateAddonPrice.NotFound',
        `price ${priceId} not found`,
      );
    }
    if (price.status === 'DEPRECATED') {
      this.refuse(
        409,
        'DeprecateAddonPrice.AlreadyDeprecated',
        'the price is already deprecated',
      );
    }
    if (price.isDefault) {
      this.refuse(
        409,
        'DeprecateAddonPrice.IsDefault',
        'the default price of a period bills every instance holding this version; retire it through a new add-on version',
      );
    }
    price.status = 'DEPRECATED';
    price.deprecatedAt = NOW();
    price.updatedAt = price.deprecatedAt;

    return clone(price);
  }

  // --- Compatibility ------------------------------------------------------------

  /** `GET /addons/{addonSlug}/compatible-license-families`. */
  listCompatibility(addonSlug: string): { familySlugs: string[] } {
    this.problems.consume('listAddonCompatibility');
    this.requireVersion(addonSlug, 'ListAddonCompatibility.AddonNotFound');

    return { familySlugs: this.compatibleFamilies(addonSlug) };
  }

  /** `PUT /addons/{addonSlug}/compatible-license-families/{familySlug}`: idempotent. */
  setCompatibility(addonSlug: string, familySlug: string) {
    this.problems.consume('setAddonCompatibility');
    this.requireVersion(addonSlug, 'SetAddonCompatibility.AddonNotFound');
    this.requireLicenseFamily(
      familySlug,
      'SetAddonCompatibility.FamilyNotFound',
    );
    const slugs = this.compatibility[addonSlug] ?? [];
    if (!slugs.includes(familySlug)) {
      this.compatibility[addonSlug] = [...slugs, familySlug];
    }
  }

  /** `DELETE /addons/{addonSlug}/compatible-license-families/{familySlug}`: idempotent. */
  removeCompatibility(addonSlug: string, familySlug: string) {
    this.problems.consume('removeAddonCompatibility');
    this.requireVersion(addonSlug, 'RemoveAddonCompatibility.AddonNotFound');
    this.requireLicenseFamily(
      familySlug,
      'RemoveAddonCompatibility.FamilyNotFound',
    );
    this.compatibility[addonSlug] = (
      this.compatibility[addonSlug] ?? []
    ).filter((slug) => slug !== familySlug);
  }

  private requireLicenseFamily(familySlug: string, code: string) {
    if (!this.licenseFamilies.includes(familySlug)) {
      this.refuse(404, code, `license family "${familySlug}" not found`);
    }
  }
}
