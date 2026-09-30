import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { RolloutDateConfig, RolloutPercentageConfig } from '../../../rollout';
import type { DefaultVariantConfigProps } from './default-variant-config.types';
import {
  BasicVariantSelector,
  DefaultVariantCodegenToggle,
  DefaultVariantTypeSelector,
  FallbackSection,
} from './default-variant-config-sections';
import { renderDefaultVariantSelectField } from './default-variant-config-variant-selector';
import { useDefaultVariantConfig } from './use-default-variant-config';

export type {
  BasicVariant,
  DefaultVariantConfigProps,
  DefaultVariantValue,
  RolloutDate,
  RolloutPercentage,
} from './default-variant-config.types';

export function DefaultVariantConfig({
  value,
  variants,
  onChange,
  fallbackValue,
  onFallbackChange,
}: DefaultVariantConfigProps) {
  const { t } = useTranslation();
  const {
    codegenEnabled,
    fallbackVariantName,
    handleBasicVariantChange,
    handleFallbackValueChange,
    handleFallbackVariantChange,
    handleRolloutDateChange,
    handleRolloutPercentageChange,
    handleToggleCodegen,
    handleTypeChange,
    rolloutDateValue,
    type,
  } = useDefaultVariantConfig({
    fallbackValue,
    onChange,
    onFallbackChange,
    value,
    variants,
  });

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="h-full border-2">
        <CardHeader>
          <CardTitle className="text-base">
            {t('Pages.FeatureFlags.Mutation.Form.Step3.DefaultVariant.title')}
          </CardTitle>
          <CardDescription>
            {t(
              'Pages.FeatureFlags.Mutation.Form.Step3.DefaultVariant.description',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DefaultVariantTypeSelector
            t={t}
            type={type}
            onTypeChange={handleTypeChange}
          />

          {type === 'basic' ? (
            <BasicVariantSelector
              t={t}
              value={value.type === 'basic' ? value.value : ''}
              variants={variants}
              onValueChange={handleBasicVariantChange}
            />
          ) : null}

          {type === 'rollout_date' && rolloutDateValue ? (
            <RolloutDateConfig
              value={rolloutDateValue}
              variants={variants}
              onChange={handleRolloutDateChange}
              renderSelectField={renderDefaultVariantSelectField}
            />
          ) : null}

          {type === 'rollout_percentage' &&
          value.type === 'rollout_percentage' ? (
            <RolloutPercentageConfig
              distribution={value.distribution}
              variants={variants}
              onChange={handleRolloutPercentageChange}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card className="h-full border-2">
        <CardHeader>
          <CardTitle className="text-base">
            {t(
              'Pages.FeatureFlags.Mutation.Form.Step3.DefaultVariant.fallbackVariantLabel',
            )}
          </CardTitle>
          <CardDescription>
            {t(
              'Pages.FeatureFlags.Mutation.Form.Step3.DefaultVariant.fallbackVariantDescription',
            )}
          </CardDescription>
          <CardAction>
            <DefaultVariantCodegenToggle
              ariaLabel={t(
                'Pages.FeatureFlags.Mutation.Form.Step3.DefaultVariant.fallbackVariantLabel',
              )}
              codegenEnabled={codegenEnabled}
              onToggle={handleToggleCodegen}
            />
          </CardAction>
        </CardHeader>
        {codegenEnabled ? (
          <CardContent className="space-y-4">
            <FallbackSection
              t={t}
              fallbackVariantName={fallbackVariantName}
              variants={variants}
              fallbackValue={fallbackValue}
              onVariantChange={handleFallbackVariantChange}
              onFallbackValueChange={handleFallbackValueChange}
            />
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
