import { useTranslation } from 'react-i18next';
import type { BetaFeature } from '../types';

/**
 * Where a beta's own title and description live: the app's translations, one
 * entry per flag slug (`<slug>.title`, `<slug>.description`), added with the
 * code that ships the beta.
 */
const BETA_COPY_KEY = 'Pages.Settings.BetaFeatures.betas';

/**
 * A beta's title and description in the current language. Each is decided on
 * its own, first found wins:
 *
 * 1. the translation of the beta's slug, in the current language;
 * 2. the flag's metadata `title` or `description`, as the vendor wrote it on
 *    the flag, in whatever language that is;
 * 3. the slug as the title, and a line that says the beta has no description.
 *
 * So a beta opened before its copy shipped is still listed and named, and its
 * metadata makes it presentable until the translations arrive.
 */
export function useBetaFeatureCopy() {
  const { t, i18n } = useTranslation();

  return ({
    flagSlug,
    metadataTitle,
    metadataDescription,
  }: Pick<
    BetaFeature,
    'flagSlug' | 'metadataTitle' | 'metadataDescription'
  >) => {
    const titleKey = `${BETA_COPY_KEY}.${flagSlug}.title`;
    const descriptionKey = `${BETA_COPY_KEY}.${flagSlug}.description`;

    return {
      title: i18n.exists(titleKey) ? t(titleKey) : (metadataTitle ?? flagSlug),
      description: i18n.exists(descriptionKey)
        ? t(descriptionKey)
        : (metadataDescription ??
          t('Pages.Settings.BetaFeatures.noDescription')),
    };
  };
}
