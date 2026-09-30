import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type FeatureFlagEnabledSwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function FeatureFlagEnabledSwitch({
  checked,
  onCheckedChange,
}: FeatureFlagEnabledSwitchProps) {
  const { t } = useTranslation();
  const id = useId();
  const label = checked
    ? t('Pages.FeatureFlags.Mutation.Form.Step1.Labels.statusEnabled')
    : t('Pages.FeatureFlags.Mutation.Form.Step1.Labels.statusDisabled');

  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <label
        htmlFor={id}
        className={cn(
          'cursor-pointer text-sm font-medium select-none',
          checked ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </label>
    </div>
  );
}
