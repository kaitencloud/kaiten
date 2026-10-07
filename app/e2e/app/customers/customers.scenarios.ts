import { faker } from '@faker-js/faker';
import type { GetInstancesWithRelationsQuery } from '@/api-client/graphql/graphql';
import { buildCustomer } from '../_support/fixtures';
import { CustomerAppModel } from '../_support/model/customer-app-model';

type InstanceRow = GetInstancesWithRelationsQuery['instances']['items'][number];
type InstanceLicenseType = InstanceRow['license']['type'];

const buildInstance = ({
  createdAt = '2026-03-02T09:00:00.000Z',
  customerId,
  customerName,
  customerSlug,
  deploymentZoneId = null,
  description,
  endLicenseDate = '2027-03-01T00:00:00.000Z',
  licenseId,
  licenseName,
  licenseType,
  metadata = null,
  name,
  slug,
  startLicenseDate = '2026-03-01T00:00:00.000Z',
  status = 'HEALTHY',
  lifecycleStage = null,
}: {
  createdAt?: string;
  customerId: string;
  customerName: string;
  customerSlug: string;
  deploymentZoneId?: InstanceRow['deploymentZoneId'];
  description: string;
  endLicenseDate?: string;
  licenseId: string;
  licenseName: string;
  licenseType: InstanceLicenseType;
  metadata?: Record<string, unknown> | null;
  name: string;
  slug: string;
  startLicenseDate?: string;
  status?: InstanceRow['status'];
  lifecycleStage?: InstanceRow['lifecycleStage'];
}): InstanceRow => ({
  createdAt,
  customer: {
    id: customerId,
    name: customerName,
    slug: customerSlug,
  },
  customerId,
  deploymentZoneId,
  description,
  endLicenseDate,
  integrations: {},
  license: {
    id: licenseId,
    name: licenseName,
    type: licenseType,
  },
  licenseId,
  metadata,
  name,
  slug,
  startLicenseDate,
  status,
  lifecycleStage,
});

const slugify = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function createCustomersListModel() {
  const acme = buildCustomer({
    domain: 'acme.com',
    externalCustomerId: 'crm-acme-001',
    id: 'customer-acme',
    name: 'Acme Corp',
    slug: 'acme-corp',
  });
  const beta = buildCustomer({
    externalCustomerId: 'crm-beta-002',
    id: 'customer-beta',
    name: 'Beta Industries',
    slug: 'beta-industries',
  });

  return new CustomerAppModel({
    customers: [acme, beta],
    instances: [
      buildInstance({
        customerId: acme.id,
        customerName: acme.name,
        customerSlug: acme.slug ?? 'acme-corp',
        description: 'Primary production environment',
        licenseId: 'license-enterprise',
        licenseName: 'Enterprise',
        licenseType: 'PAID',
        name: 'Acme Production',
        slug: 'acme-production',
      }),
      buildInstance({
        customerId: acme.id,
        customerName: acme.name,
        customerSlug: acme.slug ?? 'acme-corp',
        description: 'Retired legacy environment',
        licenseId: 'license-legacy',
        licenseName: 'Legacy',
        licenseType: 'TRIAL',
        name: 'Acme Legacy',
        slug: 'acme-legacy',
      }),
      buildInstance({
        customerId: beta.id,
        customerName: beta.name,
        customerSlug: beta.slug ?? 'beta-industries',
        description: 'Staging environment',
        licenseId: 'license-starter',
        licenseName: 'Starter',
        licenseType: 'TRIAL',
        name: 'Beta Staging',
        slug: 'beta-staging',
      }),
    ],
  });
}

export function createFuzzCustomersReadModel(seed: number) {
  faker.seed(seed);

  const searchTerm = `FZ${seed}`;
  const customerCount = faker.number.int({ max: 18, min: 14 });
  const customers = Array.from({ length: customerCount }, (_, index) => {
    const suffix = faker.string.alphanumeric(5).toLowerCase();
    const name =
      index === 0
        ? `Fuzz ${searchTerm} ${faker.company.name()}`
        : `${faker.company.name()} ${faker.string.alpha(3).toUpperCase()} ${index}`;

    return buildCustomer({
      createdAt: `2026-03-${String((index % 20) + 1).padStart(2, '0')}T09:00:00.000Z`,
      externalCustomerId: `crm-fuzz-${seed}-${index}-${suffix}`,
      id: `customer-fuzz-${seed}-${index}`,
      name,
      slug: slugify(`${name}-${seed}-${index}`),
    });
  });
  const [matchingCustomer, hiddenCustomer] = customers;

  if (!matchingCustomer || !hiddenCustomer) {
    throw new Error(`Fuzz customer seed ${seed} did not generate enough rows`);
  }
  const instanceName = `Fuzz Instance ${seed}`;

  return {
    hiddenCustomer,
    instanceName,
    matchingCustomer,
    model: new CustomerAppModel({
      customers,
      instances: [
        buildInstance({
          customerId: matchingCustomer.id,
          customerName: matchingCustomer.name,
          customerSlug: matchingCustomer.slug ?? '',
          description: 'Generated instance for fuzz read coverage',
          licenseId: `license-fuzz-paid-${seed}`,
          licenseName: 'Fuzz Paid Plan',
          licenseType: 'PAID',
          name: instanceName,
          slug: `fuzz-instance-${seed}`,
        }),
      ],
    }),
    searchTerm,
    seed,
  };
}

export function createEmptyCustomersModel() {
  return new CustomerAppModel();
}

export function createEditableCustomerModel() {
  return new CustomerAppModel({
    customers: [
      buildCustomer({
        domain: 'acme.com',
        externalCustomerId: 'crm-acme-001',
        id: 'customer-acme',
        name: 'Acme Corp',
        slug: 'acme-corp',
      }),
    ],
  });
}

export function createDeletableCustomerModel() {
  return new CustomerAppModel({
    customers: [
      buildCustomer({
        externalCustomerId: 'crm-gamma-003',
        id: 'customer-gamma',
        name: 'Gamma Labs',
        slug: 'gamma-labs',
      }),
    ],
  });
}

/**
 * The customers the end-to-end specs of billing read: Acme has a billing
 * e-mail and two instances, Beta has neither an e-mail nor a subscribed
 * instance, and Gamma has no instance left but an invoice that was never
 * settled, which keeps it from being deleted. The invoices Acme has had are in
 * the billing slot of `createSubscriptionsModel`.
 */
export function createBillingCustomersModel() {
  const acme = buildCustomer({
    billingEmail: 'ap@acme.com',
    domain: 'acme.com',
    externalCustomerId: 'crm-acme-001',
    id: 'customer-acme',
    name: 'Acme Corp',
    slug: 'acme-corp',
  });
  const beta = buildCustomer({
    domain: 'beta.test',
    id: 'customer-beta',
    name: 'Beta Industries',
    slug: 'beta-industries',
  });
  const gamma = buildCustomer({
    id: 'customer-gamma',
    name: 'Gamma Labs',
    slug: 'gamma-labs',
  });
  const instanceOf = (
    customer: typeof acme,
    name: string,
    slug: string,
    license: { id: string; name: string },
  ) =>
    buildInstance({
      customerId: customer.id,
      customerName: customer.name,
      customerSlug: customer.slug ?? '',
      description: `${name} environment`,
      licenseId: license.id,
      licenseName: license.name,
      licenseType: 'PAID',
      name,
      slug,
    });
  const enterprise = { id: 'license-enterprise', name: 'Enterprise' };

  return new CustomerAppModel({
    billingBlocks: {
      'acme-corp': { live: true, unpaidInvoiceIds: ['inv-acme-renewal'] },
      'gamma-labs': { live: false, unpaidInvoiceIds: ['inv-gamma-open'] },
    },
    customers: [acme, beta, gamma],
    instances: [
      instanceOf(acme, 'Acme Production', 'acme-production', enterprise),
      instanceOf(acme, 'Acme Legacy', 'acme-legacy', enterprise),
      instanceOf(beta, 'Beta Staging', 'beta-staging', {
        id: 'license-starter',
        name: 'Starter',
      }),
    ],
  });
}
