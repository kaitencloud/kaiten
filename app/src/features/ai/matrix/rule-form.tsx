import { Suspense, useState } from 'react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import type { ConversionRule, CreateConversionRuleBody } from '@/api-client';
import {
  createConversionRuleMutation,
  updateConversionRuleMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { zCreateConversionRuleBody } from '@/api-client/zod.gen';
import { allEntitlementsOptions } from '@/lib/api/all-pages-query-options';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { getApiErrorMessage } from '@/lib/errors';
import { AiDecimalField, AiSelectField } from '../ai-fields';
import {
  invalidateAiQueries,
  modelsQueryOptions,
} from '../queries/ai-query-options';
import {
  PRESETS,
  RATE_KEYS,
  presetRates,
  previewCredits,
  previewVendorCost,
  TYPICAL_USAGE,
  maximumBelowMinimum,
} from './pricing-preview';

export const ruleFormSchema = zCreateConversionRuleBody
  .extend({
    chargeOnError: zCreateConversionRuleBody.shape.chargeOnError
      .removeDefault()
      .unwrap(),
    minimumCreditsPerRequest:
      zCreateConversionRuleBody.shape.minimumCreditsPerRequest
        .removeDefault()
        .unwrap(),
    modelSlug: z.string(),
    requestType: z.enum([
      'ANY',
      'COMPLETION',
      'EMBEDDING',
      'IMAGE_GENERATION',
      'AUDIO',
      'VIDEO',
    ]),
  })
  .superRefine((value, ctx) => {
    if (!Object.values(value.rates).some((rate) => rate != null && rate !== ''))
      ctx.addIssue({ code: 'custom', path: ['rates'], message: 'AI.noRate' });
    if (
      value.maximumCreditsPerRequest != null &&
      maximumBelowMinimum(
        value.minimumCreditsPerRequest,
        value.maximumCreditsPerRequest,
      )
    )
      ctx.addIssue({
        code: 'custom',
        path: ['maximumCreditsPerRequest'],
        message: 'AI.invalidMaximum',
      });
  });
function TypicalPreview({ value }: { value: z.infer<typeof ruleFormSchema> }) {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(modelsQueryOptions);
  const model = data.items.find((item) => item.slug === value.modelSlug);
  return (
    <aside className="rounded-md border p-4 space-y-2">
      <h3>{t('AI.Matrix.preview')}</h3>
      <p className="text-sm text-muted-foreground">
        {t('AI.Matrix.typicalUsage')}
      </p>
      <p>
        {t('AI.credits')}:{' '}
        {previewCredits(
          value.rates,
          TYPICAL_USAGE,
          value.minimumCreditsPerRequest,
          value.maximumCreditsPerRequest,
        )}
      </p>
      <p>
        {t('AI.Models.costs')}:{' '}
        {model?.vendorCosts &&
        Object.keys(model.vendorCosts).some((key) => key !== 'currency')
          ? `${previewVendorCost(model.vendorCosts, TYPICAL_USAGE)} USD`
          : t('AI.Matrix.costUnknown')}
      </p>
      <p>{t('AI.Matrix.previewOnly')}</p>
    </aside>
  );
}
export function RuleForm({
  licenseSlug,
  modelSlug,
  rule,
  onSaved,
}: {
  licenseSlug: string;
  modelSlug?: string | null;
  rule?: ConversionRule;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const { data: entitlements } = useSuspenseQuery(allEntitlementsOptions());
  const { data: models } = useSuspenseQuery(modelsQueryOptions);
  const create = useMutation(createConversionRuleMutation());
  const update = useMutation(updateConversionRuleMutation());
  const [preset, setPreset] = useState(rule ? 'COMPOSITE' : 'PER_REQUEST');
  const form = useAppForm({
    defaultValues: {
      entitlementSlug: rule?.entitlementSlug ?? '',
      modelSlug: rule?.modelSlug ?? modelSlug ?? 'ANY',
      requestType: rule?.requestType ?? 'ANY',
      rates: rule?.rates ?? presetRates('PER_REQUEST'),
      minimumCreditsPerRequest: rule?.minimumCreditsPerRequest ?? '0',
      maximumCreditsPerRequest: rule?.maximumCreditsPerRequest ?? null,
      chargeOnError: rule?.chargeOnError ?? 'NEVER',
    } as z.infer<typeof ruleFormSchema>,
    validators: { onChange: ruleFormSchema },
    onSubmit: async ({ value }) => {
      const body: CreateConversionRuleBody = {
        ...value,
        maximumCreditsPerRequest: value.maximumCreditsPerRequest ?? null,
        rates: Object.fromEntries(
          RATE_KEYS.map((key) => [key, value.rates[key] ?? null]),
        ),
        modelSlug: value.modelSlug === 'ANY' ? null : value.modelSlug,
        requestType: value.requestType === 'ANY' ? null : value.requestType,
      };
      try {
        if (rule)
          await update.mutateAsync({
            path: { licenseSlug, ruleId: rule.id },
            body,
          });
        else await create.mutateAsync({ path: { licenseSlug }, body });
        await invalidateAiQueries(client);
        toast.success(t('AI.saved'));
        onSaved();
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      }
    },
  });
  function renderRate(key: (typeof RATE_KEYS)[number]) {
    return (
      <AiDecimalField
        key={key}
        form={form}
        name={`rates.${key}`}
        label={`AI.rates.${key}`}
      />
    );
  }
  function applyPreset() {
    form.setFieldValue('rates', presetRates(preset));
  }
  return (
    <Suspense fallback={null}>
      <form
        className="space-y-4 rounded-md border p-4"
        onSubmit={createFormSubmitHandler(form.handleSubmit)}
      >
        <form.AppForm>
          <h2 className="font-semibold">
            {licenseSlug} — {t(rule ? 'AI.Matrix.edit' : 'AI.Matrix.create')}
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <AiSelectField
              form={form}
              name="entitlementSlug"
              label="AI.pool"
              options={entitlements.items
                .filter(
                  (item) =>
                    item.type === 'NUMBER_AI_CREDIT' &&
                    item.aggregationMethod === 'SUM',
                )
                .flatMap((item) => (item.slug ? [item.slug] : []))}
              disabled={Boolean(rule)}
            />
            <AiSelectField
              form={form}
              name="modelSlug"
              label="AI.model"
              options={[
                'ANY',
                ...models.items
                  .filter(
                    (item) =>
                      item.status === 'ACTIVE' || item.slug === rule?.modelSlug,
                  )
                  .map((item) => item.slug),
              ]}
              disabled={Boolean(rule)}
            />
            <AiSelectField
              form={form}
              name="requestType"
              label="AI.requestType"
              options={[
                'ANY',
                'COMPLETION',
                'EMBEDDING',
                'IMAGE_GENERATION',
                'AUDIO',
                'VIDEO',
              ]}
              disabled={Boolean(rule)}
            />
          </div>
          <form.Subscribe selector={(state) => state.values}>
            {(value) => (
              <>
                <p className="text-sm">
                  {t('AI.Matrix.ladder')}:{' '}
                  {value.modelSlug === 'ANY'
                    ? value.requestType === 'ANY'
                      ? 'ANY_ALL'
                      : 'ANY_TYPED'
                    : value.requestType === 'ANY'
                      ? 'EXACT_ALL'
                      : 'EXACT_TYPED'}
                </p>
                {value.modelSlug === 'ANY' ? (
                  <p role="note">{t('AI.wildcardWarning')}</p>
                ) : null}
                <TypicalPreview value={value} />
              </>
            )}
          </form.Subscribe>
          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="rate-preset">{t('AI.Matrix.preset')}</Label>
              <Input
                id="rate-preset"
                list="rate-presets"
                value={preset}
                onChange={(event) => setPreset(event.target.value)}
              />
              <datalist id="rate-presets">{PRESETS.map(renderPreset)}</datalist>
            </div>
            <Button
              type="button"
              disabled={!PRESETS.some((value) => value === preset)}
              onClick={applyPreset}
            >
              {t('Common.apply')}
            </Button>
          </div>
          <p>{t('AI.Matrix.cachedFallback')}</p>
          <div className="grid gap-4 md:grid-cols-3">
            {RATE_KEYS.map(renderRate)}
          </div>
          <p>{t('AI.noRate')}</p>
          <div className="grid gap-4 md:grid-cols-3">
            <AiDecimalField
              form={form}
              name="minimumCreditsPerRequest"
              label="AI.Matrix.minimum"
            />
            <AiDecimalField
              form={form}
              name="maximumCreditsPerRequest"
              label="AI.Matrix.maximum"
            />
            <AiSelectField
              form={form}
              name="chargeOnError"
              label="AI.Matrix.chargeOnError"
              options={['NEVER', 'ALWAYS', 'PROVIDER_ERROR_ONLY']}
            />
          </div>
          <div className="flex gap-2">
            <form.SubmitButton label={t('Common.save')} />
            <Button type="button" variant="outline" onClick={onSaved}>
              {t('Common.cancel')}
            </Button>
          </div>
        </form.AppForm>
      </form>
    </Suspense>
  );
}
function renderPreset(value: string) {
  return <option key={value} value={value} />;
}
