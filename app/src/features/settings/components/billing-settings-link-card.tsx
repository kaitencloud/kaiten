import { useTranslation } from 'react-i18next';
import { useBillingCapabilities, useCanPerform } from '@/domains/billing';
import { dataModelIcons } from '@/lib/data-model-icons';
import { SettingsLinkCard } from './settings-link-card';

/**
 * The way to the billing settings, offered where billing is on and the session may
 * read them: elsewhere it is absent, as billing is, and not a card that leads to an
 * explanation.
 */
export function BillingSettingsLinkCard() {
  const { t } = useTranslation();
  const { isEnabled } = useBillingCapabilities();
  const maySee = useCanPerform('settings.read');

  if (!isEnabled || !maySee) {
    return null;
  }

  return (
    <SettingsLinkCard
      buttonLabel={t('Pages.Settings.Billing.configureButton')}
      description={t('Pages.Settings.Billing.cardDescription')}
      icon={dataModelIcons.billing}
      title={t('Pages.Settings.Billing.title')}
      to="/settings/billing"
    />
  );
}
