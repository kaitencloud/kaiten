import type { Component } from '@/api-client';
import {
  buildDeploymentZone,
  TEST_USER,
} from '../../../../e2e/app/_support/fixtures';
import type {
  ReleaseManagementDeploymentRecord,
  ReleaseManagementReleaseRecord,
} from '../../../../e2e/app/_support/model/release-management-app-model';
import { bySlug } from './by-slug';
import { daysAgo } from './dates';

const buildComponent = ({
  ageInDays,
  slug,
  ...component
}: Omit<Component, 'createdAt' | 'createdBy' | 'id'> & {
  ageInDays: number;
  slug: string;
}): Component => ({
  ...component,
  createdAt: daysAgo(ageInDays),
  createdBy: TEST_USER,
  id: `component-${slug}`,
  slug,
});

const releaseSlug = (version: string) =>
  `release-${version.replace(/^v/, '').replace(/\./g, '-')}`;

const buildRelease = ({
  ageInDays,
  components,
  description,
  version,
}: {
  ageInDays: number;
  components: Component[];
  description: string;
  version: string;
}): ReleaseManagementReleaseRecord => {
  const slug = releaseSlug(version);
  return {
    components,
    createdAt: daysAgo(ageInDays),
    createdBy: TEST_USER,
    description,
    id: slug,
    slug,
    version,
  };
};

const ZONES = [
  {
    ageInDays: 300,
    description: 'European production cluster',
    metadata: { cluster: 'prod-eu', region: 'eu-west-1' },
    name: 'Production EU',
    slug: 'production-eu',
    type: 'production',
  },
  {
    ageInDays: 280,
    description: 'US production cluster',
    metadata: { cluster: 'prod-us', region: 'us-east-1' },
    name: 'Production US',
    slug: 'production-us',
    type: 'production',
  },
  {
    ageInDays: 250,
    description: 'Pre-production validation environment',
    metadata: { cluster: 'staging', region: 'eu-west-1' },
    name: 'Staging',
    slug: 'staging',
    type: 'staging',
  },
  {
    ageInDays: 20,
    description: 'Internal sandbox for product experiments',
    metadata: { cluster: 'sandbox', region: 'local' },
    name: 'Sandbox',
    slug: 'sandbox',
    type: 'development',
  },
];

// The deployment log, oldest first: [zone, release version, days ago]. Each
// zone runs the last release the log puts on it; the sandbox has none.
const DEPLOYMENTS: Array<[string, string, number]> = [
  ['production-eu', 'v1.3.0', 90],
  ['production-us', 'v1.3.0', 89],
  ['staging', 'v1.4.0', 33],
  ['production-eu', 'v1.4.0', 30],
  ['production-us', 'v1.4.0', 28],
  ['staging', 'v1.5.0-rc1', 8],
];

/** Components, the releases built from them, and where each one runs. */
export const createReleaseTrain = () => {
  const authService = buildComponent({
    ageInDays: 100,
    description: 'Handles sessions and identity',
    name: 'Auth Service',
    slug: 'auth-service',
    version: 'v2.3.0',
  });
  const apiGateway = buildComponent({
    ageInDays: 110,
    description: 'Routes tenant traffic to the public APIs',
    name: 'API Gateway',
    slug: 'api-gateway',
    version: 'v4.0.0',
  });
  const notificationHub = buildComponent({
    ageInDays: 40,
    description: 'Delivers outbound notifications',
    name: 'Notification Hub',
    slug: 'notification-hub',
    version: 'v1.9.2',
  });
  const apiGatewayNext = buildComponent({
    ageInDays: 12,
    description: 'Routes tenant traffic to the public APIs',
    name: 'API Gateway',
    previousComponentId: apiGateway.id,
    slug: 'api-gateway-v4-1-0',
    version: 'v4.1.0',
  });

  const releases = [
    buildRelease({
      ageInDays: 10,
      components: [authService, notificationHub, apiGatewayNext],
      description: 'Release candidate under validation on staging',
      version: 'v1.5.0-rc1',
    }),
    buildRelease({
      ageInDays: 35,
      components: [authService, apiGateway, notificationHub],
      description: 'Adds the notification hub; runs in production',
      version: 'v1.4.0',
    }),
    buildRelease({
      ageInDays: 95,
      components: [authService, apiGateway],
      description: 'The production baseline until last month',
      version: 'v1.3.0',
    }),
  ];

  const deployments: ReleaseManagementDeploymentRecord[] = DEPLOYMENTS.map(
    ([zoneSlug, version, ageInDays]) => ({
      createdAt: daysAgo(ageInDays),
      deploymentZoneId: `deployment-zone-${zoneSlug}`,
      releaseId: bySlug(releases, releaseSlug(version)).id,
    }),
  );

  const deploymentZones = ZONES.map(({ ageInDays, ...zone }) => {
    const id = `deployment-zone-${zone.slug}`;
    const latest = deployments
      .filter((deployment) => deployment.deploymentZoneId === id)
      .at(-1);
    return buildDeploymentZone({
      ...zone,
      createdAt: daysAgo(ageInDays),
      id,
      releaseId: latest?.releaseId,
      updatedAt: latest?.createdAt,
    });
  });

  return {
    components: [authService, apiGateway, notificationHub, apiGatewayNext],
    deploymentZones,
    deployments,
    releases,
  };
};
