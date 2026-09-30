import { z } from 'zod';
import type {
  Customer,
  CustomerIntegration,
  CustomerWritable,
} from '@/api-client';
import type {
  GetCustomersWithInstancesQuery,
  GetInstancesWithRelationsQuery,
} from '@/api-client/graphql/graphql';
import { zCustomer, zCustomerWritable } from '@/api-client/zod.gen';
import { ATTIO_CONNECTOR_NAME } from '@/domains/crm-sync/constants';
import { parseContract } from '../contracts/openapi-contract';
import { ErrorInjector } from './error-injector';

type CustomerListEntry =
  GetCustomersWithInstancesQuery['customers']['items'][number];
type CustomerListInstance = CustomerListEntry['instances'][number];
type InstanceRow = GetInstancesWithRelationsQuery['instances']['items'][number];

export type CustomerErrorOp = 'create' | 'update' | 'delete';

const DEFAULT_ACTOR: Customer['createdBy'] = {
  id: 'user-e2e',
  name: 'E2E Tester',
};

export type CustomerAppModelSeed = {
  attioSyncAfterAttempts?: number;
  customers?: Customer[];
  instances?: InstanceRow[];
};

export type SerializedCustomerAppModel = CustomerAppModelSeed & {
  attioSyncAttempts: Record<string, number>;
  clock: number;
  pendingErrors: Array<[CustomerErrorOp, number]>;
  sequence: number;
};

const clone = <T>(value: T): T => structuredClone(value);
const integrationNotFound = () =>
  Object.assign(new Error('Customer integration not found'), {
    httpStatus: 404,
  });

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export class CustomerAppModel {
  private readonly attioSyncAfterAttempts?: number;
  private attioSyncAttempts: Record<string, number> = {};
  private clock = Date.parse('2026-03-01T08:00:00.000Z');
  private customers: Customer[];
  private instances: InstanceRow[];
  private sequence: number;
  private readonly errors = new ErrorInjector<CustomerErrorOp>();

  constructor(seed: CustomerAppModelSeed = {}) {
    this.attioSyncAfterAttempts = seed.attioSyncAfterAttempts;
    this.customers = parseContract(
      z.array(zCustomer),
      seed.customers ?? [],
      'CustomerAppModel seed.customers',
    );
    this.instances = clone(seed.instances ?? []);
    this.sequence = this.customers.length + 1;

    const timestamps = this.customers.flatMap((customer) => [
      Date.parse(customer.createdAt),
      Date.parse(customer.updatedAt),
    ]);
    const latestTimestamp =
      timestamps.length > 0 ? Math.max(...timestamps) : null;

    if (latestTimestamp != null && Number.isFinite(latestTimestamp)) {
      this.clock = latestTimestamp;
    }
  }

  static fromSerialized(state: SerializedCustomerAppModel) {
    const model = new CustomerAppModel({
      attioSyncAfterAttempts: state.attioSyncAfterAttempts,
      customers: state.customers,
      instances: state.instances,
    });

    model.attioSyncAttempts = clone(state.attioSyncAttempts ?? {});
    model.clock = state.clock;
    model.sequence = state.sequence;
    model.errors.restore(state.pendingErrors);

    return model;
  }

  serializeForMsw(): SerializedCustomerAppModel {
    return {
      attioSyncAfterAttempts: this.attioSyncAfterAttempts,
      attioSyncAttempts: clone(this.attioSyncAttempts),
      clock: this.clock,
      customers: this.listCustomers(),
      instances: clone(this.instances),
      pendingErrors: this.errors.snapshot(),
      sequence: this.sequence,
    };
  }

  listCustomers(): Customer[] {
    return parseContract(
      z.array(zCustomer),
      clone(this.customers),
      'CustomerAppModel.listCustomers result',
    );
  }

  getCustomer(customerSlug: string): Customer {
    return parseContract(
      zCustomer,
      clone(this.findCustomer(customerSlug)),
      `CustomerAppModel.getCustomer("${customerSlug}") result`,
    );
  }

  getCustomerIntegration(customerSlug: string): CustomerIntegration {
    const customerIndex = this.customers.findIndex(
      (customer) => customer.slug === customerSlug,
    );
    if (customerIndex < 0) {
      throw integrationNotFound();
    }

    const customer = this.customers[customerIndex];
    const existing = customer.integrations?.[ATTIO_CONNECTOR_NAME];
    if (existing) {
      return clone(existing);
    }

    const attempts = (this.attioSyncAttempts[customerSlug] ?? 0) + 1;
    this.attioSyncAttempts[customerSlug] = attempts;
    if (
      this.attioSyncAfterAttempts == null ||
      attempts < this.attioSyncAfterAttempts
    ) {
      throw integrationNotFound();
    }

    const integration: CustomerIntegration = {
      external_id: `attio-${customer.id}`,
      metadata: {},
      synced_at: this.nextTimestamp(),
    };
    this.customers[customerIndex] = parseContract(
      zCustomer,
      {
        ...customer,
        integrations: {
          ...customer.integrations,
          [ATTIO_CONNECTOR_NAME]: integration,
        },
      },
      'CustomerAppModel.getCustomerIntegration synced customer',
    );

    return clone(integration);
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

  getInstancesWithRelations(): GetInstancesWithRelationsQuery {
    const instances = this.instances;

    return {
      instances: { hasMore: false, items: clone(instances), nextCursor: null },
    };
  }

  /**
   * Arm the next call to one of the writable operations (`create`, `update`,
   * `delete`) to fail with the given HTTP status. The error is consumed after
   * one invocation (one-shot).
   */
  setNextError(op: CustomerErrorOp, status: number) {
    this.errors.setNextError(op, status);
  }

  /** @deprecated Use `setNextError('create', status)` instead. */
  setNextCreateError(status: number) {
    this.setNextError('create', status);
  }

  /** @deprecated Use `setNextError('update', status)` instead. */
  setNextUpdateError(status: number) {
    this.setNextError('update', status);
  }

  createCustomer(body: CustomerWritable): Customer {
    const input = parseContract(
      zCustomerWritable,
      body,
      'CustomerAppModel.createCustomer body',
    );
    this.errors.consume('create');
    const timestamp = this.nextTimestamp();
    const customer: Customer = {
      createdAt: timestamp,
      createdBy: DEFAULT_ACTOR,
      domain: input.domain,
      externalCustomerId: input.externalCustomerId ?? null,
      id: `customer-${this.sequence}`,
      name: input.name,
      slug: this.createUniqueSlug(input.slug ?? input.name),
      updatedAt: timestamp,
      updatedBy: DEFAULT_ACTOR,
    };
    const result = parseContract(
      zCustomer,
      customer,
      'CustomerAppModel.createCustomer result',
    );

    this.sequence += 1;
    this.customers.unshift(result);

    return clone(result);
  }

  updateCustomer(customerSlug: string, body: CustomerWritable): Customer {
    const input = parseContract(
      zCustomerWritable,
      body,
      'CustomerAppModel.updateCustomer body',
    );
    this.errors.consume('update');
    const customerIndex = this.customers.findIndex(
      (customer) => customer.slug === customerSlug,
    );

    if (customerIndex < 0) {
      throw new Error(`Customer "${customerSlug}" not found`);
    }

    const currentCustomer = this.customers[customerIndex];
    const nextSlug =
      input.slug && input.slug !== customerSlug
        ? this.createUniqueSlug(input.slug)
        : (currentCustomer.slug ?? customerSlug);
    const updatedCustomer: Customer = {
      ...currentCustomer,
      domain: input.domain,
      externalCustomerId: input.externalCustomerId ?? null,
      name: input.name,
      slug: nextSlug,
      updatedAt: this.nextTimestamp(),
      updatedBy: DEFAULT_ACTOR,
    };
    const result = parseContract(
      zCustomer,
      updatedCustomer,
      'CustomerAppModel.updateCustomer result',
    );

    this.customers[customerIndex] = result;
    this.instances = this.instances.map((instance) => {
      if (instance.customer.slug !== customerSlug) {
        return instance;
      }

      return {
        ...instance,
        customer: {
          ...instance.customer,
          name: result.name,
          slug: result.slug ?? customerSlug,
        },
      };
    });

    return clone(result);
  }

  deleteCustomer(customerSlug: string) {
    this.errors.consume('delete');

    if (this.hasActiveInstances(customerSlug)) {
      throw Object.assign(
        new Error(`Customer "${customerSlug}" still has active instances`),
        { httpStatus: 409 },
      );
    }

    const customerIndex = this.customers.findIndex(
      (customer) => customer.slug === customerSlug,
    );

    if (customerIndex < 0) {
      throw new Error(`Customer "${customerSlug}" not found`);
    }

    this.customers.splice(customerIndex, 1);
  }

  hasActiveInstances(customerSlug: string) {
    return this.instances.some(
      (instance) => instance.customer.slug === customerSlug,
    );
  }

  private createUniqueSlug(value: string) {
    const baseSlug = slugify(value) || `customer-${this.sequence}`;

    if (!this.customers.some((customer) => customer.slug === baseSlug)) {
      return baseSlug;
    }

    let suffix = 2;
    while (
      this.customers.some(
        (customer) => customer.slug === `${baseSlug}-${suffix}`,
      )
    ) {
      suffix += 1;
    }

    return `${baseSlug}-${suffix}`;
  }

  private findCustomer(customerSlug: string) {
    const customer = this.customers.find(
      (customerEntry) => customerEntry.slug === customerSlug,
    );

    if (!customer) {
      throw new Error(`Customer "${customerSlug}" not found`);
    }

    return customer;
  }

  private instancesForCustomer(customerSlug: string): CustomerListInstance[] {
    return this.instances
      .filter((instance) => instance.customer.slug === customerSlug)
      .map((instance) => ({
        description: instance.description,
        license: {
          type: instance.license.type,
        },
        name: instance.name,
        slug: instance.slug,
      }));
  }

  private nextTimestamp() {
    this.clock += 60_000;
    return new Date(this.clock).toISOString();
  }
}
