import type { DeploymentZone, Release } from '@/api-client';
import type { DeploymentZoneFormValues } from '../schemas/deployment-zone.schema';

export type { DeploymentZone, Release };

export type DeploymentZoneFormProps = {
  deploymentZone?: DeploymentZone;
  onSuccess?: () => void;
  prepareValues?: (
    values: DeploymentZoneFormValues,
  ) => DeploymentZoneFormValues;
};

export type DeployReleaseDialogProps = {
  deploymentZone: DeploymentZone;
  releases: Release[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** The mirror image: the release is fixed, the zone is the choice. */
export type DeployToZoneDialogProps = {
  release: Release;
  deploymentZones: DeploymentZone[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
