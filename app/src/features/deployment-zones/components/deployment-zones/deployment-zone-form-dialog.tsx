import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { metadataFieldsActiveQueryOptions } from '@/domains/metadata-fields';
import {
  formatZoneType,
  getZoneTypeSuggestions,
} from '@/domains/release-management';
import {
  buildFormFieldsFromSchema,
  type MetadataFieldDescriptor,
} from '@/functionals/metadata-fields';
import { generateSlug } from '@/functionals/slug';
import {
  StackedFormDialog,
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler } from '@/hooks/form';
import { useDeploymentZoneForm } from '../../hooks/use-deployment-zone-form';
import { useDeploymentZoneFormDialogStore } from '../../hooks/use-deployment-zone-form-dialog-store';
import { deploymentZonesQueryOptions } from '../../queries';
import type { DeploymentZoneFormValues } from '../../schemas/deployment-zone.schema';
import type { DeploymentZone } from '../../types';
import {
  RawMetadataField,
  sanitizeTypedMetadataValue,
  TypedMetadataField,
} from './deployment-zone-metadata-fields';

export function DeploymentZoneFormDialog({
  deploymentZone,
  open,
  onOpenChange,
  onSuccess,
}: {
  deploymentZone?: DeploymentZone;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const { t } = useTranslation();
  const formId = useId();

  // Typed inputs from the active MetadataField schema.
  // We do NOT block the dialog on this fetch: if the call fails or the
  // user has no read scope, the form falls back to the raw-JSON textarea
  // that predates the schema work. The pull is cheap (≤dozens of rows)
  // and re-uses the page-level cache from the table.
  const { data: metadataFieldsData } = useQuery(
    metadataFieldsActiveQueryOptions('DEPLOYMENT_ZONE'),
  );
  const metadataFields = useMemo<MetadataFieldDescriptor[]>(
    () => metadataFieldsData ?? [],
    [metadataFieldsData],
  );
  const formFields = useMemo(
    () => buildFormFieldsFromSchema(metadataFields),
    [metadataFields],
  );
  // The type is free-form. The form suggests the three classes the console
  // knows plus every type the organization already uses, so a new zone gets
  // `dedicated` rather than a second spelling of it. Not awaited: without the
  // list the three classes are still offered.
  const { data: existingZones } = useQuery(deploymentZonesQueryOptions);
  const zoneTypeSuggestions = useMemo(
    () =>
      getZoneTypeSuggestions([
        ...(existingZones?.items ?? []).map((zone) => zone.type),
        ...(deploymentZone ? [deploymentZone.type] : []),
      ]),
    [deploymentZone, existingZones],
  );
  const useDynamicForm = metadataFields.length > 0;
  // Without declared fields the raw JSON editor is the only way in, but it
  // is not the first thing to show a newcomer: an existing value opens it,
  // otherwise the empty state points to the settings and offers it on demand.
  const [showRawMetadata, setShowRawMetadata] = useState(() =>
    Boolean(
      deploymentZone?.metadata &&
      Object.keys(deploymentZone.metadata).length > 0,
    ),
  );
  // The form captures `prepareValues` once, so a ref is the only way to hand it
  // the current fields. Written after commit, read only on submit -- never
  // during a render.
  const metadataFieldsRef = useRef<MetadataFieldDescriptor[]>(metadataFields);
  useEffect(() => {
    metadataFieldsRef.current = metadataFields;
  }, [metadataFields]);

  const prepareValues = useCallback(
    (values: DeploymentZoneFormValues): DeploymentZoneFormValues => {
      const currentMetadataFields = metadataFieldsRef.current;
      if (currentMetadataFields.length === 0) return values;

      return {
        ...values,
        metadata: sanitizeTypedMetadataValue(
          values.metadata,
          currentMetadataFields,
        ),
      };
    },
    [],
  );

  const { form, isEditing, isLoading } = useDeploymentZoneForm({
    deploymentZone,
    onSuccess: onSuccess ?? (() => onOpenChange(false)),
    prepareValues,
  });

  const initialFeaturesJson = useMemo(
    () => JSON.stringify(deploymentZone?.metadata || {}, null, 2),
    [deploymentZone?.metadata],
  );
  const {
    featuresError,
    featuresJson,
    resetFeaturesState,
    setFeaturesError,
    setFeaturesJson,
  } = useDeploymentZoneFormDialogStore(initialFeaturesJson);

  useEffect(() => {
    if (!open) {
      return;
    }

    resetFeaturesState(initialFeaturesJson);
  }, [initialFeaturesJson, open, resetFeaturesState]);

  return (
    <StackedFormDialog
      className="sm:max-w-2xl"
      confirmOnClose={false}
      open={open}
      onOpenChange={onOpenChange}
      title={
        isEditing
          ? t('Features.Releases.Form.editZone')
          : t('Features.Releases.Form.createZone')
      }
    >
      <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
        <form.AppForm>
          <StackedFormDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t('Common.cancel')}
            </Button>
            <form.SubmitButton
              form={formId}
              label={isEditing ? t('Common.update') : t('Common.create')}
            />
          </StackedFormDialogFooter>
          <StackedFormDialogPanel>
            <div className="space-y-6">
              <form.AppField name="name">
                {(field) => (
                  <field.TextField
                    label={t('Features.Releases.Form.name')}
                    required
                    placeholder="Production EU"
                    onChange={(value) =>
                      form.setFieldValue('slug', generateSlug(value))
                    }
                  />
                )}
              </form.AppField>

              <form.AppField name="slug">
                {(field) => (
                  <field.TextField
                    label={t('Features.Releases.Form.slug')}
                    placeholder={t(
                      'Features.Releases.Form.zoneSlugPlaceholder',
                    )}
                    description={t('Features.Releases.Form.slugDescription')}
                  />
                )}
              </form.AppField>

              <form.AppField name="type">
                {(field) => (
                  <field.ComboboxField
                    allowCustomValue
                    label={t('Features.Releases.Form.type')}
                    required
                    description={t('Features.Releases.Form.typeDescription')}
                    placeholder={t('Features.Releases.Form.selectType')}
                    searchPlaceholder={t('Features.Releases.Form.searchType')}
                    options={zoneTypeSuggestions}
                    getOptionLabel={(type) => formatZoneType(type as string, t)}
                    getOptionValue={(type) => type as string}
                  />
                )}
              </form.AppField>

              <form.AppField name="description">
                {(field) => (
                  <field.TextAreaField
                    label={t('Features.Releases.Form.description')}
                    required
                    placeholder={t(
                      'Features.Releases.Form.zoneDescriptionPlaceholder',
                      'Describe this deployment zone...',
                    )}
                  />
                )}
              </form.AppField>

              <form.AppField name="metadata">
                {(field) =>
                  useDynamicForm ? (
                    <TypedMetadataField
                      metadataFields={metadataFields}
                      formFields={formFields}
                      // TanStack Form's `state.value` carries the metadata
                      // map as written into the form. We treat the field
                      // as the source of truth and let DynamicForm push
                      // back through `handleChange`. The optional chain
                      // keeps tests with a partially-mocked AppField
                      // shim from blowing up before the form mounts.
                      value={
                        (field.state?.value as
                          | Record<string, unknown>
                          | null
                          | undefined) ?? null
                      }
                      onChange={(next) => field.handleChange(next)}
                    />
                  ) : !showRawMetadata ? (
                    <div className="rounded-md border border-dashed px-4 py-5 text-center">
                      <p className="text-sm font-medium">
                        {t(
                          'Features.Releases.Form.noMetadataFieldsTitle',
                          'No metadata field declared',
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(
                          'Features.Releases.Form.noMetadataFieldsDescription',
                          'Declare deployment zone metadata fields in the settings to fill them here, or edit the raw JSON.',
                        )}
                      </p>
                      <div className="mt-3 flex flex-wrap justify-center gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            to="/settings/metadata"
                            search={{ resourceType: 'DEPLOYMENT_ZONE' }}
                          >
                            {t(
                              'Features.Releases.Form.configureMetadataFields',
                              'Configure metadata fields',
                            )}
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowRawMetadata(true)}
                        >
                          {t(
                            'Features.Releases.Form.editAsJson',
                            'Edit as JSON',
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <RawMetadataField
                      featuresError={featuresError}
                      featuresJson={featuresJson}
                      onChange={(value) => {
                        setFeaturesJson(value);
                        try {
                          const parsed = JSON.parse(value);
                          field.handleChange(parsed);
                          setFeaturesError(null);
                        } catch {
                          setFeaturesError(
                            t(
                              'Features.Releases.Form.invalidJson',
                              'Invalid JSON format',
                            ),
                          );
                        }
                      }}
                      label={t('Features.Releases.Form.metadata')}
                      help={t(
                        'Features.Releases.Form.metadataHelp',
                        'Metadata as JSON object',
                      )}
                    />
                  )
                }
              </form.AppField>
            </div>
          </StackedFormDialogPanel>
        </form.AppForm>
      </form>
    </StackedFormDialog>
  );
}
