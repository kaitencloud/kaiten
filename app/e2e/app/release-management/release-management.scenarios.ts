import type { Component, DeploymentZone, User } from '@/api-client';
import {
  type ReleaseManagementAppInstance,
  ReleaseManagementAppModel,
  type ReleaseManagementAppModelSeed,
  type ReleaseManagementReleaseRecord,
} from '../_support/model/release-management-app-model';

const TEST_USER: User = {
  id: 'user-e2e',
  name: 'E2E Tester',
};

const buildComponent = ({
  createdAt,
  description,
  id,
  name,
  previousComponentId,
  slug,
  version,
}: {
  createdAt: string;
  description?: string;
  id: string;
  name: string;
  previousComponentId?: string;
  slug: string;
  version: string;
}): Component => ({
  createdAt,
  createdBy: TEST_USER,
  description,
  id,
  name,
  previousComponentId,
  slug,
  version,
});

const buildDeploymentZone = ({
  createdAt,
  description,
  metadata,
  id,
  name,
  releaseId,
  slug,
  type,
  updatedAt = createdAt,
}: {
  createdAt: string;
  description: string;
  metadata?: Record<string, unknown>;
  id: string;
  name: string;
  releaseId?: string;
  slug: string;
  type: DeploymentZone['type'];
  updatedAt?: string;
}): DeploymentZone => ({
  createdAt,
  createdBy: TEST_USER,
  description,
  metadata,
  id,
  name,
  releaseId,
  slug,
  type,
  updatedAt,
  updatedBy: TEST_USER,
});

const buildInstance = ({
  customerId,
  customerName,
  deploymentZoneId,
  description,
  id,
  name,
  slug,
}: {
  customerId: string;
  customerName: string;
  deploymentZoneId: string;
  description?: string;
  id: string;
  name: string;
  slug: string;
}): ReleaseManagementAppInstance => ({
  customer: {
    id: customerId,
    name: customerName,
  },
  deploymentZoneId,
  description,
  id,
  name,
  slug,
});

const buildRelease = ({
  components,
  createdAt,
  description,
  id,
  slug,
  version,
}: {
  components: Component[];
  createdAt: string;
  description?: string;
  id: string;
  slug: string;
  version: string;
}): ReleaseManagementReleaseRecord => ({
  components,
  createdAt,
  createdBy: TEST_USER,
  description,
  id,
  slug,
  version,
});

function createBaseSeed(): ReleaseManagementAppModelSeed {
  const authService = buildComponent({
    createdAt: '2026-03-11T08:00:00.000Z',
    description: 'Handles session and identity flows',
    id: 'component-auth-service',
    name: 'Auth Service',
    slug: 'auth-service',
    version: 'v2.3.0',
  });
  const apiGateway = buildComponent({
    createdAt: '2026-03-09T08:00:00.000Z',
    description: 'Routes tenant traffic to the public APIs',
    id: 'component-api-gateway',
    name: 'API Gateway',
    slug: 'api-gateway',
    version: 'v4.0.0',
  });
  const notificationHub = buildComponent({
    createdAt: '2026-03-16T08:00:00.000Z',
    description: 'Delivers outbound notifications',
    id: 'component-notification-hub',
    name: 'Notification Hub',
    slug: 'notification-hub',
    version: 'v1.9.2',
  });
  const apiGatewayHotfix = buildComponent({
    createdAt: '2026-03-20T08:00:00.000Z',
    description: 'Routes tenant traffic to the public APIs',
    id: 'component-api-gateway-v4-1',
    name: 'API Gateway',
    previousComponentId: 'component-api-gateway',
    slug: 'api-gateway-v4-1-0',
    version: 'v4.1.0',
  });

  const release140 = buildRelease({
    components: [authService, apiGateway],
    createdAt: '2026-03-12T09:00:00.000Z',
    description: 'Stable production baseline before the April release train',
    id: 'release-1-4-0',
    slug: 'release-1-4-0',
    version: 'v1.4.0',
  });
  const release150rc1 = buildRelease({
    components: [authService, notificationHub, apiGatewayHotfix],
    createdAt: '2026-03-20T10:00:00.000Z',
    description: 'Release candidate used for staging validation',
    id: 'release-1-5-0-rc1',
    slug: 'release-1-5-0-rc1',
    version: 'v1.5.0-rc1',
  });

  return {
    components: [authService, apiGateway, notificationHub, apiGatewayHotfix],
    deploymentZones: [
      buildDeploymentZone({
        createdAt: '2026-03-12T11:00:00.000Z',
        description: 'European production cluster',
        metadata: { cluster: 'prod-eu', region: 'eu-west-1' },
        id: 'deployment-zone-production-eu',
        name: 'Production EU',
        releaseId: release140.id,
        slug: 'production-eu',
        type: 'production',
        updatedAt: '2026-03-21T09:00:00.000Z',
      }),
      buildDeploymentZone({
        createdAt: '2026-03-12T12:00:00.000Z',
        description: 'US production cluster',
        metadata: { cluster: 'prod-us', region: 'us-east-1' },
        id: 'deployment-zone-production-us',
        name: 'Production US',
        releaseId: release140.id,
        slug: 'production-us',
        type: 'production',
        updatedAt: '2026-03-21T09:30:00.000Z',
      }),
      buildDeploymentZone({
        createdAt: '2026-03-21T08:00:00.000Z',
        description: 'Pre-production validation environment',
        metadata: { cluster: 'staging', region: 'eu-west-1' },
        id: 'deployment-zone-staging',
        name: 'Staging',
        releaseId: release150rc1.id,
        slug: 'staging',
        type: 'staging',
        updatedAt: '2026-03-24T08:00:00.000Z',
      }),
      buildDeploymentZone({
        createdAt: '2026-03-23T08:00:00.000Z',
        description: 'Internal sandbox for product experiments',
        metadata: { cluster: 'sandbox', region: 'local' },
        id: 'deployment-zone-sandbox',
        name: 'Sandbox',
        slug: 'sandbox',
        type: 'development',
      }),
    ],
    instances: [
      buildInstance({
        customerId: 'customer-acme',
        customerName: 'Acme Corp',
        deploymentZoneId: 'deployment-zone-production-eu',
        description: 'Primary EU workload',
        id: 'instance-acme-production-eu',
        name: 'Acme Production EU',
        slug: 'acme-production-eu',
      }),
      buildInstance({
        customerId: 'customer-acme',
        customerName: 'Acme Corp',
        deploymentZoneId: 'deployment-zone-production-us',
        description: 'Primary US workload',
        id: 'instance-acme-production-us',
        name: 'Acme Production US',
        slug: 'acme-production-us',
      }),
      buildInstance({
        customerId: 'customer-beta',
        customerName: 'Beta Labs',
        deploymentZoneId: 'deployment-zone-staging',
        description: 'Shared staging workspace',
        id: 'instance-beta-staging',
        name: 'Beta Staging',
        slug: 'beta-staging',
      }),
    ],
    releases: [release150rc1, release140],
  };
}

export function createReleaseManagementReadModel() {
  return new ReleaseManagementAppModel(createBaseSeed());
}

export function createReleaseCreationModel() {
  return new ReleaseManagementAppModel(createBaseSeed());
}

export function createComponentsCatalogModel() {
  return new ReleaseManagementAppModel(createBaseSeed());
}

export function createDeploymentZoneEditModel() {
  return new ReleaseManagementAppModel(createBaseSeed());
}

export function createDeploymentFlowModel() {
  return new ReleaseManagementAppModel(createBaseSeed());
}

/**
 * The base seed plus v1.3.0, the production baseline until v1.4.0 replaced it
 * on both production zones, and v1.6.0, which never shipped. No zone runs
 * either of them, yet only v1.3.0 shipped: the releases pages must read it as
 * Superseded and v1.6.0 as Planned. With v1.4.0 (Deployed) and v1.5.0-rc1
 * (Staging), the four statuses each have a release.
 */
export function createSupersededReleaseModel() {
  const seed = createBaseSeed();
  const authService = seed.components?.[0];

  if (!authService) {
    throw new Error('The base seed has no component to ship in v1.3.0');
  }

  const release130 = buildRelease({
    components: [authService],
    createdAt: '2026-02-20T09:00:00.000Z',
    description: 'Previous production baseline',
    id: 'release-1-3-0',
    slug: 'release-1-3-0',
    version: 'v1.3.0',
  });
  const release160 = buildRelease({
    components: [authService],
    createdAt: '2026-03-25T09:00:00.000Z',
    description: 'Draft of the next release, not deployed anywhere',
    id: 'release-1-6-0',
    slug: 'release-1-6-0',
    version: 'v1.6.0',
  });
  const onProduction = (releaseId: string, createdAt: string) =>
    ['deployment-zone-production-eu', 'deployment-zone-production-us'].map(
      (deploymentZoneId) => ({ createdAt, deploymentZoneId, releaseId }),
    );

  return new ReleaseManagementAppModel({
    ...seed,
    deployments: [
      ...onProduction(release130.id, '2026-02-21T10:00:00.000Z'),
      ...onProduction('release-1-4-0', '2026-03-12T11:00:00.000Z'),
      {
        createdAt: '2026-03-24T08:00:00.000Z',
        deploymentZoneId: 'deployment-zone-staging',
        releaseId: 'release-1-5-0-rc1',
      },
    ],
    releases: [...(seed.releases ?? []), release130, release160],
  });
}
