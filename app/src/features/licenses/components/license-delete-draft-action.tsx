import type { License } from '@/api-client';
import {
  type RowActionAppearance,
  useBillingCapabilities,
  VersionDraftDeleteAction,
} from '@/domains/billing';
import { useDeleteLicenseDraft } from '../hooks/use-delete-license-draft';
import { DELETE_DRAFT_KEYS } from '../utils/license-lifecycle-keys';
import { getLicenseLifecycleState } from '../utils/license-lifecycle.utils';

type LicenseDeleteDraftActionProps = {
  appearance: RowActionAppearance;
  license: Pick<License, 'lifecycleState' | 'name' | 'slug' | 'version'>;
  onDeleted?: () => void;
};

// Deletes a draft, confirmed first. Archiving is for versions that have been
// on sale; a draft that will not be published is removed instead, with the
// grants it was given. Nothing is offered for other states.
export function LicenseDeleteDraftAction({
  appearance,
  license,
  onDeleted,
}: LicenseDeleteDraftActionProps) {
  // A draft is deleted with its prices, which only exist where billing is on.
  const { isEnabled: hasBilling } = useBillingCapabilities();
  const { deleteDraft, isPending } = useDeleteLicenseDraft(onDeleted);

  return (
    <VersionDraftDeleteAction
      appearance={appearance}
      isPending={isPending}
      keys={{
        confirm: DELETE_DRAFT_KEYS.confirm,
        description: hasBilling
          ? DELETE_DRAFT_KEYS.descriptionBilling
          : DELETE_DRAFT_KEYS.description,
        label: DELETE_DRAFT_KEYS.label,
        title: DELETE_DRAFT_KEYS.title,
      }}
      name={license.name}
      offered={getLicenseLifecycleState(license) === 'DRAFT'}
      onDelete={(licenseSlug) => deleteDraft({ licenseSlug })}
      slug={license.slug}
      version={license.version}
    />
  );
}
