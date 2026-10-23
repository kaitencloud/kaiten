import { useTranslation } from 'react-i18next';
import { LicenseGrantWarning } from '@/domains/billing';
import { useLicenseFamilyFallbackGap } from '../../hooks/use-license-family-fallback-gap';

type LicenseFamilyFallbackWarningProps = {
  className?: string;
  /**
   * The warning sits under the fallback select of the settings dialog: it then
   * points at that field instead of at the settings, where the person already is.
   */
  inSettingsDialog?: boolean;
};

/**
 * The warning about a public license that has a paid version and no fallback. The
 * write stays allowed, so this is a note and never a blocker: it says what the
 * missing fallback costs, and what to do is the settings of the license, which the
 * row and the dialog it appears in already offer.
 */
export function LicenseFamilyFallbackWarning({
  className,
  inSettingsDialog = false,
}: LicenseFamilyFallbackWarningProps) {
  const { t } = useTranslation();

  return (
    <LicenseGrantWarning
      className={className}
      testId="license-family-fallback-warning"
    >
      <p>{t('Pages.Licenses.FallbackWarning.ending')}</p>
      <p>
        {t('Pages.Licenses.FallbackWarning.anonymousCheckout')}{' '}
        {t(
          inSettingsDialog
            ? 'Pages.Licenses.FallbackWarning.chooseInField'
            : 'Pages.Licenses.FallbackWarning.chooseInSettings',
        )}
      </p>
    </LicenseGrantWarning>
  );
}

type LicenseFamilyFallbackGapNoteProps = {
  className?: string;
  /** The family the note is about, by the id its versions carry. */
  familyId: string | undefined;
};

/**
 * The warning, where the saved family calls for it: public, a paid version, no
 * fallback, and billing on. Nothing otherwise.
 */
export function LicenseFamilyFallbackGapNote({
  className,
  familyId,
}: LicenseFamilyFallbackGapNoteProps) {
  const hasGap = useLicenseFamilyFallbackGap(familyId);

  return hasGap ? <LicenseFamilyFallbackWarning className={className} /> : null;
}
