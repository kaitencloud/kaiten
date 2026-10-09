import { EntityIcon } from '@/components/ui/icon';
import { useRouterState } from '@tanstack/react-router';
import { type PropsWithChildren, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { DetailEntityLayout } from '@/functionals/detail-entity-layout';
import { EditableTitle, Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { getActiveTabFromPathname } from '@/lib/detail';
import { useEntitlementFormMutations } from '../../hooks';
import { entitlementToUpdateBody } from '../../utils/entitlement-writable';
import {
  EntitlementDetailProvider,
  useEntitlementDetailContext,
} from './entitlement-detail-context';
import { EntitlementDetailStats } from './entitlement-detail-stats';
import { EntitlementIconDialog } from './entitlement-icon-dialog';

type EntitlementDetailPageContentProps = PropsWithChildren<{
  entitlement: Entitlement;
  entitlementSlug: string;
}>;

const EntitlementComponentIcon = dataModelIcons.entitlement;
const entitlementIconFallback = (
  <EntitlementComponentIcon className="size-8 text-primary-subtle-foreground" />
);

const useEntitlementActiveTab = (entitlementSlug: string) => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return getActiveTabFromPathname({
    defaultTab: 'overview',
    matchers: [{ suffix: '/usage', value: 'usage' }],
    pathname,
    basePath: `/catalog/entitlements/${entitlementSlug}`,
  });
};

function EntitlementDetailHeader({
  entitlement,
}: {
  entitlement: Entitlement;
}) {
  const { t } = useTranslation();
  const [iconDialogOpen, setIconDialogOpen] = useState(false);
  const { updateMutation } = useEntitlementFormMutations();

  const handleRename = async (name: string) => {
    await updateMutation.mutateAsync({
      path: { entitlementSlug: entitlement.slug! },
      body: entitlementToUpdateBody(entitlement, { name }),
    });
  };

  return (
    <Page.Header>
      <Page.Leading>
        <Page.Icon>
          <button
            type="button"
            onClick={() => setIconDialogOpen(true)}
            aria-label={t(
              'Pages.Entitlements.Detail.iconDialog.editLabel',
              'Edit icon',
            )}
            title={t(
              'Pages.Entitlements.Detail.iconDialog.editLabel',
              'Edit icon',
            )}
            className="flex cursor-pointer items-center justify-center rounded-md p-1 transition-colors hover:bg-accent"
          >
            <EntityIcon
              token={entitlement.icon}
              className="size-8 text-primary-subtle-foreground"
              emptyFallback={entitlementIconFallback}
            />
          </button>
          <EntitlementIconDialog
            entitlement={entitlement}
            open={iconDialogOpen}
            onOpenChange={setIconDialogOpen}
          />
        </Page.Icon>
        <Page.Heading>
          <Page.TitleRow>
            <Page.Title>
              <EditableTitle
                value={entitlement.name}
                onSave={handleRename}
                label={t('Pages.Entitlements.Detail.editName', 'Edit name')}
              />
            </Page.Title>
          </Page.TitleRow>
          <Page.Subtitle>
            {entitlement.description ??
              t(
                'Pages.Entitlements.Detail.fallback.noDescription',
                'No description provided.',
              )}
          </Page.Subtitle>
        </Page.Heading>
      </Page.Leading>
    </Page.Header>
  );
}

const getEntitlementTabs = (
  entitlementSlug: string,
  t: ReturnType<typeof useTranslation>['t'],
) => {
  return [
    {
      label: t('Pages.Entitlements.Detail.tabs.overview', 'Overview'),
      params: { entitlementSlug },
      to: '/catalog/entitlements/$entitlementSlug',
      value: 'overview',
    },
    {
      label: t('Pages.Entitlements.Detail.tabs.usage', 'Usage'),
      params: { entitlementSlug },
      to: '/catalog/entitlements/$entitlementSlug/usage',
      value: 'usage',
    },
  ];
};

function EntitlementDetailLayout({
  children,
  entitlementSlug,
}: PropsWithChildren<{ entitlementSlug: string }>) {
  const { i18n, t } = useTranslation();
  const activeTab = useEntitlementActiveTab(entitlementSlug);
  const locale = i18n.resolvedLanguage ?? 'en-US';
  const { entitlement, isLoading, isUsageLoading, metrics } =
    useEntitlementDetailContext();

  return (
    <DetailEntityLayout>
      <DetailEntityLayout.Top>
        <EntitlementDetailHeader entitlement={entitlement} />
        <EntitlementDetailStats
          isLoading={isLoading}
          isUsageLoading={isUsageLoading}
          locale={locale}
          metrics={metrics}
        />
      </DetailEntityLayout.Top>
      <DetailEntityLayout.Body>
        <DetailEntityLayout.Tabs
          activeTab={activeTab}
          items={getEntitlementTabs(entitlementSlug, t)}
        />
        <DetailEntityLayout.Content>{children}</DetailEntityLayout.Content>
      </DetailEntityLayout.Body>
    </DetailEntityLayout>
  );
}

export function EntitlementDetailPageContent({
  children,
  entitlement,
  entitlementSlug,
}: EntitlementDetailPageContentProps) {
  return (
    <EntitlementDetailProvider entitlement={entitlement}>
      <EntitlementDetailLayout entitlementSlug={entitlementSlug}>
        {children}
      </EntitlementDetailLayout>
    </EntitlementDetailProvider>
  );
}
