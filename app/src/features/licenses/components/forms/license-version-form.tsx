import type { License, LicenseFamilyView } from '@/api-client';
import { LicenseVersionFormLayout } from './license-version-form-layout';
import { useLicenseVersionForm } from './use-license-version-form';

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

export function LicenseVersionForm({
  availableFamilies,
  availableLicenses,
  selectedLicenseSlug,
  baseLicense,
  onSuccess,
  onCancel,
  startAsDraft,
}: LicenseVersionFormProps) {
  const model = useLicenseVersionForm({
    availableFamilies,
    availableLicenses,
    baseLicense,
    onCancel,
    onSuccess,
    selectedLicenseSlug,
    startAsDraft,
  });

  return <LicenseVersionFormLayout {...model} />;
}
