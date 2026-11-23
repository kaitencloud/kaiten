import { useQuery } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Page } from '@/functionals/page';
import { useGrantedScopes } from '@/hooks/use-granted-scopes';
import { platformFlagEvaluationsQueryOptions } from '@/lib/feature-flags';
import { hasScope } from '@/lib/granted-scopes';
import { WRITE_BETA_FEATURES_SCOPE, betaFeaturesOf } from '../beta-features';
import type { BetaFeature } from '../types';
import { useBetaFeatureToggle } from '../use-beta-feature-toggle';
import { BetaFeatureProblemAlert } from './beta-feature-problem-alert';
import { BetaFeatureRow } from './beta-feature-row';

/**
 * Beta features: the betas Kaiten opened to the organization, each with the
 * toggle that turns it on or off for the whole organization. Every member sees
 * them; only a session holding the scope that writes betas flips one. Kaiten Cloud
 * only, behind `beta-features`.
 */
export function BetaFeaturesPageContent() {
  const { t } = useTranslation();
  const query = useQuery({
    ...platformFlagEvaluationsQueryOptions,
    select: betaFeaturesOf,
  });
  const { isPending: scopesPending, scopes } = useGrantedScopes();
  const canToggle =
    !scopesPending && hasScope(scopes, WRITE_BETA_FEATURES_SCOPE);
  const toggle = useBetaFeatureToggle();

  function renderBeta(beta: BetaFeature) {
    return (
      <BetaFeatureRow
        beta={beta}
        canToggle={canToggle}
        key={beta.flagSlug}
        locked={toggle.pendingSlug !== undefined}
        onToggle={(enabled) =>
          toggle.toggle({ flagSlug: beta.flagSlug, enabled })
        }
        pending={toggle.pendingSlug === beta.flagSlug}
      />
    );
  }

  function renderBody() {
    if (query.isPending) {
      return (
        <div
          aria-busy="true"
          aria-label={t('Pages.Settings.BetaFeatures.loading')}
          role="status"
        >
          <Skeleton className="h-48 w-full" />
        </div>
      );
    }
    if (query.isError) {
      return (
        <Alert data-testid="beta-features-load-error">
          <AlertTitle>
            {t('Pages.Settings.BetaFeatures.LoadError.title')}
          </AlertTitle>
          <AlertDescription>
            <p>{t('Pages.Settings.BetaFeatures.LoadError.description')}</p>
            <Button
              className="mt-3"
              onClick={() => void query.refetch()}
              size="sm"
              variant="outline"
            >
              {t('Pages.Settings.BetaFeatures.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      );
    }
    if (query.data.length === 0) {
      return (
        <Card data-testid="beta-features-empty">
          <CardHeader>
            <CardTitle>
              {t('Pages.Settings.BetaFeatures.Empty.title')}
            </CardTitle>
            <CardDescription>
              {t('Pages.Settings.BetaFeatures.Empty.description')}
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }

    return (
      <Card className="gap-0 py-0">
        <CardContent className="px-6 py-2">
          <ul
            aria-label={t('Pages.Settings.BetaFeatures.title')}
            className="divide-y divide-border/60"
          >
            {query.data.map(renderBeta)}
          </ul>
        </CardContent>
      </Card>
    );
  }

  return (
    <Page layout="scroll">
      <Page.Fixed>
        <Page.Header>
          <Page.Leading>
            <Page.Icon>
              <FlaskConical className="size-8 text-primary-subtle-foreground" />
            </Page.Icon>
            <Page.Heading>
              <Page.Title>{t('Pages.Settings.BetaFeatures.title')}</Page.Title>
              <Page.Subtitle>
                {t('Pages.Settings.BetaFeatures.subtitle')}
              </Page.Subtitle>
            </Page.Heading>
          </Page.Leading>
        </Page.Header>
      </Page.Fixed>
      <Page.Scroll className="mt-6">
        <div className="space-y-4">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{t('Pages.Settings.BetaFeatures.appliesWithinMinute')}</p>
            <p>{t('Pages.Settings.BetaFeatures.offDeletesNothing')}</p>
          </div>
          {toggle.failure && (
            <BetaFeatureProblemAlert
              failure={toggle.failure}
              onDismiss={toggle.dismiss}
              onRetry={toggle.retry}
            />
          )}
          {renderBody()}
        </div>
      </Page.Scroll>
    </Page>
  );
}
