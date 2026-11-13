import { useTranslation } from 'react-i18next';
export function RuleMatchingHelp() {
  const { t } = useTranslation();
  return (
    <details className="text-sm text-muted-foreground">
      <summary className="cursor-pointer">
        {t('AI.Minimal.matchingHelp')}
      </summary>
      <p className="mt-2">{t('AI.Matrix.precedence')}</p>
      <p>{t('AI.Matrix.wholeRule')}</p>
    </details>
  );
}
