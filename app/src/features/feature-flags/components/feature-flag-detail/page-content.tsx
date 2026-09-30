import { useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DetailEntityLayout } from '@/functionals/detail-entity-layout';
import { getActiveTabFromPathname } from '@/lib/detail';
import { TryItDialog } from '../try-it-dialog';
import { FeatureFlagDetailContext } from './context';
import { FeatureFlagDetailHeader } from './feature-flag-detail-header';
import { FeatureFlagDetailStats } from './feature-flag-detail-stats';
import { buildFeatureFlagDetailTabs } from './feature-flag-detail-tabs';
import type { FeatureFlagDetailPageContentProps } from './types';
import { useFeatureFlagDetailContextValue } from './use-feature-flag-detail-context-value';

export function FeatureFlagDetailPageContent({
  children,
  featureFlag,
  featureFlagSlug,
}: FeatureFlagDetailPageContentProps) {
  const { i18n, t } = useTranslation();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const activeTab = getActiveTabFromPathname({
    defaultTab: 'overview',
    matchers: [
      { suffix: '/variants', value: 'variants' },
      { suffix: '/targeting', value: 'targeting' },
      { suffix: '/evaluation', value: 'evaluation' },
    ],
    pathname,
  });
  const [tryItOpen, setTryItOpen] = useState(false);
  const locale = i18n.resolvedLanguage ?? 'en-US';
  const { contextValue, handleEvaluationSample, sampleEvaluations } =
    useFeatureFlagDetailContextValue(featureFlag, locale, t);

  function mapTabLabel<
    TTab extends ReturnType<typeof buildFeatureFlagDetailTabs>[number],
  >(tab: TTab): TTab & { label: string } {
    return {
      ...tab,
      label: t(tab.labelKey),
    };
  }

  const tabs = buildFeatureFlagDetailTabs(featureFlagSlug).map(mapTabLabel);

  function handleOpenTryIt() {
    setTryItOpen(true);
  }

  function handleCloseTryIt() {
    setTryItOpen(false);
  }

  return (
    <FeatureFlagDetailContext.Provider value={contextValue}>
      <DetailEntityLayout
        activeTab={activeTab}
        header={
          <FeatureFlagDetailHeader
            featureFlag={featureFlag}
            featureFlagSlug={featureFlagSlug}
            onOpenTryIt={handleOpenTryIt}
          />
        }
        stats={
          <FeatureFlagDetailStats
            defaultDistributionTotal={contextValue.defaultDistributionTotal}
            featureFlag={featureFlag}
            locale={locale}
            sampleEvaluationsCount={sampleEvaluations.length}
            targetingsCount={contextValue.targetings.length}
          />
        }
        tabs={tabs}
        tabContentClassName={activeTab === 'overview' ? 'pt-4' : 'pt-3'}
      >
        {children}
      </DetailEntityLayout>

      <TryItDialog
        flag={featureFlag}
        open={tryItOpen}
        onClose={handleCloseTryIt}
        onEvaluated={handleEvaluationSample}
      />
    </FeatureFlagDetailContext.Provider>
  );
}
