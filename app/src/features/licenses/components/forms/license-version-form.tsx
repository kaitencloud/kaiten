import type { License, LicenseFamilyView } from '@/api-client';
import {
  FormRecoveryAnnouncer,
  useFormRecovery,
} from '@/functionals/form-recovery';
import { LicenseVersionFormLayout } from './license-version-form-layout';
import { licenseVersionRecovery } from './license-version-recovery';
import {
  type LicenseVersionRecovery,
  useLicenseVersionForm,
} from './use-license-version-form';
import { useLicenseVersionFormOptions } from './use-license-version-form-options';

export {
  licenseVersionFormSchema,
  licenseVersionFormValuesToLicenseInput,
} from './license-version-form.schema';

type LicenseVersionFormProps = {
  availableFamilies: LicenseFamilyView[];
  availableLicenses: License[];
  selectedLicenseSlug?: string;
  baseLicense?: License;
  onSuccess?: () => void;
  onCancel?: () => void;
  /** The version is offered as a draft, which is how a version is made to be changed. */
  startAsDraft?: boolean;
};

/**
 * The page of a new version. What it typed and did not send, its grants included, is
 * kept on the device and offered back on the next visit (`licenseVersionRecovery`):
 * a page opened from a version only offers what was begun from that version. The
 * door is opened here, outside the form, so that a resume mounts the form again on
 * the restored values.
 */
export function LicenseVersionForm({
  availableFamilies,
  availableLicenses,
  selectedLicenseSlug,
  baseLicense,
  onSuccess,
  onCancel,
  startAsDraft,
}: LicenseVersionFormProps) {
  const formOptions = useLicenseVersionFormOptions({
    availableFamilies,
    availableLicenses,
    baseLicense,
    selectedLicenseSlug,
    startAsDraft,
  });
  const openedFrom = selectedLicenseSlug || baseLicense?.slug;
  // `?draft=true` does not change what is created: it is in the initial values, not
  // in the context.
  const recovery = useFormRecovery(licenseVersionRecovery, {
    context: openedFrom ? `base:${openedFrom}` : '',
    enabled: true,
    pristine: formOptions.initialValues,
  });

  return (
    <>
      <FormRecoveryAnnouncer recovery={recovery} />
      <LicenseVersionFormContent
        key={recovery.sessionKey}
        availableLicenses={availableLicenses}
        formOptions={formOptions}
        recovery={recovery}
        selectedLicenseSlug={selectedLicenseSlug}
        onCancel={onCancel}
        onSuccess={onSuccess}
      />
    </>
  );
}

function LicenseVersionFormContent(
  props: Parameters<typeof useLicenseVersionForm>[0] & {
    recovery: LicenseVersionRecovery;
  },
) {
  const model = useLicenseVersionForm(props);

  return <LicenseVersionFormLayout {...model} />;
}
