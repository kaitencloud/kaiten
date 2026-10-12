import { useTranslation } from 'react-i18next';
import type { License } from '@/api-client';
import { ListEmptyState } from '@/domains/billing';
import { dataModelIcons } from '@/lib/data-model-icons';
import { SubscribeAction } from './subscribe-action';

type NotSubscribedCardProps = {
  instanceSlug: string;
  license: License | null;
};

/**
 * What the tab says of an instance nobody bills yet. The 404 of the API for a
 * subscription that never was is not an error: it is this, with the way to
 * subscribe for a session that may. A session that may only read sees the state
 * and no button.
 */
export function NotSubscribedCard({
  instanceSlug,
  license,
}: NotSubscribedCardProps) {
  const { t } = useTranslation();

  return (
    <ListEmptyState
      description={t(
        'Pages.Customers.Instances.Detail.Billing.NotSubscribed.description',
      )}
      icon={dataModelIcons.subscription}
      testId="not-subscribed"
      title={t('Pages.Customers.Instances.Detail.Billing.NotSubscribed.title')}
    >
      <SubscribeAction instanceSlug={instanceSlug} license={license} />
    </ListEmptyState>
  );
}
