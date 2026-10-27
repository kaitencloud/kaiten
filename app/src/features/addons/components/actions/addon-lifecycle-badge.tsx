import { useTranslation } from 'react-i18next';
import type { Addon } from '@/api-client';
import { VersionLifecycleBadge } from '@/domains/billing';
import { LIFECYCLE_LABEL_KEYS } from '../../utils/addon-labels';

type AddonLifecycleBadgeProps = {
  addon: Pick<Addon, 'lifecycleState'>;
  className?: string;
};

export function AddonLifecycleBadge({
  addon,
  className,
}: AddonLifecycleBadgeProps) {
  const { t } = useTranslation();

  return (
    <VersionLifecycleBadge
      className={className}
      label={t(LIFECYCLE_LABEL_KEYS[addon.lifecycleState])}
      state={addon.lifecycleState}
    />
  );
}
