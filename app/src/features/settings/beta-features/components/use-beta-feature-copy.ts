import { useTranslation } from 'react-i18next';

/**
 * Where a beta's own title and description live: the app's translations, one
 * entry per flag slug (`<slug>.title`, `<slug>.description`), added with the
 * code that ships the beta. The flag carries its stage and nothing else.
 */
const BETA_COPY_KEY = 'Pages.Settings.BetaFeatures.betas';

/**
 * A beta's title and description in the current language. A slug with no
 * entry reads as its slug, with a line that says the beta has no description,
 * so a beta opened before its copy shipped is still listed and named.
 */
export function useBetaFeatureCopy() {
  const { t, i18n } = useTranslation();

  return (flagSlug: string) => {
    const titleKey = `${BETA_COPY_KEY}.${flagSlug}.title`;
    const descriptionKey = `${BETA_COPY_KEY}.${flagSlug}.description`;

    return {
      title: i18n.exists(titleKey) ? t(titleKey) : flagSlug,
      description: i18n.exists(descriptionKey)
        ? t(descriptionKey)
        : t('Pages.Settings.BetaFeatures.noDescription'),
    };
  };
}
