import { useTranslation } from 'react-i18next';
import { usePlanBillingEnabled } from '@/hooks/use-feature-flag';
import { dataModelIcons } from '@/lib/data-model-icons';
import { SettingsLinkCard } from './settings-link-card';

/**
 * The way to Plan & usage, offered where the organization has it (`plan-billing`
 * on Kaiten Cloud): elsewhere it is absent, as the page is.
 */
export function PlanSettingsLinkCard() {
  const { t } = useTranslation();
  const enabled = usePlanBillingEnabled();

  if (!enabled) {
    return null;
  }

  return (
    <SettingsLinkCard
      buttonLabel={t('Pages.Settings.Plan.openButton')}
      description={t('Pages.Settings.Plan.cardDescription')}
      icon={dataModelIcons.license}
      title={t('Pages.Settings.Plan.title')}
      to="/settings/plan"
    />
  );
}
