import { useTranslation } from 'react-i18next';
import type { PublishableKey } from '@/api-client';
import { Badge } from '@/components/ui/badge';

type PublishableKeyStatusBadgeProps = {
  publishableKey: Pick<PublishableKey, 'anonymousCheckout' | 'revokedAt'>;
};

/**
 * Whether a key still authenticates: it does until it is revoked, and a revocation is
 * final. A live key that opens the anonymous checkout says so beside it, since that is
 * the one thing a key does besides reading the catalog: any visitor of its origins can
 * create a customer with it. A revoked key opens nothing, whatever it was set to.
 */
export function PublishableKeyStatusBadge({
  publishableKey,
}: PublishableKeyStatusBadgeProps) {
  const { t } = useTranslation();

  if (publishableKey.revokedAt) {
    return (
      <Badge variant="outline">
        {t('Pages.Integrations.PublishableKeys.List.Status.revoked')}
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant="success">
        {t('Pages.Integrations.PublishableKeys.List.Status.live')}
      </Badge>
      {publishableKey.anonymousCheckout ? (
        <Badge data-testid="anonymous-checkout-badge" variant="secondary">
          {t(
            'Pages.Integrations.PublishableKeys.List.Status.anonymousCheckout',
          )}
        </Badge>
      ) : null}
    </div>
  );
}
