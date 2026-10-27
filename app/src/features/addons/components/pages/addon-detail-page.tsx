import { useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Addon } from '@/api-client';
import { getAddonTitle } from '@/domains/billing';
import { DetailEntityLayout } from '@/functionals/detail-entity-layout';
import { Page } from '@/functionals/page';
import { getActiveTabFromPathname } from '@/lib/detail';
import { DETAIL_TAB_LABEL_KEYS } from '../../utils/addon-labels';

type AddonDetailPageProps = {
  addon: Addon;
  addonSlug: string;
  /** The tab the route renders: the overview, the grants, the prices or the licenses it fits. */
  children: ReactNode;
};

/** The tabs of a version, and the path each is the page of. */
const TABS = [
  {
    suffix: '/entitlements',
    to: '/catalog/addons/$addonSlug/entitlements',
    value: 'entitlements',
  },
  {
    suffix: '/prices',
    to: '/catalog/addons/$addonSlug/prices',
    value: 'prices',
  },
  {
    suffix: '/compatibility',
    to: '/catalog/addons/$addonSlug/compatibility',
    value: 'compatibility',
  },
] as const;

/**
 * The page of one add-on version, around the tab its route renders: its overview,
 * what it grants, what it is sold for and the license families it fits. A tab loads
 * its own data, so that one the session may not read never blanks the page.
 */
export function AddonDetailPage({
  addon,
  addonSlug,
  children,
}: AddonDetailPageProps) {
  const { t } = useTranslation();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const activeTab = getActiveTabFromPathname({
    defaultTab: 'overview',
    matchers: TABS.map(({ suffix, value }) => ({ suffix, value })),
    pathname,
  });
  const params = { addonSlug };

  return (
    <DetailEntityLayout>
      <DetailEntityLayout.Top>
        <Page.Header>
          <Page.Title>{getAddonTitle(addon)}</Page.Title>
        </Page.Header>
      </DetailEntityLayout.Top>
      <DetailEntityLayout.Body>
        <DetailEntityLayout.Tabs
          activeTab={activeTab}
          items={[
            {
              label: t('Pages.Addons.Detail.Tabs.overview'),
              params,
              to: '/catalog/addons/$addonSlug',
              value: 'overview',
            },
            ...TABS.map(({ to, value }) => ({
              label: t(DETAIL_TAB_LABEL_KEYS[value]),
              params,
              to,
              value,
            })),
          ]}
        />
        <DetailEntityLayout.Content className="pb-6">
          {children}
        </DetailEntityLayout.Content>
      </DetailEntityLayout.Body>
    </DetailEntityLayout>
  );
}
