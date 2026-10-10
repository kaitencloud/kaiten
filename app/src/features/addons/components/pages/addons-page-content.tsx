import { useSuspenseQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { addonFamiliesQueryOptions } from '../../queries';
import { AddonList } from '../list/addon-list';

type AddonsPageContentProps = {
  /** A dialog the route opens over the list, such as the one that creates a version. */
  children?: ReactNode;
};

/**
 * The page of the add-ons: every family with its versions, to search, to publish,
 * archive and make the default, and to list in the public catalogue. A dialog route
 * draws it again with its dialog as `children`, so that the list stays under it.
 */
export function AddonsPageContent({ children }: AddonsPageContentProps) {
  const { t } = useTranslation();
  const { data: families } = useSuspenseQuery(addonFamiliesQueryOptions);
  const AddonIcon = dataModelIcons.addon;

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <AddonIcon className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>{t('Pages.Addons.title')}</Page.Title>
            <Page.Subtitle>{t('Pages.Addons.subtitle')}</Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>
      <div className="min-h-0 flex-1">
        <AddonList families={families.items} />
      </div>
      {children}
    </Page>
  );
}
