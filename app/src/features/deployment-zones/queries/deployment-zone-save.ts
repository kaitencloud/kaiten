import type { DeploymentZoneWritable } from '@/api-client';
import { getDeploymentZoneBySlug, updateDeploymentZone } from '@/api-client';
import { FRESH_READ_OPTIONS, writeOnFresh } from '@/lib/api/fresh-write';
import { deploymentZoneToUpdateBody } from '../utils/deployment-zone-update-body';

export type SaveDeploymentZoneVariables = {
  deploymentZoneSlug: string;
  /** What the form sends, built from the zone it opened with. */
  edited: DeploymentZoneWritable;
  /** What the form opened with, built by the function that built `edited`. */
  opened: DeploymentZoneWritable;
};

/**
 * Updates a zone without overwriting what changed since the form opened. The
 * update replaces the zone as a whole, so an old page would take back a name or
 * metadata saved from another tab: the zone is read again and the form's changes
 * are applied on top of it (`writeOnFresh`). A zone deleted meanwhile is refused
 * by the read, and nothing is written.
 */
export function saveDeploymentZoneOnFresh({
  deploymentZoneSlug,
  edited,
  opened,
}: SaveDeploymentZoneVariables) {
  return writeOnFresh({
    edited,
    opened,
    read: async () => {
      const { data } = await getDeploymentZoneBySlug({
        ...FRESH_READ_OPTIONS,
        path: { deploymentZoneSlug },
        throwOnError: true,
      });

      return data;
    },
    restate: deploymentZoneToUpdateBody,
    write: async (body) => {
      const { data } = await updateDeploymentZone({
        body,
        path: { deploymentZoneSlug },
        throwOnError: true,
      });

      return data;
    },
  });
}
