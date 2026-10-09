import { useTranslation } from 'react-i18next';
import type { PublishableKey } from '@/api-client';
import { Badge } from '@/components/ui/badge';

type PublishableKeyStatusBadgeProps = {
  publishableKey: Pick<PublishableKey, 'revokedAt'>;
};

/** Whether a key still authenticates: it does until it is revoked, and a revocation is final. */
export function PublishableKeyStatusBadge({
  publishableKey,
}: PublishableKeyStatusBadgeProps) {
  const { t } = useTranslation();

  return publishableKey.revokedAt ? (
    <Badge variant="outline">
      {t('Pages.Integrations.PublishableKeys.List.Status.revoked')}
    </Badge>
  ) : (
    <Badge variant="success">
      {t('Pages.Integrations.PublishableKeys.List.Status.live')}
    </Badge>
  );
}
