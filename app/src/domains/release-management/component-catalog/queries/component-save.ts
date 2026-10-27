import type { ComponentWritable } from '@/api-client';
import { getComponent, updateComponent } from '@/api-client';
import { FRESH_READ_OPTIONS, writeOnFresh } from '@/lib/api/fresh-write';
import { componentToUpdateBody } from '../schemas/component-form.schema';

export type SaveComponentVariables = {
  componentSlug: string;
  /** What the form sends, built from the values it opened with. */
  edited: ComponentWritable;
  /** What the form opened with, built by the function that built `edited`. */
  opened: ComponentWritable;
};

/**
 * Updates a component without overwriting what changed since the form opened.
 * The update replaces the component as a whole, so saving the version from an old
 * dialog would take back a name or a description saved from another tab: the
 * component is read again and the form's changes are applied on top of it
 * (`writeOnFresh`). A component deleted meanwhile is refused by the read, and
 * nothing is written.
 */
export function saveComponentOnFresh({
  componentSlug,
  edited,
  opened,
}: SaveComponentVariables) {
  return writeOnFresh({
    edited,
    opened,
    read: async () => {
      const { data } = await getComponent({
        ...FRESH_READ_OPTIONS,
        path: { componentSlug },
        throwOnError: true,
      });

      return data;
    },
    restate: componentToUpdateBody,
    write: async (body) => {
      const { data } = await updateComponent({
        body,
        path: { componentSlug },
        throwOnError: true,
      });

      return data;
    },
  });
}
