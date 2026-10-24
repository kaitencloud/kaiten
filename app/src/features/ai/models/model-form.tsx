import { SourceEntryDetails } from './openrouter-browser';
import { WildcardImpact } from './model-wildcard-impact';
import {
  FormDetails,
  useAiNavigationContext,
  modelsQueryOptions,
} from '@/domains/ai-credits';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Model, ModelWritable } from '@/api-client';
import {
  createModelMutation,
  updateModelMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { modelFormSchema } from './model-form.schema';
import FormField from '@/components/form/fields/form-field';
import FormControl from '@/components/form/form-control';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Page } from '@/functionals/page';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { AiDecimalField, AiSelectField, AiTextField } from '../ai-fields';
import { invalidateAiQueries } from '../queries/ai-query-options';
import {
  associateOpenRouterSource,
  modelToOpenRouterWritable,
} from './openrouter-sync';
import {
  assertOpenRouterIdentityAvailable,
  type OpenRouterEntry,
} from './openrouter-catalogue';
import { freshModelFormBody } from './model-form-write';
import { openRouterErrorMessage } from './openrouter-ui';

const costs = [
  'perRequest',
  'perInputToken',
  'perCachedInputToken',
  'perCacheWriteToken',
  'perOutputToken',
  'perUnit',
] as const;
export const MODEL_MODALITIES = [
  'TEXT',
  'IMAGE',
  'AUDIO',
  'VIDEO',
  'EMBEDDING',
  'MULTIMODAL',
] as const;
type ModelFormProps = {
  model?: Model;
  initialDraft?: ModelWritable;
  sourceOrigin?: { entry: OpenRouterEntry; checkedAt: string };
  onCancel?: () => void;
};
export function ModelForm({
  model,
  initialDraft,
  sourceOrigin,
  onCancel,
}: ModelFormProps) {
  const context = useAiNavigationContext();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const create = useMutation(createModelMutation());
  const update = useMutation(updateModelMutation());
  const [defaults] = useState<ModelWritable>(() =>
    model
      ? {
          ...modelToOpenRouterWritable(model),
          description: model.description ?? '',
        }
      : (initialDraft ?? {
          name: '',
          slug: '',
          vendor: '',
          description: '',
          modality: 'TEXT',
          status: 'ACTIVE',
          externalIds: [],
          metadata: {},
          vendorCosts: { currency: 'USD' },
        }),
  );
  const form = useAppForm({
    defaultValues: defaults,
    validators: { onChange: modelFormSchema },
    onSubmit: async ({ value }) => {
      setSaveError(null);
      try {
        const edited = {
          ...value,
          externalIds: value.externalIds
            ?.map((id) => id.trim())
            .filter(Boolean),
        };
        if (model) {
          const body = await freshModelFormBody(model, edited, {
            ...defaults,
            externalIds: defaults.externalIds
              ?.map((id) => id.trim())
              .filter(Boolean),
          });
          await update.mutateAsync({ path: { modelSlug: model.slug }, body });
        } else {
          if (sourceOrigin) {
            if (!consent) {
              setSaveError(t('AI.OpenRouter.consentRequired'));
              return;
            }
            edited.externalIds = [
              ...new Set([
                ...(edited.externalIds ?? []),
                sourceOrigin.entry.id,
              ]),
            ];
            const catalogue = await client.fetchQuery({
              ...modelsQueryOptions,
              staleTime: 0,
            });
            assertOpenRouterIdentityAvailable(edited, catalogue.items);
            // Association records provenance only, not a claim that edited prices are provider snapshots.
            edited.metadata = associateOpenRouterSource(
              edited.metadata,
              sourceOrigin.entry.id,
              sourceOrigin.checkedAt,
            );
          }
          await create.mutateAsync({ body: edited });
        }
        await invalidateAiQueries(client);
        toast.success(t('AI.saved'));
        await navigate({ to: '/catalog/models', search: context });
      } catch (error) {
        const message = openRouterErrorMessage(error, t);
        setSaveError(message);
        toast.error(message);
      }
    },
  });
  return (
    <Page>
      <Page.Header>
        <Page.Title>
          {t(
            sourceOrigin
              ? 'AI.OpenRouter.reviewImport'
              : model
                ? 'AI.Models.edit'
                : 'AI.Models.create',
          )}
        </Page.Title>
        {model ? (
          <Page.Actions>
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  to="/catalog/models/$modelSlug/source"
                  params={{ modelSlug: model.slug }}
                  search={context}
                />
              }
            >
              {t('AI.OpenRouter.sourcePricing')}
            </Button>
          </Page.Actions>
        ) : null}
      </Page.Header>
      {sourceOrigin ? <SourceEntryDetails entry={sourceOrigin.entry} /> : null}
      <form
        className="max-w-3xl space-y-5"
        onSubmit={createFormSubmitHandler(form.handleSubmit)}
      >
        <form.AppForm>
          <div className="grid gap-4 sm:grid-cols-2">
            <AiTextField form={form} name="name" label="AI.name" required />
            <AiTextField
              form={form}
              name="slug"
              label="AI.slug"
              required
              disabled={Boolean(model)}
              description={t(
                model ? 'AI.Models.slugLocked' : 'AI.Models.slugHelp',
              )}
            />
            <AiTextField form={form} name="vendor" label="AI.vendor" required />
            <AiSelectField
              form={form}
              name="modality"
              label="AI.modality"
              options={[...MODEL_MODALITIES]}
              disabled={Boolean(model)}
              description={model ? t('AI.Models.modalityLocked') : undefined}
            />
            {model ? (
              <AiSelectField
                form={form}
                name="status"
                label="AI.status"
                options={['ACTIVE', 'DEPRECATED', 'ARCHIVED']}
              />
            ) : null}
          </div>
          <FormDetails
            form={form}
            names={['description', 'externalIds', 'vendorCosts']}
            title={t('AI.Minimal.modelDetails')}
          >
            <AiTextField
              form={form}
              name="description"
              label="AI.description"
            />
            <form.AppField name="externalIds">
              {() => (
                <FormField<string[] | undefined>
                  label={t('AI.Models.externalIds')}
                >
                  {(field) => (
                    <FormControl>
                      <Textarea
                        value={(field.value ?? []).join('\n')}
                        onChange={(event) =>
                          field.handleChange(event.target.value.split('\n'))
                        }
                        onBlur={field.handleBlur}
                      />
                    </FormControl>
                  )}
                </FormField>
              )}
            </form.AppField>
            <p className="text-sm text-muted-foreground">
              {t('AI.Minimal.vendorUnits')}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {costs.map((key) => (
                <AiDecimalField
                  key={key}
                  form={form}
                  name={`vendorCosts.${key}`}
                  label={`AI.rates.${key}`}
                />
              ))}
            </div>
          </FormDetails>
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer">
              {t('AI.Minimal.lifecycleHelp')}
            </summary>
            <p className="mt-2">{t('AI.Models.lifecycle')}</p>
          </details>
          {!model ? (
            <WildcardImpact />
          ) : (
            <form.Subscribe selector={(state) => state.values.status}>
              {(status) =>
                status !== model.status ? (
                  <p
                    role="alert"
                    className="rounded-md bg-warning-subtle p-3 text-sm text-warning-subtle-foreground"
                  >
                    {t('AI.Models.modelImpact')} {t('AI.Models.lifecycle')}
                  </p>
                ) : null
              }
            </form.Subscribe>
          )}
          {sourceOrigin ? (
            <label className="flex items-start gap-3 text-sm">
              <input
                className="mt-1"
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              {t('AI.OpenRouter.importConsent', { id: sourceOrigin.entry.id })}
            </label>
          ) : null}
          {saveError ? (
            <p
              role="alert"
              className="text-sm text-destructive-subtle-foreground"
            >
              {saveError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel}>
                {t('Common.cancel')}
              </Button>
            ) : (
              <Button
                nativeButton={false}
                variant="outline"
                render={<Link to="/catalog/models" search={context} />}
              >
                {t('Common.cancel')}
              </Button>
            )}
            <form.SubmitButton
              allowPristine={Boolean(sourceOrigin)}
              className="min-h-11 sm:min-h-9"
              label={t(
                sourceOrigin ? 'AI.OpenRouter.importModel' : 'Common.save',
              )}
            />
          </div>
        </form.AppForm>
      </form>
    </Page>
  );
}
