import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { Flag, FlaskConical, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FeatureFlag } from '@/api-client';
import { EditableTitle, Page } from '@/functionals/page';
import { useFeatureFlagRename } from '../../hooks';

type FeatureFlagDetailHeaderProps = {
  featureFlag: FeatureFlag;
  featureFlagSlug: string;
  onOpenTryIt: () => void;
};

export function FeatureFlagDetailHeader({
  featureFlag,
  featureFlagSlug,
  onOpenTryIt,
}: FeatureFlagDetailHeaderProps) {
  const { t } = useTranslation();
  const handleRename = useFeatureFlagRename(featureFlag);

  return (
    <Page.Header>
      <Page.Leading>
        <Page.Icon>
          <Flag className="size-8 text-primary-subtle-foreground" />
        </Page.Icon>
        <Page.Heading>
          <Page.TitleRow>
            <Page.Title>
              <EditableTitle
                value={featureFlag.name}
                onSave={handleRename}
                label={t('Pages.FeatureFlags.Detail.editName', 'Edit name')}
              />
            </Page.Title>
            <Badge variant={featureFlag.enabled ? 'success' : 'secondary'}>
              {featureFlag.enabled
                ? t('Pages.FeatureFlags.Detail.enabled')
                : t('Pages.FeatureFlags.Detail.disabled')}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {t(`Pages.FeatureFlags.Types.${featureFlag.type}`)}
            </Badge>
          </Page.TitleRow>
          <Page.Subtitle>
            {featureFlag.description ??
              t('Pages.FeatureFlags.Detail.fallback.noDescription')}
          </Page.Subtitle>
        </Page.Heading>
      </Page.Leading>

      <Page.Actions>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={onOpenTryIt}>
            <FlaskConical className="size-4" />
            {t('Pages.FeatureFlags.Detail.buttons.tryIt')}
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            nativeButton={false}
            role="link"
            render={
              <Link
                to="/feature-flags/$featureFlagSlug"
                params={{ featureFlagSlug }}
                search={{ mode: 'configure' }}
              >
                <Settings className="size-4" />
                {t('Pages.FeatureFlags.Detail.buttons.configure')}
              </Link>
            }
          />
        </div>
      </Page.Actions>
    </Page.Header>
  );
}
