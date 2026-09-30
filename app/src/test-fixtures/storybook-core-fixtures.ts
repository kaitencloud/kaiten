import type {
  Customer as ApiCustomer,
  Entitlement,
  EntitlementGroup,
  License,
  User,
} from '@/api-client';

export const storyNow = '2026-04-24T08:00:00.000Z';
export const storyYesterday = '2026-04-23T08:00:00.000Z';
export const storyLastWeek = '2026-04-17T08:00:00.000Z';
export const storyNextMonth = '2026-05-24T08:00:00.000Z';

export const storyUser: User = {
  id: 'user-story-admin',
  name: 'Story Admin',
};

export const storyActor = {
  id: storyUser.id,
  name: storyUser.name ?? 'Story Admin',
};

export const storyCustomers = [
  {
    createdAt: storyLastWeek,
    createdBy: storyUser,
    domain: 'acme.com',
    externalCustomerId: 'CRM-ACME-001',
    id: 'customer-acme',
    name: 'Acme Corp',
    slug: 'acme-corp',
    updatedAt: storyYesterday,
    updatedBy: storyUser,
  },
  {
    createdAt: storyLastWeek,
    createdBy: storyUser,
    domain: undefined,
    externalCustomerId: null,
    id: 'customer-nova',
    name: 'Nova Retail',
    slug: 'nova-retail',
    updatedAt: storyNow,
    updatedBy: storyUser,
  },
] satisfies ApiCustomer[];

export const storyLicenses = [
  {
    createdAt: storyLastWeek,
    description: 'Production license with feature flags and usage limits.',
    familyId: 'family-enterprise',
    id: 'license-enterprise',
    isDefault: false,
    name: 'Enterprise',
    slug: 'enterprise',
    type: 'PAID',
    updatedAt: storyYesterday,
    version: '3',
    versionName: 'Enterprise 2026',
  },
  {
    createdAt: storyLastWeek,
    description: 'Trial plan for onboarding customers.',
    familyId: 'family-trial',
    id: 'license-trial',
    isDefault: true,
    name: 'Trial',
    slug: 'trial',
    type: 'TRIAL',
    updatedAt: storyNow,
    version: '1',
    versionName: 'Trial 2026',
  },
] satisfies License[];

export const storyEntitlementGroups = [
  {
    description: 'Revenue-facing controls and limits.',
    id: 'group-commercial',
    name: 'Commercial',
    slug: 'commercial',
  },
  {
    description: 'Security and compliance controls.',
    id: 'group-security',
    name: 'Security',
    slug: 'security',
  },
] satisfies EntitlementGroup[];

export const storyEntitlements = [
  {
    aggregationMethod: 'SUM',
    createdAt: storyLastWeek,
    description: 'Monthly API requests included in the customer plan.',
    entitlementGroups: [
      {
        id: 'group-commercial',
        name: 'Commercial',
        slug: 'commercial',
      },
    ],
    icon: 'lucide:zap',
    id: 'entitlement-api-requests',
    name: 'API Requests',
    slug: 'api-requests',
    type: 'NUMBER',
    updatedAt: storyYesterday,
    userFacing: true,
    displayOrder: 10,
    unitSingular: 'request',
    unitPlural: 'requests',
    saleUnitSingular: 'pack',
    saleUnitPlural: 'packs',
    saleUnitFactor: 1000,
    resetPeriod: 'MONTH',
    resetAnchor: 'CALENDAR',
  },
  {
    createdAt: storyLastWeek,
    description: 'Access to SAML authentication.',
    entitlementGroups: [
      {
        id: 'group-security',
        name: 'Security',
        slug: 'security',
      },
    ],
    id: 'entitlement-saml',
    name: 'SAML SSO',
    slug: 'saml-sso',
    type: 'BOOLEAN',
    updatedAt: storyNow,
  },
  {
    createdAt: storyLastWeek,
    description: 'JSON configuration for invoice export templates.',
    entitlementGroups: [],
    id: 'entitlement-invoice-config',
    name: 'Invoice Export Config',
    slug: 'invoice-export-config',
    type: 'CONFIG',
    updatedAt: storyYesterday,
  },
] satisfies Entitlement[];
