import { z } from 'zod';
import type {
  InstanceWritable,
  Customer,
  DeploymentZone,
  EntitlementUsage,
  Instance,
  License,
  LicenseEntitlement,
  LicenseFamilyView,
  PatchInstanceBody,
} from '@/api-client';
import type {
  GetCustomersWithInstancesQuery,
  GetInstancesWithRelationsQuery,
  MetadataFieldsQuery,
} from '@/api-client/graphql/graphql';
import {
  zInstanceWritable,
  zCustomer,
  zDeploymentZone,
  zInstance,
  zLicense,
  zLicenseEntitlement,
  zPatchInstanceBody,
} from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { zServedEntitlementUsage } from '../contracts/served-entitlement-usage';
import type { AddonContribution } from './billing-instance-addons';
import type { BoostContribution } from './billing-vouchers';
import { BillingProblem } from './billing-problem';
import { composeEffectiveNumber } from './effective-entitlement';
import { ErrorInjector } from './error-injector';
import {
  InstanceUsageHistory,
  type InstanceUsageHistorySeed,
  type SerializedInstanceUsageHistory,
} from './instance-usage-history';
import { listLicenseFamilyViews } from './license-families';

type CustomerListEntry =
  GetCustomersWithInstancesQuery['customers']['items'][number];
type CustomerListInstance = CustomerListEntry['instances'][number];
type InstanceListRow =
  GetInstancesWithRelationsQuery['instances']['items'][number];
type MetadataFieldRow = MetadataFieldsQuery['metadataFields']['items'][number];

type InstanceErrorOp = 'create' | 'update' | 'delete';

const DEFAULT_ACTOR = {
  id: 'user-e2e',
  name: 'E2E Tester',
} as const;

/**
 * What the subscription of an instance leaves in the way of changing it or
 * deleting it: its status while it lives or has just ended, and the invoices
 * that are not settled yet.
 */
export type InstanceBillingBlock = {
  status: 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'TRIAL';
  unpaidInvoiceIds: string[];
};

export type InstanceAppModelSeed = InstanceUsageHistorySeed & {
  /** The instances the billing refuses to change or delete, by slug. */
  billingBlocks?: Record<string, InstanceBillingBlock>;
  customers?: Customer[];
  // Zones the instance list and detail page offer as deploy / migrate targets.
  deploymentZones?: DeploymentZone[];
  // Active MetadataField declarations for INSTANCE. They drive the typed
  // metadata card on the detail page and the metadata step of the form.
  metadataFields?: MetadataFieldRow[];
  entitlementUsagesByInstance?: Record<string, EntitlementUsage[]>;
  instances?: Instance[];
  licenseEntitlements?: LicenseEntitlement[];
  licenses?: License[];
};

export type SerializedInstanceAppModel = Required<
  Omit<InstanceAppModelSeed, keyof InstanceUsageHistorySeed>
> & {
  clock: number;
  pendingErrors: Array<[InstanceErrorOp, number]>;
  sequence: number;
  /** The usage history; a state stored before it existed has none. */
  usageHistory?: SerializedInstanceUsageHistory;
};

const clone = <T>(value: T): T => structuredClone(value);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const toGraphqlLicenseType = (value: License['type']) => value;

export class InstanceAppModel {
  private billingBlocks: Record<string, InstanceBillingBlock>;
  private clock = Date.parse('2026-03-01T08:00:00.000Z');
  private customers: Customer[];
  private deploymentZones: DeploymentZone[];
  private metadataFields: MetadataFieldRow[];
  private entitlementUsagesByInstance: Record<string, EntitlementUsage[]>;
  private instances: Instance[];
  private licenseEntitlements: LicenseEntitlement[];
  private licenses: License[];
  private sequence: number;
  /** The journal of the entitlements of the instances, and what the organization keeps of it. */
  usageHistory: InstanceUsageHistory;
  private readonly errors = new ErrorInjector<InstanceErrorOp>();

  /**
   * Arm the next call to `op` to fail with the given HTTP status. One-shot.
   */
  setNextError(op: InstanceErrorOp, status: number) {
    this.errors.setNextError(op, status);
  }

  static fromSerialized(state: SerializedInstanceAppModel) {
    const model = new InstanceAppModel({
      billingBlocks: state.billingBlocks,
      customers: state.customers,
      deploymentZones: state.deploymentZones,
      metadataFields: state.metadataFields,
      entitlementUsagesByInstance: state.entitlementUsagesByInstance,
      instances: state.instances,
      licenseEntitlements: state.licenseEntitlements,
      licenses: state.licenses,
    });
    model.clock = state.clock;
    model.sequence = state.sequence;
    model.errors.restore(state.pendingErrors);
    if (state.usageHistory) {
      model.usageHistory = InstanceUsageHistory.fromSerialized(
        state.usageHistory,
      );
    }
    return model;
  }

  serializeForMsw(): SerializedInstanceAppModel {
    return {
      billingBlocks: clone(this.billingBlocks),
      clock: this.clock,
      customers: clone(this.customers),
      deploymentZones: clone(this.deploymentZones),
      metadataFields: clone(this.metadataFields),
      entitlementUsagesByInstance: clone(this.entitlementUsagesByInstance),
      instances: clone(this.instances),
      licenseEntitlements: clone(this.licenseEntitlements),
      licenses: clone(this.licenses),
      pendingErrors: this.errors.snapshot(),
      sequence: this.sequence,
      usageHistory: this.usageHistory.serialize(),
    };
  }

  constructor(seed: InstanceAppModelSeed = {}) {
    this.billingBlocks = clone(seed.billingBlocks ?? {});
    this.usageHistory = new InstanceUsageHistory({
      retentionStart: seed.retentionStart,
      usageReports: seed.usageReports,
    });
    this.customers = parseContract(
      z.array(zCustomer),
      seed.customers ?? [],
      'InstanceAppModel seed.customers',
    );
    this.deploymentZones = parseContract(
      z.array(zDeploymentZone),
      seed.deploymentZones ?? [],
      'InstanceAppModel seed.deploymentZones',
    );
    // Not contract-parsed: the shape is the GraphQL projection, which has no
    // generated zod schema of its own.
    this.metadataFields = clone(seed.metadataFields ?? []);
    this.entitlementUsagesByInstance = parseContract(
      z.record(z.string(), z.array(zServedEntitlementUsage)),
      seed.entitlementUsagesByInstance ?? {},
      'InstanceAppModel seed.entitlementUsagesByInstance',
    );
    this.instances = parseContract(
      z.array(zInstance),
      seed.instances ?? [],
      'InstanceAppModel seed.instances',
    );
    this.licenseEntitlements = parseContract(
      z.array(zLicenseEntitlement),
      seed.licenseEntitlements ?? [],
      'InstanceAppModel seed.licenseEntitlements',
    );
    this.licenses = parseContract(
      z.array(zLicense),
      seed.licenses ?? [],
      'InstanceAppModel seed.licenses',
    );
    this.sequence = this.instances.length + 1;

    const timestamps = this.instances.flatMap((instance) => [
      Date.parse(instance.createdAt),
      Date.parse(instance.updatedAt),
    ]);
    const latestTimestamp =
      timestamps.length > 0 ? Math.max(...timestamps) : null;

    if (latestTimestamp != null && Number.isFinite(latestTimestamp)) {
      this.clock = latestTimestamp;
    }
  }

  listCustomers() {
    return clone(this.customers);
  }

  getCustomer(customerSlug: string) {
    return clone(this.findCustomerBySlug(customerSlug));
  }

  listLicenses() {
    return clone(this.licenses);
  }

  /** GET /license-families, which the license catalogue reads beside them. */
  listLicenseFamilies(): LicenseFamilyView[] {
    return listLicenseFamilyViews(this.licenses);
  }

  listDeploymentZones() {
    return clone(this.deploymentZones);
  }

  getMetadataFields(): MetadataFieldsQuery {
    return {
      metadataFields: {
        hasMore: false,
        nextCursor: null,
        items: clone(this.metadataFields),
      },
    };
  }

  getLicense(licenseSlug: string) {
    return clone(this.findLicenseBySlug(licenseSlug));
  }

  getCustomersWithInstances(): GetCustomersWithInstancesQuery {
    return {
      customers: {
        hasMore: false,
        nextCursor: null,
        items: this.customers.map((customer) => ({
          createdAt: customer.createdAt,
          domain: customer.domain ?? null,
          externalCustomerId: customer.externalCustomerId ?? null,
          integrations: customer.integrations ?? {},
          instances: this.instancesForCustomer(customer.slug ?? ''),
          name: customer.name,
          slug: customer.slug ?? '',
          updatedAt: customer.updatedAt,
        })),
      },
    };
  }

  getLicenseEntitlements(licenseSlug: string) {
    return clone(
      this.licenseEntitlements.filter(
        (entitlement) => entitlement.licenseSlug === licenseSlug,
      ),
    );
  }

  getEntitlementsUsageMetrics(instanceSlug: string) {
    this.findInstance(instanceSlug);
    return clone(this.entitlementUsagesByInstance[instanceSlug] ?? []);
  }

  /**
   * What the add-ons and the boosts an instance holds make of its entitlements, which
   * they change at once. The `limit` of an entitlement usage is the effective value of
   * the instance (the cap its counter is measured against), composed as the API composes
   * it from what its license grants, what each attachment grants per unit of quantity
   * and what each boost does (see `composeEffectiveNumber`), and the usage says why: its
   * `provenance`, and the effective overage percent. The counter (`value`) is the usage,
   * which an attachment does not touch. Only a number the license grants is recomposed:
   * it is the one the mocks have a base for.
   */
  applyAddonContributions(
    instanceSlug: string,
    contributions: readonly AddonContribution[],
    boosts: readonly BoostContribution[] = [],
  ) {
    const { licenseSlug } = this.findInstance(instanceSlug);
    for (const usage of this.entitlementUsagesByInstance[instanceSlug] ?? []) {
      const grant = this.licenseEntitlements.find(
        (candidate) =>
          candidate.licenseSlug === licenseSlug &&
          candidate.entitlementSlug === usage.entitlementSlug,
      );
      if (grant?.value.type !== 'number' || grant.value.value === -1) {
        continue;
      }
      Object.assign(
        usage,
        composeEffectiveNumber(
          grant as typeof grant & { value: { type: 'number'; value: number } },
          contributions.filter(
            ({ entitlementSlug }) => entitlementSlug === usage.entitlementSlug,
          ),
          boosts.filter(
            ({ entitlementSlug }) => entitlementSlug === usage.entitlementSlug,
          ),
        ),
      );
    }
  }

  listInstances() {
    return clone(this.instances);
  }

  getInstancesWithRelations(): GetInstancesWithRelationsQuery {
    return {
      instances: {
        hasMore: false,
        nextCursor: null,
        items: this.instances.map((instance) =>
          this.toInstanceListRow(instance),
        ),
      },
    };
  }

  getInstance(instanceSlug: string) {
    return clone(this.findInstance(instanceSlug));
  }

  createInstance(body: InstanceWritable) {
    const input = parseContract(
      zInstanceWritable,
      body,
      'InstanceAppModel.createInstance body',
    );
    this.errors.consume('create');
    const customer = this.findCustomerById(input.customerId);
    const license = this.findLicense(input.licenseId);
    const timestamp = this.nextTimestamp();
    const instance: Instance = {
      createdAt: timestamp,
      createdBy: DEFAULT_ACTOR,
      customerId: customer.id,
      customerSlug: customer.slug ?? slugify(customer.name),
      deploymentZoneId: input.deploymentZoneId,
      description: input.description,
      endLicenseDate: input.endLicenseDate,
      id: `instance-${this.sequence}`,
      licenseId: license.id,
      licenseSlug: license.slug ?? slugify(license.name),
      metadata: clone(input.metadata ?? {}),
      name: input.name,
      slug: this.createUniqueSlug(input.slug ?? input.name),
      startLicenseDate: input.startLicenseDate,
      status: 'HEALTHY',
      updatedAt: timestamp,
      updatedBy: DEFAULT_ACTOR,
    };
    const result = parseContract(
      zInstance,
      instance,
      'InstanceAppModel.createInstance result',
    );

    this.sequence += 1;
    this.instances.unshift(result);

    return clone(result);
  }

  patchInstance(instanceSlug: string, body: PatchInstanceBody) {
    const input = parseContract(
      zPatchInstanceBody,
      body,
      'InstanceAppModel.patchInstance body',
    );
    this.errors.consume('update');
    const instanceIndex = this.instances.findIndex(
      (instance) => instance.slug === instanceSlug,
    );

    if (instanceIndex < 0) {
      throw new Error(`Instance "${instanceSlug}" not found`);
    }

    const currentInstance = this.instances[instanceIndex];

    const statusChanged =
      input.status !== undefined && input.status !== currentInstance.status;
    const lifecycleChanged =
      input.lifecycleStage !== undefined &&
      input.lifecycleStage !== currentInstance.lifecycleStage;

    if (!statusChanged && !lifecycleChanged) {
      return;
    }

    this.instances[instanceIndex] = {
      ...currentInstance,
      ...(statusChanged ? { status: input.status } : {}),
      ...(lifecycleChanged ? { lifecycleStage: input.lifecycleStage } : {}),
      updatedAt: this.nextTimestamp(),
      updatedBy: DEFAULT_ACTOR,
    };
  }

  updateInstance(instanceSlug: string, body: InstanceWritable) {
    const input = parseContract(
      zInstanceWritable,
      body,
      'InstanceAppModel.updateInstance body',
    );
    this.errors.consume('update');
    const instanceIndex = this.instances.findIndex(
      (instance) => instance.slug === instanceSlug,
    );

    if (instanceIndex < 0) {
      throw new Error(`Instance "${instanceSlug}" not found`);
    }

    const currentInstance = this.instances[instanceIndex];
    const customer = this.findCustomerById(input.customerId);
    const license = this.findLicense(input.licenseId);
    // A live subscription freezes the customer and the license of the instance.
    const block = this.billingBlocks[instanceSlug];
    if (
      block &&
      block.status !== 'CANCELED' &&
      (input.customerId !== currentInstance.customerId ||
        input.licenseId !== currentInstance.licenseId)
    ) {
      throw new BillingProblem(
        409,
        'UpdateInstance.BillingActive',
        `Instance "${instanceSlug}" has a live subscription: its customer and license cannot change until it is canceled`,
      );
    }
    const updatedInstance: Instance = {
      ...currentInstance,
      customerId: customer.id,
      customerSlug: customer.slug ?? slugify(customer.name),
      deploymentZoneId: input.deploymentZoneId,
      description: input.description,
      endLicenseDate: input.endLicenseDate,
      licenseId: license.id,
      licenseSlug: license.slug ?? slugify(license.name),
      metadata: clone(input.metadata ?? {}),
      name: input.name,
      startLicenseDate: input.startLicenseDate,
      updatedAt: this.nextTimestamp(),
      updatedBy: DEFAULT_ACTOR,
    };
    const result = parseContract(
      zInstance,
      updatedInstance,
      'InstanceAppModel.updateInstance result',
    );

    this.instances[instanceIndex] = result;

    return clone(result);
  }

  deleteInstance(instanceSlug: string) {
    this.errors.consume('delete');
    const instanceIndex = this.instances.findIndex(
      (instance) => instance.slug === instanceSlug,
    );

    if (instanceIndex < 0) {
      throw new Error(`Instance "${instanceSlug}" not found`);
    }

    // A subscription that lives, or an invoice not settled, keeps the instance.
    const block = this.billingBlocks[instanceSlug];
    if (
      block &&
      (block.status !== 'CANCELED' || block.unpaidInvoiceIds.length > 0)
    ) {
      throw new BillingProblem(
        409,
        'DeleteInstance.BillingActive',
        `Instance "${instanceSlug}" is billed: cancel its subscription and settle its invoices first`,
        {
          errors: [
            {
              location: 'instance',
              message:
                "the subscription's status and the invoices not settled yet",
              value: {
                status: block.status,
                unpaidInvoiceIds: block.unpaidInvoiceIds,
              },
            },
          ],
        },
      );
    }

    // Deleting an instance is a hard delete server-side, so the mock drops
    // the row rather than flagging it.
    this.instances.splice(instanceIndex, 1);
  }

  /**
   * Whether the journal of `entitlementSlug` of `instanceSlug` can be read: the
   * instance has to exist, and the entitlement has to be one it reports on.
   */
  private knowsUsagePair(
    instanceSlug: string,
    entitlementSlug: string,
  ): 'ok' | 'instance' | 'entitlement' {
    if (!this.instances.some((instance) => instance.slug === instanceSlug)) {
      return 'instance';
    }
    const known =
      (this.entitlementUsagesByInstance[instanceSlug] ?? []).some(
        (usage) => usage.entitlementSlug === entitlementSlug,
      ) || this.usageHistory.hasPair(instanceSlug, entitlementSlug);

    return known ? 'ok' : 'entitlement';
  }

  /** `GET /instances/{instanceSlug}/entitlements/{entitlementSlug}/usage/reports`. */
  listUsageReports(
    instanceSlug: string,
    entitlementSlug: string,
    query: Parameters<InstanceUsageHistory['listUsageReports']>[2],
  ) {
    return this.usageHistory.listUsageReports(
      instanceSlug,
      entitlementSlug,
      query,
      (instance, entitlement) => this.knowsUsagePair(instance, entitlement),
    );
  }

  /** `GET /instances/{instanceSlug}/entitlements/{entitlementSlug}/usage/reports/export`. */
  exportUsageReports(
    instanceSlug: string,
    entitlementSlug: string,
    query: Parameters<InstanceUsageHistory['exportUsageReports']>[2],
  ) {
    return this.usageHistory.exportUsageReports(
      instanceSlug,
      entitlementSlug,
      query,
      (instance, entitlement) => this.knowsUsagePair(instance, entitlement),
    );
  }

  /** `GET /usage/reports/export`. */
  exportOrganizationUsageReports(
    query: Parameters<
      InstanceUsageHistory['exportOrganizationUsageReports']
    >[0],
  ) {
    return this.usageHistory.exportOrganizationUsageReports(query);
  }

  private toInstanceListRow(instance: Instance): InstanceListRow {
    const customer = this.findCustomerById(instance.customerId);
    const license = this.findLicense(instance.licenseId, instance.licenseSlug);

    return {
      createdAt: instance.createdAt,
      customer: {
        id: customer.id,
        name: customer.name,
        slug: customer.slug ?? slugify(customer.name),
      },
      customerId: customer.id,
      deploymentZoneId: instance.deploymentZoneId ?? null,
      integrations: instance.integrations ?? {},
      description: instance.description,
      endLicenseDate: instance.endLicenseDate,
      license: {
        id: license.id,
        name: license.name,
        type: toGraphqlLicenseType(license.type),
      },
      licenseId: license.id,
      metadata: clone(instance.metadata ?? {}),
      name: instance.name,
      slug: instance.slug ?? '',
      startLicenseDate: instance.startLicenseDate,
      status: instance.status ?? 'HEALTHY',
      lifecycleStage: instance.lifecycleStage ?? null,
    };
  }

  private createUniqueSlug(value: string) {
    const baseSlug = slugify(value) || `instance-${this.sequence}`;

    if (!this.instances.some((instance) => instance.slug === baseSlug)) {
      return baseSlug;
    }

    let suffix = 2;
    while (
      this.instances.some(
        (instance) => instance.slug === `${baseSlug}-${suffix}`,
      )
    ) {
      suffix += 1;
    }

    return `${baseSlug}-${suffix}`;
  }

  private findCustomerById(customerId: string) {
    const customer = this.customers.find(
      (customerEntry) => customerEntry.id === customerId,
    );

    if (!customer) {
      throw new Error(`Customer "${customerId}" not found`);
    }

    return customer;
  }

  private findCustomerBySlug(customerSlug: string) {
    const customer = this.customers.find(
      (customerEntry) => customerEntry.slug === customerSlug,
    );

    if (!customer) {
      throw new Error(`Customer "${customerSlug}" not found`);
    }

    return customer;
  }

  private findInstance(instanceSlug: string) {
    const instance = this.instances.find(
      (instanceEntry) => instanceEntry.slug === instanceSlug,
    );

    if (!instance) {
      throw new Error(`Instance "${instanceSlug}" not found`);
    }

    return instance;
  }

  private findLicense(licenseId: string, licenseSlug?: string) {
    const license = this.licenses.find(
      (licenseEntry) =>
        licenseEntry.id === licenseId || licenseEntry.slug === licenseSlug,
    );

    if (!license) {
      throw new Error(`License "${licenseId}" / "${licenseSlug}" not found`);
    }

    return license;
  }

  private findLicenseBySlug(licenseSlug: string) {
    const license = this.licenses.find(
      (licenseEntry) => licenseEntry.slug === licenseSlug,
    );

    if (!license) {
      throw new Error(`License "${licenseSlug}" not found`);
    }

    return license;
  }

  private instancesForCustomer(customerSlug: string): CustomerListInstance[] {
    return this.instances
      .filter((instance) => instance.customerSlug === customerSlug)
      .map((instance) => ({
        description: instance.description,
        license: {
          type: toGraphqlLicenseType(
            this.findLicense(instance.licenseId, instance.licenseSlug).type,
          ),
        },
        name: instance.name,
        slug: instance.slug ?? '',
      }));
  }

  private nextTimestamp() {
    this.clock += 60_000;
    return new Date(this.clock).toISOString();
  }
}
