import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import type { CreateConversionRule, Entitlement, Model } from '@/api-client';
import {
  createConversionRuleMutation,
  updateConversionRuleMutation,
} from '@/api-client/@tanstack/react-query.gen';
import { Button } from '@/components/ui/button';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import { getApiErrorMessage } from '@/lib/errors';
import type { RuleFormProps } from './rule-form';
import { useAiAccess } from './use-ai-access';
import { ruleFormSchema } from './rule-form.schema';
import { RuleMatchingHelp } from './rule-matching-help';
import { FormDetails } from './form-details';
import { AiDecimalField, AiSelectField } from './ai-fields';
import { invalidateAiQueries } from './ai-query-options';
import { RATE_KEYS, presetRates } from './pricing-preview';
import { TypicalPreview, RatePreset } from './rule-pricing';
import { AiSection } from './ai-section';

export function RuleEditor({
  licenseSlug,
  entitlement,
  modelSlug,
  rule,
  onSaved,
  entitlements,
  models,
}: RuleFormProps & { entitlements: Entitlement[]; models: Model[] }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const access = useAiAccess();
  const create = useMutation(createConversionRuleMutation());
  const update = useMutation(updateConversionRuleMutation());
  const [activeRates, setActiveRates] = useState(() =>
    RATE_KEYS.filter(
      (key) => (rule?.rates ?? presetRates('PER_REQUEST'))[key] != null,
    ),
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  useEffect(() => {
    heading.current?.focus();
    heading.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  const form = useAppForm({
    defaultValues: {
      entitlementSlug: entitlement?.slug ?? rule?.entitlementSlug ?? '',
      modelSlug: rule?.modelSlug ?? modelSlug ?? 'ANY',
      requestType: rule?.requestType ?? 'ANY',
      rates: rule?.rates ?? presetRates('PER_REQUEST'),
      minimumCreditsPerRequest: rule?.minimumCreditsPerRequest ?? '0',
      maximumCreditsPerRequest: rule?.maximumCreditsPerRequest ?? null,
      chargeOnError: rule?.chargeOnError ?? 'NEVER',
    } as z.infer<typeof ruleFormSchema>,
    validators: { onChange: ruleFormSchema },
    onSubmit: async ({ value }) => {
      setSaveError(null);
      const body: CreateConversionRule = {
        ...value,
        entitlementSlug: entitlement?.slug ?? value.entitlementSlug,
        maximumCreditsPerRequest: value.maximumCreditsPerRequest ?? null,
        rates: Object.fromEntries(
          RATE_KEYS.map((key) => [key, value.rates[key] ?? null]),
        ),
        modelSlug: value.modelSlug === 'ANY' ? null : value.modelSlug,
        requestType: value.requestType === 'ANY' ? null : value.requestType,
      };
      try {
        if (
          !access.allows(rule ? 'updateConversionRule' : 'createConversionRule')
        )
          throw new Error('AIUsage.Disabled');
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
        setSaveError(getApiErrorMessage(error));
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
        description={
          key === 'perCachedInputToken' || key === 'perCacheWriteToken'
            ? t('AI.Matrix.cacheRateHelp')
            : undefined
        }
      />
    );
  }
  return (
    <form
      className="space-y-5 rounded-lg border bg-card p-4"
      aria-labelledby={headingId}
      onSubmit={createFormSubmitHandler(form.handleSubmit)}
    >
      <form.AppForm>
        <h2
          ref={heading}
          id={headingId}
          tabIndex={-1}
          className="text-lg font-semibold focus-visible:outline focus-visible:outline-ring"
        >
          {licenseSlug} — {t(rule ? 'AI.Matrix.edit' : 'AI.Matrix.create')}
        </h2>
        <p
          role="note"
          className="rounded-md bg-warning-subtle p-3 text-sm text-warning-subtle-foreground"
        >
          {t('AI.Matrix.pendingChanges')}
        </p>
        <AiSection
          title={t('AI.Matrix.scope')}
          description={rule ? t('AI.Matrix.identityLocked') : undefined}
        >
          <div className="grid gap-5 md:grid-cols-3">
            {entitlement ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('AI.pool')}</p>
                <p>{entitlement.name}</p>
                <p className="text-xs text-muted-foreground">
                  {entitlement.slug}
                </p>
              </div>
            ) : (
              <AiSelectField
                form={form}
                name="entitlementSlug"
                label="AI.pool"
                options={entitlements
                  .filter(
                    (item) =>
                      item.type === 'NUMBER_AI_CREDIT' &&
                      item.aggregationMethod === 'SUM',
                  )
                  .flatMap((item) => (item.slug ? [item.slug] : []))}
                disabled={Boolean(rule)}
              />
            )}
            <AiSelectField
              form={form}
              name="modelSlug"
              label="AI.model"
              options={[
                'ANY',
                ...models
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
                  {value.modelSlug === 'ANY'
                    ? value.requestType === 'ANY'
                      ? t('AI.enums.ANY_ALL')
                      : t('AI.enums.ANY_TYPED')
                    : value.requestType === 'ANY'
                      ? t('AI.enums.EXACT_ALL')
                      : t('AI.enums.EXACT_TYPED')}
                </p>
                {value.modelSlug === 'ANY' ? (
                  <p role="note">{t('AI.wildcardWarning')}</p>
                ) : null}
              </>
            )}
          </form.Subscribe>
        </AiSection>
        <AiSection title={t('AI.Matrix.ratesTitle')}>
          <RatePreset
            initialPreset={rule ? 'COMPOSITE' : 'PER_REQUEST'}
            onApply={(rates) => {
              form.setFieldValue('rates', rates);
              setActiveRates(RATE_KEYS.filter((key) => rates[key] != null));
            }}
          />
          <div className="grid gap-5 md:grid-cols-3">
            {activeRates.map(renderRate)}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('AI.Minimal.blankRates')}
          </p>
          <FormDetails
            form={form}
            names={['rates']}
            title={t('AI.Minimal.additionalRates')}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {RATE_KEYS.filter((key) => !activeRates.includes(key)).map(
                renderRate,
              )}
            </div>
          </FormDetails>
        </AiSection>
        <form.Subscribe
          selector={(state) => [
            state.values.minimumCreditsPerRequest,
            state.values.maximumCreditsPerRequest,
            state.values.chargeOnError,
          ]}
        >
          {([minimum, maximum, policy]) => (
            <FormDetails
              form={form}
              names={[
                'minimumCreditsPerRequest',
                'maximumCreditsPerRequest',
                'chargeOnError',
              ]}
              title={`${t('AI.Matrix.guards')} · ${minimum}–${maximum ?? '∞'} · ${t(`AI.enums.${policy}`)}`}
            >
              <div className="grid gap-5 md:grid-cols-3">
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
            </FormDetails>
          )}
        </form.Subscribe>
        <RuleMatchingHelp />
        <form.Subscribe selector={(state) => state.values}>
          {(value) => (
            <TypicalPreview
              rates={value.rates}
              model={models.find((item) => item.slug === value.modelSlug)}
              minimum={value.minimumCreditsPerRequest}
              maximum={value.maximumCreditsPerRequest}
            />
          )}
        </form.Subscribe>
        {saveError ? (
          <p
            role="alert"
            className="text-sm text-destructive-subtle-foreground"
          >
            {saveError}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
          <Button type="button" variant="outline" onClick={onSaved}>
            {t('Common.cancel')}
          </Button>
          <form.SubmitButton
            className="min-h-11 sm:min-h-9"
            label={t('Common.save')}
          />
        </div>
      </form.AppForm>
    </form>
  );
}
