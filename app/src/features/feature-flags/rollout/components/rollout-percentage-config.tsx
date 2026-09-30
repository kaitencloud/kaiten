import { useTranslation } from 'react-i18next';
import type { Variant } from '@/api-client';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  addVariantToDistribution,
  equalizeDistribution,
  redistributeDistribution,
  removeVariantFromDistribution,
} from '../logic/rollout-percentage-config-helpers';
import {
  AddVariantSelect,
  DistributionErrors,
  DistributionHeader,
  DistributionTotal,
  EmptyDistributionState,
} from './rollout-percentage-config-header';
import {
  TwoVariantDistributionSlider,
  VariantDistributionEntry,
} from './rollout-percentage-config-sliders';

export type RolloutPercentageConfigProps = {
  distribution: Record<string, number>;
  onChange: (distribution: Record<string, number>) => void;
  variants: Variant[];
  errors?: string[];
};

export function RolloutPercentageConfig({
  distribution,
  onChange,
  variants,
  errors,
}: RolloutPercentageConfigProps) {
  const { t } = useTranslation();
  const distributionEntries = Object.entries(distribution);
  const availableVariants = variants.filter(
    (variant) => !distributionEntries.some(([name]) => name === variant.name),
  );
  const total = Object.values(distribution).reduce(
    (sum, value) => sum + value,
    0,
  );
  const isTwoVariantMode = distributionEntries.length === 2;
  const [firstVariantEntry, secondVariantEntry] = distributionEntries;

  const handleAddVariant = (variantName: string) => {
    onChange(addVariantToDistribution(distribution, variantName));
  };

  const handleRemoveVariant = (variantName: string) => {
    onChange(removeVariantFromDistribution(distribution, variantName));
  };

  const handleDistributionChange = (variantName: string, newValue: number) => {
    onChange(redistributeDistribution(distribution, variantName, newValue));
  };

  const handleTwoVariantSliderChange = (value: number) => {
    const [firstKey, secondKey] = Object.keys(distribution);
    onChange({ [firstKey]: value, [secondKey]: 100 - value });
  };

  const handleEqualDistribution = () => {
    onChange(equalizeDistribution(distribution));
  };

  function renderDistributionEntry([variantName, percentage]: [
    string,
    number,
  ]) {
    return (
      <VariantDistributionEntry
        key={variantName}
        variantName={variantName}
        percentage={percentage}
        onRemoveVariant={handleRemoveVariant}
        onChange={handleDistributionChange}
      />
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-3 rounded-lg border p-4">
        <DistributionHeader
          t={t}
          canEqualize={distributionEntries.length >= 2}
          onEqualize={handleEqualDistribution}
        />
        {distributionEntries.length === 0 ? (
          <EmptyDistributionState t={t} />
        ) : null}
        {isTwoVariantMode && firstVariantEntry && secondVariantEntry ? (
          <TwoVariantDistributionSlider
            firstKey={firstVariantEntry[0]}
            firstValue={firstVariantEntry[1]}
            secondKey={secondVariantEntry[0]}
            secondValue={secondVariantEntry[1]}
            onRemoveVariant={handleRemoveVariant}
            onChange={handleTwoVariantSliderChange}
          />
        ) : null}
        {!isTwoVariantMode && distributionEntries.length > 0 ? (
          <div className="space-y-4">
            {distributionEntries.map(renderDistributionEntry)}
          </div>
        ) : null}
        {availableVariants.length > 0 ? (
          <AddVariantSelect
            t={t}
            availableVariants={availableVariants}
            onAddVariant={handleAddVariant}
          />
        ) : null}
        <DistributionErrors t={t} errors={errors} />
        <DistributionTotal
          t={t}
          total={total}
          shouldDisplay={distributionEntries.length > 0}
        />
      </div>
    </TooltipProvider>
  );
}
