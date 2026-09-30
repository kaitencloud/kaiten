import { Button } from '@/components/ui/button';
import type { License } from '@/api-client';
import { Page } from '@/functionals/page';
import { createFormSubmitHandler } from '@/hooks/form';
import { LicenseEntitlementsCard } from '../entitlements/license-entitlements-card';
import { LicenseVersionFieldsCard } from './license-version-form-fields';
import { licenseVersionFormSchema } from './license-version-form.schema';
import type { LicenseFamilyOption } from './use-license-version-form-options';

type LicenseVersionFormLayoutProps = {
  addDraftEntitlement: (entitlements: any[], payload: any) => void;
  availableLicenses: License[];
  draftEntitlements: any[];
  entitlements: any[];
  familyOptions: LicenseFamilyOption[];
  form: any;
  handleCancel: () => void;
  inheritedType?: string;
  licensesByFamily: Map<string, License[]>;
  removeDraftEntitlement: (entitlementId: string) => Promise<void> | void;
  resetDraftEntitlements: () => void;
  selectedLicenseSlug?: string;
  selectedLicenseVersionsWithSlug: Array<License & { slug: string }>;
  setSelectedBaseLicenseSlug: (value: string) => void;
  syncDraftEntitlementsFromBase: (baseLicenseSlug: string) => Promise<void>;
  t: (key: string, options?: Record<string, unknown>) => string;
  updateDraftEntitlementGrant: (
    entitlementId: string,
    threshold: number,
    limitCapExceededOveragePercent: number,
  ) => Promise<void> | void;
};

export function LicenseVersionFormLayout({
  addDraftEntitlement,
  availableLicenses,
  draftEntitlements,
  entitlements,
  familyOptions,
  form,
  handleCancel,
  inheritedType,
  licensesByFamily,
  removeDraftEntitlement,
  resetDraftEntitlements,
  selectedLicenseSlug,
  selectedLicenseVersionsWithSlug,
  setSelectedBaseLicenseSlug,
  syncDraftEntitlementsFromBase,
  t,
  updateDraftEntitlementGrant,
}: LicenseVersionFormLayoutProps) {
  return (
    <form onSubmit={createFormSubmitHandler(form.handleSubmit)}>
      <form.AppForm>
        <Page>
          <Page.Header className="sticky top-0 z-20 border-b bg-app-background pb-4">
            <Page.Leading>
              <Page.Heading>
                <form.Subscribe
                  selector={(state: any) => state.values.selectedFamilyId}
                >
                  {(selectedFamilyId: string) => {
                    const familyLabel = familyOptions.find(
                      (option) => option.familyId === selectedFamilyId,
                    )?.label;
                    return (
                      <Page.Title>
                        {familyLabel
                          ? t('Pages.Licenses.Version.titleNewOf', {
                              name: familyLabel,
                            })
                          : t('Pages.Licenses.Version.titleNew')}
                      </Page.Title>
                    );
                  }}
                </form.Subscribe>
                <Page.Subtitle>
                  {t('Pages.Licenses.Version.description')}
                </Page.Subtitle>
              </Page.Heading>
            </Page.Leading>
            <Page.Actions>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  {t('Common.cancel')}
                </Button>
                {/* Opened from a family, the form is complete before any
                    edit: the family, its head version as the base and a
                    suggested name are filled in. Validation only runs on
                    change, so completeness is checked against the schema
                    here rather than read from the form state. */}
                <form.Subscribe
                  selector={(state: any) =>
                    licenseVersionFormSchema.safeParse(state.values).success
                  }
                >
                  {(complete: boolean) => (
                    <form.SubmitButton
                      allowPristine={complete}
                      label={t('Pages.Licenses.Version.createButton')}
                    />
                  )}
                </form.Subscribe>
              </div>
            </Page.Actions>
          </Page.Header>

          <div className="mt-6 space-y-6 pb-6">
            <LicenseVersionFieldsCard
              availableLicenses={availableLicenses}
              familyOptions={familyOptions}
              form={form}
              inheritedType={inheritedType}
              licensesByFamily={licensesByFamily}
              selectedLicenseSlug={selectedLicenseSlug}
              selectedLicenseVersionsWithSlug={selectedLicenseVersionsWithSlug}
              setSelectedBaseLicenseSlug={setSelectedBaseLicenseSlug}
              syncDraftEntitlementsFromBase={syncDraftEntitlementsFromBase}
              t={t}
            />

            <LicenseEntitlementsCard
              description={t(
                'Pages.Licenses.Version.Form.entitlementsDescription',
              )}
              entitlements={entitlements}
              rows={draftEntitlements}
              resetAction={{
                disabled: draftEntitlements.length === 0,
                onReset: resetDraftEntitlements,
              }}
              onAddEntitlement={(payload) =>
                addDraftEntitlement(entitlements, payload)
              }
              onUpdateEntitlementGrant={updateDraftEntitlementGrant}
              onDeleteEntitlement={removeDraftEntitlement}
            />
          </div>
        </Page>
      </form.AppForm>
    </form>
  );
}
