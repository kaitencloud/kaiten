import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import type { License } from '@/api-client';
import {
  getLicenseLifecycleState,
  type LicenseLifecycleState,
} from '../utils/license-lifecycle.utils';

const BADGE_VARIANT: Record<
  LicenseLifecycleState,
  'success' | 'outline' | 'secondary'
> = {
  // Live: the only state a family resolves to, and the only one its default
  // may be in.
  PUBLISHED: 'success',
  // Being prepared: addressable by its own slug, never served by the family.
  DRAFT: 'outline',
  // Withdrawn from sale: pinned instances keep working, nothing new resolves
  // to it.
  ARCHIVED: 'secondary',
};

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
    <Badge variant={BADGE_VARIANT[state]} className={className}>
      {t(`Pages.Licenses.Lifecycle.${state}`)}
    </Badge>
  );
}
