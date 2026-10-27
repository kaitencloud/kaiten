import { useTranslation } from 'react-i18next';
import type { License } from '@/api-client';
import { VersionLifecycleBadge } from '@/domains/billing';
import { LIFECYCLE_LABEL_KEYS } from '../utils/license-lifecycle-keys';
import { getLicenseLifecycleState } from '../utils/license-lifecycle.utils';

type LicenseLifecycleBadgeProps = {
  license: Pick<License, 'lifecycleState'>;
  className?: string;
};

export function LicenseLifecycleBadge({
  license,
  className,
}: LicenseLifecycleBadgeProps) {
  const { t } = useTranslation();
  const state = getLicenseLifecycleState(license);

  return (
    <VersionLifecycleBadge
      className={className}
      label={t(LIFECYCLE_LABEL_KEYS[state])}
      state={state}
    />
  );
}
