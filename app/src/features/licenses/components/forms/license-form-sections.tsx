import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { TFunction } from 'i18next';
import { generateSlug } from '@/functionals/slug';
import { capitalizeFromUpperCase } from '@/lib/utils';
import { LicenseEntitlementsCard } from '../entitlements/license-entitlements-card';
import type {
  AddEntitlementPayload,
  LicenseEntitlementsCardProps,
} from '../entitlements/license-entitlements-card.types';

type LicenseMainSectionProps = {
  disabled: boolean;
  form: any;
  // Only a new license chooses its starting state; an existing one moves
  // through the actions on its page.
  showCreateAsDraft: boolean;
  t: TFunction;
};

type DraftEntitlementsSectionProps = {
  addDraftEntitlement: (payload: AddEntitlementPayload) => void;
  draftEntitlements: LicenseEntitlementsCardProps['rows'];
  entitlements: LicenseEntitlementsCardProps['entitlements'];
  onDeleteEntitlement: LicenseEntitlementsCardProps['onDeleteEntitlement'];
  onUpdateEntitlementGrant: LicenseEntitlementsCardProps['onUpdateEntitlementGrant'];
};

function getLicenseTypeLabel(option: unknown, t: TFunction) {
  const type = option as 'COMMUNITY' | 'DEVELOPMENT' | 'PAID' | 'TRIAL';

  return t(
    `Pages.Licenses.Mutation.Form.Types.${capitalizeFromUpperCase(type)}`,
  );
}

function handleGetOptionLabel(option: unknown, t: TFunction) {
  return getLicenseTypeLabel(option, t);
}

export function LicenseMainSection({
  disabled,
  form,
  showCreateAsDraft,
  t,
}: LicenseMainSectionProps) {
  function getOptionLabel(option: unknown) {
    return handleGetOptionLabel(option, t);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Pages.Licenses.Mutation.Form.mainTitle')}</CardTitle>
        <CardDescription>
          {t('Pages.Licenses.Mutation.Form.mainDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <form.AppField name="name">
          {(field: any) => (
            <field.TextField
              label={t('Pages.Licenses.Mutation.Form.Labels.name')}
              required
              placeholder={t('Pages.Licenses.Mutation.Form.Placeholders.name')}
              onChange={(value: string) =>
                form.setFieldValue('slug', generateSlug(value))
              }
            />
          )}
        </form.AppField>

        <form.AppField name="slug">
          {(field: any) => (
            <field.TextField
              label={t('Pages.Licenses.Mutation.Form.Labels.slug')}
              placeholder={t('Pages.Licenses.Mutation.Form.Placeholders.slug')}
              description={t('Pages.Licenses.Mutation.Form.Descriptions.slug')}
            />
          )}
        </form.AppField>

        <form.AppField name="type">
          {(field: any) => (
            <field.SelectField
              label={t('Pages.Licenses.Mutation.Form.Labels.type')}
              placeholder={t('Pages.Licenses.Mutation.Form.Placeholders.type')}
              getOptionLabel={getOptionLabel}
              options={['DEVELOPMENT', 'TRIAL', 'PAID', 'COMMUNITY']}
              disabled={disabled}
            />
          )}
        </form.AppField>

        <form.AppField name="versionName">
          {(field: any) => (
            <field.TextField
              label={t('Pages.Licenses.Mutation.Form.Labels.versionName')}
              placeholder={t(
                'Pages.Licenses.Mutation.Form.Placeholders.versionName',
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

        {showCreateAsDraft ? (
          <div className="md:col-span-2">
            <CreateAsDraftField form={form} t={t} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// Shared with the version form: a new version starts as a draft the same way.
export function CreateAsDraftField({
  form,
  t,
}: {
  form: any;
  t: (key: string) => string;
}) {
  return (
    <form.AppField name="createAsDraft">
      {(field: any) => (
        <field.CheckboxField
          label={t('Pages.Licenses.Mutation.Form.Labels.createAsDraft')}
          description={t(
            'Pages.Licenses.Mutation.Form.Descriptions.createAsDraft',
          )}
        />
      )}
    </form.AppField>
  );
}

export function DraftEntitlementsSection({
  addDraftEntitlement,
  draftEntitlements,
  entitlements,
  onDeleteEntitlement,
  onUpdateEntitlementGrant,
}: DraftEntitlementsSectionProps) {
  function handleAddEntitlement(payload: AddEntitlementPayload) {
    addDraftEntitlement(payload);
  }

  return (
    <LicenseEntitlementsCard
      entitlements={entitlements}
      rows={draftEntitlements}
      onAddEntitlement={handleAddEntitlement}
      onUpdateEntitlementGrant={onUpdateEntitlementGrant}
      onDeleteEntitlement={onDeleteEntitlement}
    />
  );
}
