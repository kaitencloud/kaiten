import { z } from 'zod';
import type {
  Component,
  ComponentWritable,
  ReleaseWritable,
  DeploymentZone,
  DeploymentZoneWritable,
  Release,
  User,
} from '@/api-client';
import {
  zComponent,
  zComponentWritable,
  zReleaseWritable,
  zDeploymentZone,
  zDeploymentZoneWritable,
  zRelease,
} from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { ErrorInjector } from './error-injector';

type ReleaseManagementErrorOp =
  | 'createComponent'
  | 'updateComponent'
  | 'createRelease'
  | 'deleteRelease'
  | 'createDeploymentZone'
  | 'updateDeploymentZone'
  | 'deleteDeploymentZone';

const DEFAULT_ACTOR: User = {
  id: 'user-e2e',
  name: 'E2E Tester',
};

const clone = <T>(value: T): T => structuredClone(value);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export type ReleaseManagementAppInstance = {
  customer: {
    id: string;
    name: string | null;
  };
  deploymentZoneId: string;
  description?: string;
  id: string;
  name: string;
  slug: string;
};

export type ReleaseManagementReleaseRecord = Release & {
  components: Component[];
};

/**
 * One entry of the deployment log: a release put on a zone. The zones keep
 * only the release they run now; this log is what remembers the others, the
 * way the API's `Release.deploymentZones` does.
 */
export type ReleaseManagementDeploymentRecord = {
  createdAt: string;
  deploymentZoneId: string;
  releaseId: string;
};

export type ReleaseManagementAppModelSeed = {
  components?: Component[];
  /**
   * What each zone ran before, oldest first. Left out, it is each zone's
   * current release alone: nothing has ever been replaced.
   */
  deployments?: ReleaseManagementDeploymentRecord[];
  deploymentZones?: DeploymentZone[];
  instances?: ReleaseManagementAppInstance[];
  releases?: ReleaseManagementReleaseRecord[];
};

export type SerializedReleaseManagementAppModel =
  Required<ReleaseManagementAppModelSeed> & {
    clock: number;
    componentSequence: number;
    deploymentZoneSequence: number;
    pendingErrors: Array<[ReleaseManagementErrorOp, number]>;
    releaseSequence: number;
  };

export class ReleaseManagementAppModel {
  private clock = Date.parse('2026-03-20T08:00:00.000Z');
  private components: Component[];
  private deployments: ReleaseManagementDeploymentRecord[];
  private deploymentZones: DeploymentZone[];
  private instances: ReleaseManagementAppInstance[];
  private releases: ReleaseManagementReleaseRecord[];
  private componentSequence: number;
  private deploymentZoneSequence: number;
  private releaseSequence: number;
  private readonly errors = new ErrorInjector<ReleaseManagementErrorOp>();

  /**
   * Arm the next call to `op` to fail with the given HTTP status. One-shot.
   */
  setNextError(op: ReleaseManagementErrorOp, status: number) {
    this.errors.setNextError(op, status);
  }

  static fromSerialized(state: SerializedReleaseManagementAppModel) {
    const model = new ReleaseManagementAppModel({
      components: state.components,
      deployments: state.deployments,
      deploymentZones: state.deploymentZones,
      instances: state.instances,
      releases: state.releases,
    });
    model.clock = state.clock;
    model.componentSequence = state.componentSequence;
    model.deploymentZoneSequence = state.deploymentZoneSequence;
    model.releaseSequence = state.releaseSequence;
    model.errors.restore(state.pendingErrors);
    return model;
  }

  serializeForMsw(): SerializedReleaseManagementAppModel {
    return {
      clock: this.clock,
      componentSequence: this.componentSequence,
      components: clone(this.components),
      deployments: clone(this.deployments),
      deploymentZoneSequence: this.deploymentZoneSequence,
      deploymentZones: clone(this.deploymentZones),
      instances: clone(this.instances),
      pendingErrors: this.errors.snapshot(),
      releaseSequence: this.releaseSequence,
      releases: clone(this.releases),
    };
  }

  constructor(seed: ReleaseManagementAppModelSeed = {}) {
    this.components = parseContract(
      z.array(zComponent),
      seed.components ?? [],
      'ReleaseManagementAppModel seed.components',
    );
    this.deploymentZones = parseContract(
      z.array(zDeploymentZone),
      seed.deploymentZones ?? [],
      'ReleaseManagementAppModel seed.deploymentZones',
    );
    this.instances = clone(seed.instances ?? []);
    // ReleaseManagementReleaseRecord = Release & { components: Component[] }.
    // The OpenAPI Release schema accepts components nullable, so the same
    // shape passes — the `& { components }` is just a stronger in-memory
    // refinement.
    this.releases = parseContract(
      z.array(zRelease),
      seed.releases ?? [],
      'ReleaseManagementAppModel seed.releases',
    );
    this.deployments =
      clone(seed.deployments) ??
      this.deploymentZones.flatMap((deploymentZone) =>
        deploymentZone.releaseId
          ? [
              {
                createdAt: deploymentZone.updatedAt,
                deploymentZoneId: deploymentZone.id,
                releaseId: deploymentZone.releaseId,
              },
            ]
          : [],
      );
    this.componentSequence = this.components.length + 1;
    this.deploymentZoneSequence = this.deploymentZones.length + 1;
    this.releaseSequence = this.releases.length + 1;

    const timestamps = [
      ...this.components.flatMap((component) => [
        Date.parse(component.createdAt),
      ]),
      ...this.deploymentZones.flatMap((deploymentZone) => [
        Date.parse(deploymentZone.createdAt),
        Date.parse(deploymentZone.updatedAt),
      ]),
      ...this.releases.map((release) => Date.parse(release.createdAt)),
    ].filter((timestamp) => Number.isFinite(timestamp));

    if (timestamps.length > 0) {
      this.clock = Math.max(...timestamps);
    }
  }

  listComponents(): Component[] {
    return clone(this.components);
  }

  getComponent(componentSlug: string): Component {
    return clone(this.findComponent(componentSlug));
  }

  createComponent(body: ComponentWritable): Component {
    const input = parseContract(
      zComponentWritable,
      body,
      'ReleaseManagementAppModel.createComponent body',
    );
    this.errors.consume('createComponent');
    const timestamp = this.nextTimestamp();
    const component: Component = {
      createdAt: timestamp,
      createdBy: DEFAULT_ACTOR,
      description: input.description,
      id: `component-${this.componentSequence}`,
      name: input.name,
      previousComponentId: input.previousComponentId,
      slug: this.createUniqueSlug(
        this.components.map((entry) => entry.slug),
        input.slug ?? `${input.name}-${input.version}`,
        `component-${this.componentSequence}`,
      ),
      version: input.version,
    };
    const result = parseContract(
      zComponent,
      component,
      'ReleaseManagementAppModel.createComponent result',
    );

    this.componentSequence += 1;
    this.components.unshift(result);

    return clone(result);
  }

  updateComponent(componentSlug: string, body: ComponentWritable): Component {
    const input = parseContract(
      zComponentWritable,
      body,
      'ReleaseManagementAppModel.updateComponent body',
    );
    this.errors.consume('updateComponent');
    const componentIndex = this.components.findIndex(
      (component) => component.slug === componentSlug,
    );

    if (componentIndex < 0) {
      throw new Error(`Component "${componentSlug}" not found`);
    }

    const currentComponent = this.components[componentIndex];
    const nextSlug =
      input.slug && input.slug !== componentSlug
        ? this.createUniqueSlug(
            this.components
              .filter((component) => component.slug !== componentSlug)
              .map((component) => component.slug),
            input.slug,
            currentComponent.slug ?? componentSlug,
          )
        : (currentComponent.slug ?? componentSlug);

    const updatedComponent: Component = {
      ...currentComponent,
      description: input.description,
      name: input.name,
      previousComponentId: input.previousComponentId,
      slug: nextSlug,
      version: input.version,
    };
    const result = parseContract(
      zComponent,
      updatedComponent,
      'ReleaseManagementAppModel.updateComponent result',
    );

    this.components[componentIndex] = result;
    this.releases = this.releases.map((release) => ({
      ...release,
      components: release.components.map((component) =>
        component.id === currentComponent.id ? result : component,
      ),
    }));

    return clone(result);
  }

  listReleases(): Release[] {
    return clone(this.releases);
  }

  getRelease(releaseSlug: string): Release {
    return clone(this.findRelease(releaseSlug));
  }

  createRelease(body: ReleaseWritable): Release {
    const input = parseContract(
      zReleaseWritable,
      body,
      'ReleaseManagementAppModel.createRelease body',
    );
    this.errors.consume('createRelease');
    const timestamp = this.nextTimestamp();
    const release: ReleaseManagementReleaseRecord = {
      components: this.resolveReleaseComponents(input.componentIds ?? []),
      createdAt: timestamp,
      createdBy: DEFAULT_ACTOR,
      description: input.description,
      id: `release-${this.releaseSequence}`,
      slug: this.createUniqueSlug(
        this.releases.map((entry) => entry.slug),
        input.slug ?? input.version,
        `release-${this.releaseSequence}`,
      ),
      version: input.version,
    };
    const result = parseContract(
      zRelease,
      release,
      'ReleaseManagementAppModel.createRelease result',
    );

    this.releaseSequence += 1;
    this.releases.unshift(release);

    return clone(result);
  }

  deleteRelease(releaseSlug: string) {
    this.errors.consume('deleteRelease');
    const release = this.findRelease(releaseSlug);

    this.releases = this.releases.filter(
      (currentRelease) => currentRelease.slug !== releaseSlug,
    );
    this.deployments = this.deployments.filter(
      (deployment) => deployment.releaseId !== release.id,
    );
    this.deploymentZones = this.deploymentZones.map((deploymentZone) => {
      if (deploymentZone.releaseId !== release.id) {
        return deploymentZone;
      }

      return {
        ...deploymentZone,
        releaseId: undefined,
        updatedAt: this.nextTimestamp(),
        updatedBy: DEFAULT_ACTOR,
      };
    });
  }

  listDeploymentZones(): DeploymentZone[] {
    return clone(this.deploymentZones);
  }

  getDeploymentZone(deploymentZoneSlug: string): DeploymentZone {
    return clone(this.findDeploymentZone(deploymentZoneSlug));
  }

  createDeploymentZone(body: DeploymentZoneWritable): DeploymentZone {
    const input = parseContract(
      zDeploymentZoneWritable,
      body,
      'ReleaseManagementAppModel.createDeploymentZone body',
    );
    this.errors.consume('createDeploymentZone');
    const timestamp = this.nextTimestamp();
    const deploymentZone: DeploymentZone = {
      createdAt: timestamp,
      createdBy: DEFAULT_ACTOR,
      description: input.description,
      metadata: clone(input.metadata ?? {}),
      id: `deployment-zone-${this.deploymentZoneSequence}`,
      name: input.name,
      releaseId: input.releaseId,
      slug: this.createUniqueSlug(
        this.deploymentZones.map((entry) => entry.slug),
        input.slug ?? input.name,
        `deployment-zone-${this.deploymentZoneSequence}`,
      ),
      type: input.type,
      updatedAt: timestamp,
      updatedBy: DEFAULT_ACTOR,
    };
    const result = parseContract(
      zDeploymentZone,
      deploymentZone,
      'ReleaseManagementAppModel.createDeploymentZone result',
    );

    this.deploymentZoneSequence += 1;
    this.deploymentZones.unshift(result);
    this.recordDeployment(result, undefined);

    return clone(result);
  }

  updateDeploymentZone(
    deploymentZoneSlug: string,
    body: DeploymentZoneWritable,
  ): DeploymentZone {
    const input = parseContract(
      zDeploymentZoneWritable,
      body,
      'ReleaseManagementAppModel.updateDeploymentZone body',
    );
    this.errors.consume('updateDeploymentZone');
    const deploymentZoneIndex = this.deploymentZones.findIndex(
      (deploymentZone) => deploymentZone.slug === deploymentZoneSlug,
    );

    if (deploymentZoneIndex < 0) {
      throw new Error(`Deployment zone "${deploymentZoneSlug}" not found`);
    }

    if (input.releaseId) {
      this.assertReleaseIdExists(input.releaseId);
    }

    const currentDeploymentZone = this.deploymentZones[deploymentZoneIndex];
    const updatedDeploymentZone: DeploymentZone = {
      ...currentDeploymentZone,
      description: input.description,
      metadata: clone(input.metadata ?? {}),
      name: input.name,
      // Like the API: an omitted `releaseId` keeps the zone on its current
      // release, and the API has no way to clear it. Only a different id
      // records a deployment.
      releaseId: input.releaseId ?? currentDeploymentZone.releaseId,
      type: input.type,
      updatedAt: this.nextTimestamp(),
      updatedBy: DEFAULT_ACTOR,
    };
    const result = parseContract(
      zDeploymentZone,
      updatedDeploymentZone,
      'ReleaseManagementAppModel.updateDeploymentZone result',
    );

    this.deploymentZones[deploymentZoneIndex] = result;
    this.recordDeployment(result, currentDeploymentZone.releaseId);

    return clone(result);
  }

  deleteDeploymentZone(deploymentZoneSlug: string) {
    this.errors.consume('deleteDeploymentZone');
    const deploymentZone = this.findDeploymentZone(deploymentZoneSlug);
    this.deploymentZones = this.deploymentZones.filter(
      (currentZone) => currentZone.slug !== deploymentZoneSlug,
    );
    this.deployments = this.deployments.filter(
      (deployment) => deployment.deploymentZoneId !== deploymentZone.id,
    );
    this.instances = this.instances.filter(
      (instance) => instance.deploymentZoneId !== deploymentZone.id,
    );
  }

  /**
   * `GetReleaseManagementOverview`, as the API answers it: each release lists
   * every zone it was ever deployed to, once, and the instances in them. A
   * zone carries the release it runs NOW, so a release that has since been
   * replaced still lists the zone, under another release's id.
   */
  getReleaseManagementOverviewData() {
    return {
      releases: {
        items: clone(
          this.releases.map((release) => {
            const reachedZoneIds = new Set(
              this.deployments
                .filter((deployment) => deployment.releaseId === release.id)
                .map((deployment) => deployment.deploymentZoneId),
            );
            const reachedDeploymentZones = this.deploymentZones.filter(
              (deploymentZone) => reachedZoneIds.has(deploymentZone.id),
            );
            const reachedInstances = this.instances.filter((instance) =>
              reachedZoneIds.has(instance.deploymentZoneId),
            );

            return {
              components: release.components.map((component) => ({
                createdAt: component.createdAt,
                createdBy: component.createdBy,
                description: component.description ?? null,
                id: component.id,
                name: component.name,
                previousComponentId: component.previousComponentId ?? null,
                slug: component.slug ?? null,
                version: component.version,
              })),
              createdAt: release.createdAt,
              createdBy: release.createdBy,
              deploymentZones: reachedDeploymentZones.map((deploymentZone) => ({
                createdAt: deploymentZone.createdAt,
                description: deploymentZone.description,
                id: deploymentZone.id,
                name: deploymentZone.name,
                releaseId: deploymentZone.releaseId ?? null,
                slug: deploymentZone.slug ?? null,
                type: deploymentZone.type,
                updatedAt: deploymentZone.updatedAt,
              })),
              description: release.description ?? null,
              id: release.id,
              instances: reachedInstances.map((instance) => ({
                customer: {
                  id: instance.customer.id,
                  name: instance.customer.name,
                },
                deploymentZoneId: instance.deploymentZoneId,
                description: instance.description ?? null,
                id: instance.id,
                name: instance.name,
                slug: instance.slug,
              })),
              slug: release.slug ?? null,
              version: release.version,
            };
          }),
        ),
      },
    };
  }

  private assertReleaseIdExists(releaseId: string) {
    const exists = this.releases.some((release) => release.id === releaseId);

    if (!exists) {
      throw new Error(`Release "${releaseId}" not found`);
    }
  }

  private createUniqueSlug(
    existingSlugs: Array<string | undefined>,
    value: string,
    fallback: string,
  ) {
    const normalizedExistingSlugs = new Set(
      existingSlugs.filter((slug): slug is string => Boolean(slug)),
    );
    const baseSlug = slugify(value) || fallback;

    if (!normalizedExistingSlugs.has(baseSlug)) {
      return baseSlug;
    }

    let suffix = 2;
    while (normalizedExistingSlugs.has(`${baseSlug}-${suffix}`)) {
      suffix += 1;
    }

    return `${baseSlug}-${suffix}`;
  }

  private findComponent(componentSlug: string) {
    const component = this.components.find(
      (entry) => entry.slug === componentSlug,
    );

    if (!component) {
      throw new Error(`Component "${componentSlug}" not found`);
    }

    return component;
  }

  private findDeploymentZone(deploymentZoneSlug: string) {
    const deploymentZone = this.deploymentZones.find(
      (entry) => entry.slug === deploymentZoneSlug,
    );

    if (!deploymentZone) {
      throw new Error(`Deployment zone "${deploymentZoneSlug}" not found`);
    }

    return deploymentZone;
  }

  private findRelease(releaseSlug: string) {
    const release = this.releases.find((entry) => entry.slug === releaseSlug);

    if (!release) {
      throw new Error(`Release "${releaseSlug}" not found`);
    }

    return release;
  }

  private nextTimestamp() {
    this.clock += 60_000;
    return new Date(this.clock).toISOString();
  }

  /** A zone now runs a release it did not run before: one more log entry. */
  private recordDeployment(
    deploymentZone: DeploymentZone,
    previousReleaseId: string | undefined,
  ) {
    if (
      !deploymentZone.releaseId ||
      deploymentZone.releaseId === previousReleaseId
    ) {
      return;
    }

    this.deployments.push({
      createdAt: deploymentZone.updatedAt,
      deploymentZoneId: deploymentZone.id,
      releaseId: deploymentZone.releaseId,
    });
  }

  private resolveReleaseComponents(componentIds: Array<string | null>) {
    if (componentIds.length === 0) {
      return [];
    }

    return componentIds.map((componentId) => {
      const component = this.components.find(
        (entry) => entry.id === componentId,
      );

      if (!component) {
        throw new Error(`Component "${componentId}" not found`);
      }

      return clone(component);
    });
  }
}
