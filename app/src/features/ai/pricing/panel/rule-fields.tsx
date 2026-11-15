import { useStore } from '@tanstack/react-form';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { withForm } from '@/hooks/form';
import type { AiRequestType, RateKey } from '../engine';
import { PanelSection } from './panel-shell';
import { RuleDecimalField } from './rule-decimal-field';
import {
  CHARGE_POLICIES,
  presetRates,
  presetsFor,
  RATE_KEYS,
  type RatePreset,
  relevantRates,
  ruleFormOpts,
} from './rule-form.schema';

const RATE_LABEL_KEYS = {
  perRequest: 'AI.Panel.form.rates.perRequest',
  perInputToken: 'AI.Panel.form.rates.perInputToken',
  perCachedInputToken: 'AI.Panel.form.rates.perCachedInputToken',
  perCacheWriteToken: 'AI.Panel.form.rates.perCacheWriteToken',
  perOutputToken: 'AI.Panel.form.rates.perOutputToken',
  perUnit: 'AI.Panel.form.rates.perUnit',
  perSecond: 'AI.Panel.form.rates.perSecond',
} as const satisfies Record<RateKey, string>;

const PRESET_LABEL_KEYS = {
  PER_REQUEST: 'AI.Panel.form.presets.PER_REQUEST',
  INPUT_OUTPUT: 'AI.Panel.form.presets.INPUT_OUTPUT',
  TOKENS_WITH_CACHE: 'AI.Panel.form.presets.TOKENS_WITH_CACHE',
  PER_UNIT: 'AI.Panel.form.presets.PER_UNIT',
  PER_SECOND: 'AI.Panel.form.presets.PER_SECOND',
} as const satisfies Record<RatePreset, string>;

const POLICY_LABEL_KEYS = {
  NEVER: 'AI.Panel.form.policies.NEVER',
  PROVIDER_ERROR_ONLY: 'AI.Panel.form.policies.PROVIDER_ERROR_ONLY',
  ALWAYS: 'AI.Panel.form.policies.ALWAYS',
} as const satisfies Record<(typeof CHARGE_POLICIES)[number], string>;

const INHERITS_INPUT: readonly RateKey[] = [
  'perCachedInputToken',
  'perCacheWriteToken',
];

type RuleRatesSectionProps = {
  disabled: boolean;
  /** The request type the rule names; null for a rule of any type. */
  requestType: AiRequestType | null;
  /** The request type of the tab, which picks the presets offered. */
  type: AiRequestType;
};

/**
 * The seven rates. A preset only chooses which of them are in view and puts
 * the cursor in the first: it fills nothing in. A rate that holds a value is
 * always in view, so nothing typed is ever out of sight.
 */
export const RuleRatesSection = withForm({
  ...ruleFormOpts,
  props: {} as RuleRatesSectionProps,
  render: function RuleRatesSectionRender({
    disabled,
    form,
    requestType,
    type,
  }) {
    const { t } = useTranslation();
    const [preset, setPreset] = useState<RatePreset | null>(null);
    const rates = useStore(form.store, (state) => state.values.rates);
    const inView = preset
      ? presetRates(preset, type)
      : relevantRates(requestType);
    const visible = RATE_KEYS.filter(
      (key) => inView.includes(key) || rates[key] != null,
    );
    const others = RATE_KEYS.filter((key) => !visible.includes(key));

    function renderRate(key: RateKey) {
      return (
        <form.AppField key={key} name={`rates.${key}`}>
          {(field) => (
            <RuleDecimalField
              disabled={disabled}
              errorKey="AI.Panel.form.errors.rate"
              field={field}
              hint={key}
              label={t(RATE_LABEL_KEYS[key])}
              placeholder={t(
                INHERITS_INPUT.includes(key)
                  ? 'AI.Panel.form.inheritsInput'
                  : 'AI.Panel.form.unpriced',
              )}
            />
          )}
        </form.AppField>
      );
    }

    function renderPreset(item: RatePreset) {
      return (
        <Button
          aria-pressed={preset === item}
          className="h-6 rounded-full border border-dashed border-border px-2.5 text-xs font-normal shadow-none aria-pressed:border-solid aria-pressed:border-primary"
          disabled={disabled}
          key={item}
          onClick={() => setPreset(preset === item ? null : item)}
          size="xs"
          type="button"
          variant="outline"
        >
          {t(PRESET_LABEL_KEYS[item])}
        </Button>
      );
    }

    return (
      <PanelSection
        aside={t('AI.Panel.form.blankHint')}
        title={t('AI.Panel.form.ratesTitle')}
      >
        <div
          aria-label={t('AI.Panel.form.presetsLabel')}
          className="flex flex-wrap gap-1.5"
          role="group"
        >
          {presetsFor(type).map(renderPreset)}
        </div>
        <div className="flex flex-col gap-2">{visible.map(renderRate)}</div>
        {others.length > 0 ? (
          <details className="text-[0.8125rem]">
            <summary className="cursor-pointer text-muted-foreground">
              {t('AI.Panel.form.otherRates', { count: others.length })}
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {others.map(renderRate)}
            </div>
          </details>
        ) : null}
      </PanelSection>
    );
  },
});

/** The bounds of a charge and what an error charges. */
export const RuleLimitsSection = withForm({
  ...ruleFormOpts,
  props: {} as { disabled: boolean },
  render: function RuleLimitsSectionRender({ disabled, form }) {
    const { t } = useTranslation();

    return (
      <PanelSection title={t('AI.Panel.form.limitsTitle')}>
        <div className="grid grid-cols-2 items-start gap-3">
          <form.AppField name="minimumCreditsPerRequest">
            {(field) => (
              <RuleDecimalField
                disabled={disabled}
                errorKey="AI.Panel.form.errors.bound"
                field={field}
                label={t('AI.Panel.form.minimum')}
                layout="stack"
                placeholder="0"
              />
            )}
          </form.AppField>
          <form.AppField name="maximumCreditsPerRequest">
            {(field) => (
              <RuleDecimalField
                disabled={disabled}
                errorKey="AI.Panel.form.errors.bound"
                field={field}
                label={t('AI.Panel.form.maximum')}
                layout="stack"
                placeholder={t('AI.Panel.form.noCap')}
              />
            )}
          </form.AppField>
        </div>
        <form.AppField name="chargeOnError">
          {(field) => (
            <field.SelectField
              disabled={disabled}
              getOptionLabel={(option) =>
                t(POLICY_LABEL_KEYS[option as (typeof CHARGE_POLICIES)[number]])
              }
              label={t('AI.Panel.form.chargeOnError')}
              options={[...CHARGE_POLICIES]}
            />
          )}
        </form.AppField>
      </PanelSection>
    );
  },
});
