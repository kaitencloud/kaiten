import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Link } from '@tanstack/react-router';
import { Eye, FlaskConical, Settings } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FeatureFlag } from '@/api-client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useFeatureFlagCardStore } from '../hooks/use-feature-flag-card-store';
import { useToggleFeatureFlag } from '../hooks/use-toggle-feature-flag';
import { TryItDialog } from './try-it-dialog';

type FeatureFlagCardProps = {
  flag: FeatureFlag;
};

export function FeatureFlagCard({ flag }: FeatureFlagCardProps) {
  const { t } = useTranslation();
  const { tryItOpen, openTryIt, closeTryIt } = useFeatureFlagCardStore();
  const { toggle, isPending } = useToggleFeatureFlag();
  // The switch changes the flag for every evaluation at once, so it asks first.
  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false);

  const targetingCount = flag.targetings?.length ?? 0;
  const variantCount = flag.variants?.length ?? 0;

  return (
    <>
      <Card
        className="hover:shadow-md transition-shadow"
        data-testid="feature-flag-card"
        data-feature-flag-slug={flag.slug ?? undefined}
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3 flex-1">
              {/* Name + Switch + type badge */}
              <div className="flex items-center gap-3 flex-wrap">
                <CardTitle className="text-lg">{flag.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Switch
                    id={`flag-${flag.id}`}
                    checked={flag.enabled}
                    onCheckedChange={() => setConfirmToggleOpen(true)}
                    disabled={isPending}
                    size="sm"
                  />
                  <Label htmlFor={`flag-${flag.id}`} className="text-sm">
                    {flag.enabled
                      ? t('Pages.FeatureFlags.Card.enabled')
                      : t('Pages.FeatureFlags.Card.disabled')}
                  </Label>
                </div>
                <Badge variant="outline" className="capitalize">
                  {flag.type}
                </Badge>
              </div>

              {/* Slug + targeting count */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {flag.slug}
                </span>
                {targetingCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {targetingCount}{' '}
                    {t('Pages.FeatureFlags.Card.targetingRules', {
                      count: targetingCount,
                    })}
                  </span>
                )}
                {variantCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {variantCount}{' '}
                    {t('Pages.FeatureFlags.Card.variants', {
                      count: variantCount,
                    })}
                  </span>
                )}
              </div>

              {/* Description */}
              {flag.description && (
                <CardDescription>{flag.description}</CardDescription>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={openTryIt}
              >
                <FlaskConical className="size-3.5" />
                {t('Pages.FeatureFlags.Card.tryIt')}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link
                  to="/feature-flags/$featureFlagSlug"
                  params={{ featureFlagSlug: flag.slug! }}
                >
                  <Eye className="size-3.5" />
                  {t('Pages.FeatureFlags.Card.view')}
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link
                  to="/feature-flags/$featureFlagSlug"
                  params={{ featureFlagSlug: flag.slug! }}
                  search={{ mode: 'configure' }}
                >
                  <Settings className="size-3.5" />
                  {t('Pages.FeatureFlags.Card.configure')}
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {targetingCount === 0 && (
            <p className="text-xs text-muted-foreground">
              {t('Pages.FeatureFlags.Card.noTargeting')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Try It Dialog */}
      <TryItDialog flag={flag} open={tryItOpen} onClose={closeTryIt} />

      <AlertDialog open={confirmToggleOpen} onOpenChange={setConfirmToggleOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {flag.enabled
                ? t('Pages.FeatureFlags.Card.confirmDisableTitle', {
                    name: flag.name,
                  })
                : t('Pages.FeatureFlags.Card.confirmEnableTitle', {
                    name: flag.name,
                  })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('Pages.FeatureFlags.Card.confirmToggleDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant={flag.enabled ? 'destructive' : 'default'}
              onClick={() => toggle(flag)}
            >
              {flag.enabled
                ? t('Pages.FeatureFlags.Card.disableAction')
                : t('Pages.FeatureFlags.Card.enableAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
