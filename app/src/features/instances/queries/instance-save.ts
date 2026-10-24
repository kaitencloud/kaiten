import type { InstanceWritable } from '@/api-client';
import { getInstance, updateInstance } from '@/api-client';
import { FRESH_READ_OPTIONS, writeOnFresh } from '@/lib/api/fresh-write';
import { instanceToUpdateBody } from '../utils/instance-update-body';

export type SaveInstanceVariables = {
  /** What the form sends, built from the instance it opened with. */
  edited: InstanceWritable;
  instanceSlug: string;
  /** What the form opened with, built by the function that built `edited`. */
  opened: InstanceWritable;
};

/**
 * Updates an instance without overwriting what changed since the form opened.
 * The update replaces the instance as a whole, so an old page would take back a
 * zone, a window or the metadata saved from another tab: the instance is read
 * again and the form's changes are applied on top of it (`writeOnFresh`). An
 * instance deleted meanwhile is refused by the read, and nothing is written.
 */
export function saveInstanceOnFresh({
  edited,
  instanceSlug,
  opened,
}: SaveInstanceVariables) {
  return writeOnFresh({
    edited,
    opened,
    read: async () => {
      const { data } = await getInstance({
        ...FRESH_READ_OPTIONS,
        path: { instanceSlug },
        throwOnError: true,
      });

      return data;
    },
    restate: instanceToUpdateBody,
    write: async (body) => {
      const { data } = await updateInstance({
        body,
        path: { instanceSlug },
        throwOnError: true,
      });

      return data;
    },
  });
}
