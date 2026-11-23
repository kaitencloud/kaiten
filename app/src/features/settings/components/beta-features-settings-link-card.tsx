import { FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBetaFeaturesEnabled } from '@/hooks/use-feature-flag';
import { SettingsLinkCard } from './settings-link-card';

/**
 * The way to Beta features, offered where the organization has the page
 * (`beta-features` on Kaiten Cloud): elsewhere it is absent, as the page is.
 */
export function BetaFeaturesSettingsLinkCard() {
  const { t } = useTranslation();
  const enabled = useBetaFeaturesEnabled();

  if (!enabled) {
    return null;
  }

  return (
    <SettingsLinkCard
      buttonLabel={t('Pages.Settings.BetaFeatures.openButton')}
      description={t('Pages.Settings.BetaFeatures.cardDescription')}
      icon={FlaskConical}
      title={t('Pages.Settings.BetaFeatures.title')}
      to="/settings/beta-features"
    />
  );
}
