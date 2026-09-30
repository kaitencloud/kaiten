import { Button } from '@/components/ui/button';
import type { TFunction } from 'i18next';
import { Equal, Plus } from 'lucide-react';
import type { Variant } from '@/api-client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type TranslateFn = TFunction;

type DistributionHeaderProps = {
  canEqualize: boolean;
  onEqualize: () => void;
  t: TranslateFn;
};

export function DistributionHeader({
  canEqualize,
  onEqualize,
  t,
}: DistributionHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h4 className="font-semibold text-sm">
        {t('Features.Targeting.RolloutPercentageForm.distribution')} *
      </h4>
      {canEqualize ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={onEqualize}
            >
              <Equal className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {t('Features.Targeting.RolloutPercentageForm.equalDistribution')}
            </p>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

type AddVariantSelectProps = {
  availableVariants: Variant[];
  onAddVariant: (variantName: string) => void;
  t: TranslateFn;
};

function renderAvailableVariant(variant: Variant) {
  return (
    <SelectItem key={variant.name} value={variant.name}>
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4" />
        {variant.name}
      </div>
    </SelectItem>
  );
}

export function AddVariantSelect({
  availableVariants,
  onAddVariant,
  t,
}: AddVariantSelectProps) {
  return (
    <Select onValueChange={onAddVariant}>
      <SelectTrigger className="w-full">
        <SelectValue
          placeholder={t('Features.Targeting.RolloutPercentageForm.addVariant')}
        />
      </SelectTrigger>
      <SelectContent>
        {availableVariants.map(renderAvailableVariant)}
      </SelectContent>
    </Select>
  );
}

export function EmptyDistributionState({ t }: { t: TranslateFn }) {
  return (
    <p className="text-sm text-muted-foreground">
      {t('Features.Targeting.RolloutPercentageForm.noVariants')}
    </p>
  );
}

type DistributionErrorsProps = {
  errors?: string[];
  t: TranslateFn;
};

export function DistributionErrors({ errors, t }: DistributionErrorsProps) {
  return (
    <div className="min-h-[20px]">
      {errors && errors.length > 0 ? (
        <p className="text-sm text-destructive-subtle-foreground">
          {t(errors[0] || '')}
        </p>
      ) : null}
    </div>
  );
}

type DistributionTotalProps = {
  shouldDisplay: boolean;
  t: TranslateFn;
  total: number;
};

export function DistributionTotal({
  shouldDisplay,
  t,
  total,
}: DistributionTotalProps) {
  if (!shouldDisplay) {
    return null;
  }

  return (
    <div
      className={`text-sm ${
        total === 100
          ? 'text-muted-foreground'
          : 'text-destructive-subtle-foreground'
      }`}
    >
      {t('Features.Targeting.RolloutPercentageForm.total')}:{' '}
      <strong>{total}%</strong>
    </div>
  );
}
