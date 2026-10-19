import { Suspense } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { getApiErrorMessage } from '@/lib/errors';
import { AiDecimalField, AiSelectField, AiTextField } from '../ai-fields';
import {
  invalidateAiQueries,
  wildcardQueryOptions,
} from '../queries/ai-query-options';

const costs = [
  'perRequest',
  'perInputToken',
  'perCachedInputToken',
  'perCacheWriteToken',
  'perOutputToken',
  'perUnit',
] as const;
function WildcardImpact() {
  const { t } = useTranslation();
  const query = useQuery(wildcardQueryOptions);
  function renderImpact(
    row: { licenseSlug: string; entitlementSlug: string },
    index: number,
  ) {
    return (
      <li key={`${row.licenseSlug}-${row.entitlementSlug}-${index}`}>
        {row.licenseSlug} / {row.entitlementSlug}
      </li>
    );
  }
  return (
    <aside className="rounded-md border p-4 space-y-2">
      <p>{t('AI.wildcardWarning')}</p>
      {query.isPending ? (
        <p>{t('Common.loading')}</p>
      ) : query.isError ? (
        <p role="alert">
          {getApiErrorMessage(query.error)}{' '}
          <Button type="button" onClick={() => query.refetch()}>
            {t('Common.retry')}
          </Button>
        </p>
      ) : (
        <ul>{query.data.map(renderImpact)}</ul>
      )}
    </aside>
  );
}
export function ModelForm({ model }: { model?: Model }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const create = useMutation(createModelMutation());
  const update = useMutation(updateModelMutation());
  const defaults: ModelWritable = model
    ? {
        name: model.name,
        slug: model.slug,
        vendor: model.vendor,
        description: model.description ?? '',
        modality: model.modality,
        status: model.status,
        externalIds: model.externalIds ?? [],
        metadata: model.metadata ?? {},
        vendorCosts: { currency: 'USD', ...model.vendorCosts },
      }
    : {
        name: '',
        slug: '',
        vendor: '',
        description: '',
        modality: 'TEXT',
        status: 'ACTIVE',
        externalIds: [],
        metadata: {},
        vendorCosts: { currency: 'USD' },
      };
  const form = useAppForm({
    defaultValues: defaults,
    validators: { onChange: modelFormSchema },
    onSubmit: async ({ value }) => {
      try {
        if (model)
          await update.mutateAsync({
            path: { modelSlug: model.slug },
            body: {
              ...value,
              externalIds: value.externalIds
                ?.map((id) => id.trim())
                .filter(Boolean),
            },
          });
        else
          await create.mutateAsync({
            body: {
              ...value,
              externalIds: value.externalIds
                ?.map((id) => id.trim())
                .filter(Boolean),
            },
          });
        await invalidateAiQueries(client);
        toast.success(t('AI.saved'));
        await navigate({ to: '/ai/models' });
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      }
    },
  });
  function renderCost(key: (typeof costs)[number]) {
    return (
      <AiDecimalField
        key={key}
        form={form}
        name={`vendorCosts.${key}`}
        label={`AI.rates.${key}`}
      />
    );
  }
  return (
    <Page>
      <Page.Header>
        <Page.Title>
          {t(model ? 'AI.Models.edit' : 'AI.Models.create')}
        </Page.Title>
        <Page.Actions>
          <Button render={<Link to="/ai/models" />}>
            {t('Common.cancel')}
          </Button>
        </Page.Actions>
      </Page.Header>
      <Suspense fallback={null}>
        <form
          className="max-w-4xl space-y-5"
          onSubmit={createFormSubmitHandler(form.handleSubmit)}
        >
          <form.AppForm>
            <div className="grid gap-4 md:grid-cols-2">
              <AiTextField form={form} name="name" label="AI.name" required />
              <AiTextField
                form={form}
                name="slug"
                label="AI.slug"
                required
                disabled={Boolean(model)}
              />
              <AiTextField
                form={form}
                name="vendor"
                label="AI.vendor"
                required
              />
              <AiSelectField
                form={form}
                name="modality"
                label="AI.modality"
                options={[
                  'TEXT',
                  'IMAGE',
                  'AUDIO',
                  'VIDEO',
                  'EMBEDDING',
                  'MULTIMODAL',
                ]}
                disabled={Boolean(model)}
              />
              <AiSelectField
                form={form}
                name="status"
                label="AI.status"
                options={['ACTIVE', 'DEPRECATED', 'ARCHIVED']}
              />
              <AiTextField
                form={form}
                name="description"
                label="AI.description"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {t('AI.Models.lifecycle')}
            </p>
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
            <h2 className="font-semibold">{t('AI.Models.costs')}</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {costs.map(renderCost)}
            </div>
            {!model ? <WildcardImpact /> : null}
            <form.SubmitButton label={t('Common.save')} />
          </form.AppForm>
        </form>
      </Suspense>
    </Page>
  );
}
