import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { License } from '@/api-client';
import { Label } from '@/components/ui/label';
import { useBillingCapabilities } from '@/domains/billing';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { capitalizeFromUpperCase } from '@/lib/utils';
import { suggestNextVersionName } from '../../utils/license-version-name.utils';
import { CreateAsDraftField } from './license-form-sections';
import type { LicenseFamilyOption } from './use-license-version-form-options';

type LicenseVersionFieldsCardProps = {
  availableLicenses: License[];
  familyOptions: LicenseFamilyOption[];
  form: any;
  inheritedType?: string;
  licensesByFamily: Map<string, License[]>;
  selectedLicenseSlug?: string;
  selectedLicenseVersionsWithSlug: Array<License & { slug: string }>;
  setSelectedBaseLicenseSlug: (value: string) => void;
  syncDraftEntitlementsFromBase: (baseLicenseSlug: string) => Promise<void>;
  t: (key: string) => string;
};

function InheritedTypeField({
  inheritedType,
  t,
}: {
  inheritedType?: string;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-2">
      <Label>{t('Pages.Licenses.Mutation.Form.Labels.type')}</Label>
      <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        {inheritedType
          ? t(
              `Pages.Licenses.Mutation.Form.Types.${capitalizeFromUpperCase(inheritedType)}`,
            )
          : '-'}
      </div>
    </div>
  );
}

// The prices of a version are billing's: where billing is on, a new version
// starts with those of the version it starts from, as it does with its grants,
// and the person may decline them. It says what does not move with them.
function CopyPricesField({
  form,
  t,
}: {
  form: any;
  t: (key: string) => string;
}) {
  const { isEnabled: hasBilling } = useBillingCapabilities();

  if (!hasBilling) {
    return null;
  }

  return (
    <div className="md:col-span-2">
      <form.AppField name="copyPrices">
        {(field: any) => (
          <field.CheckboxField
            description={t(
              'Pages.Licenses.Version.Form.Descriptions.copyPrices',
            )}
            label={t('Pages.Licenses.Version.Form.Labels.copyPrices')}
          />
        )}
      </form.AppField>
    </div>
  );
}

function renderFamilyOption(option: LicenseFamilyOption) {
  return (
    <SelectItem key={option.familyId} value={option.familyId}>
      {option.label}
    </SelectItem>
  );
}

function renderBaseLicenseOption(
  license: License & { slug: string },
  unknownVersionLabel: string,
) {
  const baseVersionLabel = license.versionName?.trim() || unknownVersionLabel;

  return (
    <SelectItem key={license.id} value={license.slug}>
      {baseVersionLabel} - {license.version}
    </SelectItem>
  );
}

function syncVersionFormFromBaseLicense({
  baseLicense,
  familyLicenses,
  form,
  setSelectedBaseLicenseSlug,
  syncDraftEntitlementsFromBase,
}: {
  baseLicense?: License;
  // Every version of the family the base belongs to: the next version name
  // is derived from their names, never copied from the base's own.
  familyLicenses: License[];
  form: any;
  setSelectedBaseLicenseSlug: (value: string) => void;
  syncDraftEntitlementsFromBase: (baseLicenseSlug: string) => Promise<void>;
}) {
  const nextBaseSlug = baseLicense?.slug ?? '';

  form.setFieldValue('baseLicenseSlug', nextBaseSlug);
  form.setFieldValue('baseVersion', baseLicense?.version ?? '');
  form.setFieldValue(
    'versionName',
    suggestNextVersionName(
      familyLicenses.map((license) => license.versionName),
    ),
  );
  form.setFieldValue('description', baseLicense?.description ?? '');
  setSelectedBaseLicenseSlug(nextBaseSlug);
  void syncDraftEntitlementsFromBase(nextBaseSlug);
}

export function LicenseVersionFieldsCard({
  availableLicenses,
  familyOptions,
  form,
  inheritedType,
  licensesByFamily,
  selectedLicenseSlug,
  selectedLicenseVersionsWithSlug,
  setSelectedBaseLicenseSlug,
  syncDraftEntitlementsFromBase,
  t,
}: LicenseVersionFieldsCardProps) {
  const unknownVersionLabel = t('Pages.Licenses.List.unknownVersion');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Pages.Licenses.Version.titleNew')}</CardTitle>
        <CardDescription>
          {t('Pages.Licenses.Version.Form.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <form.AppField name="selectedFamilyId">
          {(field: any) => (
            <div className="space-y-2">
              <Label htmlFor="selected-license-name">
                {t('Pages.Licenses.Version.Form.Labels.licenseName')}
              </Label>
              <Select
                items={familyOptions.map((option) => ({
                  value: option.familyId,
                  label: option.label,
                }))}
                value={field.state.value || null}
                onValueChange={(value) => {
                  field.handleChange(value);
                  syncVersionFormFromBaseLicense({
                    baseLicense: familyOptions.find(
                      (option) => option.familyId === value,
                    )?.headLicense,
                    familyLicenses: licensesByFamily.get(value) ?? [],
                    form,
                    setSelectedBaseLicenseSlug,
                    syncDraftEntitlementsFromBase,
                  });
                }}
                disabled={Boolean(selectedLicenseSlug)}
              >
                <SelectTrigger id="selected-license-name" className="w-full">
                  <SelectValue
                    placeholder={t(
                      'Pages.Licenses.Version.Form.Placeholders.selectLicenseName',
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {familyOptions.map(renderFamilyOption)}
                </SelectContent>
              </Select>
            </div>
          )}
        </form.AppField>

        <form.AppField name="baseLicenseSlug">
          {(field: any) => (
            <div className="space-y-2">
              <Label htmlFor="base-license-slug">
                {t('Pages.Licenses.Version.Form.Labels.baseVersion')}
              </Label>
              <Select
                items={selectedLicenseVersionsWithSlug.map((license) => ({
                  value: license.slug,
                  label: `${license.versionName?.trim() || unknownVersionLabel} - ${license.version}`,
                }))}
                value={field.state.value || null}
                onValueChange={(value) => {
                  field.handleChange(value);
                  syncVersionFormFromBaseLicense({
                    baseLicense: availableLicenses.find(
                      (license) => license.slug === value,
                    ),
                    familyLicenses: selectedLicenseVersionsWithSlug,
                    form,
                    setSelectedBaseLicenseSlug,
                    syncDraftEntitlementsFromBase,
                  });
                }}
                disabled={Boolean(selectedLicenseSlug)}
              >
                <SelectTrigger id="base-license-slug" className="w-full">
                  <SelectValue
                    placeholder={t(
                      'Pages.Licenses.Version.Form.Placeholders.selectBaseVersion',
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {selectedLicenseVersionsWithSlug.map((license) =>
                    renderBaseLicenseOption(license, unknownVersionLabel),
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </form.AppField>

        <InheritedTypeField inheritedType={inheritedType} t={t} />
        <div />
        <form.AppField name="versionName">
          {(field: any) => (
            <field.TextField
              label={t('Pages.Licenses.Mutation.Form.Labels.versionName')}
              placeholder={t(
                'Pages.Licenses.Version.Form.Placeholders.versionName',
              )}
            />
          )}
        </form.AppField>
        <div className="md:col-span-2">
          <form.AppField name="description">
            {(field: any) => (
              <field.TextField
                label={t('Pages.Licenses.Mutation.Form.Labels.description')}
                placeholder={t(
                  'Pages.Licenses.Mutation.Form.Placeholders.description',
                )}
              />
            )}
          </form.AppField>
        </div>
        <div className="md:col-span-2">
          <CreateAsDraftField form={form} t={t} />
        </div>
        <CopyPricesField form={form} t={t} />
      </CardContent>
    </Card>
  );
}
