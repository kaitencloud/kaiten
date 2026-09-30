import { Button } from '@/components/ui/button';
import type { TFunction } from 'i18next';
import { Plus } from 'lucide-react';

type TargetingListHeaderProps = {
  canCreate: boolean;
  disabled: boolean;
  onCreate: () => void;
  t: TFunction;
};

type TargetingListEmptyStatesProps = {
  disabled: boolean;
  hasTargetings: boolean;
  onCreate: () => void;
  t: TFunction;
  variantsCount: number;
};

export function TargetingListHeader({
  canCreate,
  disabled,
  onCreate,
  t,
}: TargetingListHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-semibold">
          {t('Features.Targeting.List.title')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('Features.Targeting.List.description')}
        </p>
      </div>
      <Button
        type="button"
        onClick={onCreate}
        disabled={disabled || !canCreate}
        size="sm"
      >
        <Plus className="mr-2 h-4 w-4" />
        {t('Features.Targeting.List.addButton')}
      </Button>
    </div>
  );
}

export function TargetingListEmptyStates({
  disabled,
  hasTargetings,
  onCreate,
  t,
  variantsCount,
}: TargetingListEmptyStatesProps) {
  if (variantsCount === 0) {
    return (
      <div className="border border-dashed rounded-lg p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {t('Features.Targeting.List.noVariantsWarning')}
        </p>
      </div>
    );
  }

  if (hasTargetings) {
    return null;
  }

  return (
    <div className="border border-dashed rounded-lg p-8 text-center">
      <p className="text-sm text-muted-foreground">
        {t('Features.Targeting.List.emptyState')}
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={onCreate}
        disabled={disabled}
        className="mt-4"
      >
        <Plus className="mr-2 h-4 w-4" />
        {t('Features.Targeting.List.addFirstButton')}
      </Button>
    </div>
  );
}
