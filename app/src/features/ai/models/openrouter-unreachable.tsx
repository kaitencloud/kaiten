import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAiAccess, useAiNavigationContext } from '@/domains/ai-credits';
import { Button } from '@/components/ui/button';

/**
 * The import reads OpenRouter's public catalogue from the browser. When the
 * browser cannot reach openrouter.ai (a Content Security Policy, no outbound
 * network, an air-gapped install), say so and offer manual creation.
 */
export function OpenRouterUnreachable({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const context = useAiNavigationContext();
  const access = useAiAccess();
  return (
    <div
      role="alert"
      className="space-y-3 rounded-lg border bg-warning-subtle p-5 text-sm text-warning-subtle-foreground"
    >
      <p className="font-medium">{t('AI.Models.openRouterUnreachable')}</p>
      <p>{t('AI.Models.openRouterUnreachableHelp')}</p>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          nativeButton={false}
          disabled={!access.allows('createModel')}
          render={<Link to="/ai/models/new" search={context} />}
        >
          {t('AI.OpenRouter.manualCreate')}
        </Button>
        <Button type="button" variant="ghost" onClick={onRetry}>
          {t('Common.retry')}
        </Button>
      </div>
    </div>
  );
}
