import type { Addon } from '@/api-client';
import {
  type RowActionAppearance,
  useCanPerform,
  VersionDraftDeleteAction,
} from '@/domains/billing';
import { useDeleteAddonDraft } from '../../hooks';
import { DELETE_DRAFT_KEYS } from '../../utils/addon-labels';

type AddonDeleteDraftActionProps = {
  addon: Pick<Addon, 'lifecycleState' | 'name' | 'slug' | 'version'>;
  appearance: RowActionAppearance;
  onDeleted?: () => void;
};

/**
 * Deletes a draft, confirmed first. Archiving is for versions that have been on sale;
 * a draft that will not be published is removed instead, with the grants it was given
 * and its prices. Nothing is offered for other states. A version an instance ever
 * held is history: the API refuses, and its words are what the person reads.
 */
export function AddonDeleteDraftAction({
  addon,
  appearance,
  onDeleted,
}: AddonDeleteDraftActionProps) {
  const allowed = useCanPerform('addons.delete');
  const { deleteDraft, isPending } = useDeleteAddonDraft(onDeleted);

  return (
    <VersionDraftDeleteAction
      appearance={appearance}
      isPending={isPending}
      keys={DELETE_DRAFT_KEYS}
      name={addon.name}
      offered={allowed && addon.lifecycleState === 'DRAFT'}
      onDelete={(addonSlug) => deleteDraft({ addonSlug })}
      slug={addon.slug}
      version={addon.version}
    />
  );
}
