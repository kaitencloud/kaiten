import type { Addon } from '@/api-client';
import { AddonDefaultAction } from '../actions/addon-default-action';
import { AddonDeleteDraftAction } from '../actions/addon-delete-draft-action';
import { AddonLifecycleAction } from '../actions/addon-lifecycle-action';

type AddonVersionsTableActionsProps = {
  addon: Addon;
};

/**
 * Every version gets its lifecycle transition, in a slot of its own width on the
 * right so the column lines up from row to row, next to its default action and, for a
 * draft, its deletion.
 *
 * The area is marked `data-row-actions`: the row opens its version when clicked, and
 * no click in here -- a disabled control's included, which lands on its wrapper -- is
 * a click on the row.
 */
export function AddonVersionsTableActions({
  addon,
}: AddonVersionsTableActionsProps) {
  return (
    <div className="flex h-8 items-center justify-end gap-4" data-row-actions>
      <AddonDeleteDraftAction addon={addon} appearance="row" />
      <AddonDefaultAction addon={addon} appearance="row" />
      <div className="flex w-28 justify-end">
        <AddonLifecycleAction addon={addon} appearance="row" />
      </div>
    </div>
  );
}
