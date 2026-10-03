import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useTranslation } from 'react-i18next';

type TwoVariantDistributionSliderProps = {
  firstKey: string;
  firstValue: number;
  onChange: (value: number) => void;
  onRemoveVariant: (variantName: string) => void;
  secondKey: string;
  secondValue: number;
};

export function TwoVariantDistributionSlider({
  firstKey,
  firstValue,
  onChange,
  onRemoveVariant,
  secondKey,
  secondValue,
}: TwoVariantDistributionSliderProps) {
  const { t } = useTranslation();
  return (
    <div
      className="space-y-3 rounded bg-muted/50 p-3"
      data-testid="two-variant-slider"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onRemoveVariant(firstKey)}
            aria-label={t('Common.delete') + ': ' + firstKey}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Label className="text-xs font-medium">{firstKey}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium">{secondKey}</Label>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onRemoveVariant(secondKey)}
            aria-label={t('Common.delete') + ': ' + secondKey}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="relative pt-7">
        <Slider
          value={[firstValue]}
          aria-label={firstKey}
          onValueChange={([value]) => onChange(value)}
          min={0}
          max={100}
          step={1}
          className="w-full"
        />
        <div
          className="absolute top-0 pointer-events-none"
          style={{
            left: `${firstValue}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
            {firstValue}% / {secondValue}%
          </span>
        </div>
      </div>
    </div>
  );
}

type VariantDistributionEntryProps = {
  onChange: (variantName: string, value: number) => void;
  onRemoveVariant: (variantName: string) => void;
  percentage: number;
  variantName: string;
};

export function VariantDistributionEntry({
  onChange,
  onRemoveVariant,
  percentage,
  variantName,
}: VariantDistributionEntryProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded bg-muted/50 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{variantName}</Label>
        <div className="flex items-center gap-2">
          <span className="w-12 text-right font-medium text-sm">
            {percentage}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onRemoveVariant(variantName)}
            aria-label={t('Common.delete') + ': ' + variantName}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Slider
        value={[percentage]}
        aria-label={variantName}
        onValueChange={([value]) => onChange(variantName, value)}
        min={0}
        max={100}
        step={1}
        className="w-full"
      />
    </div>
  );
}
