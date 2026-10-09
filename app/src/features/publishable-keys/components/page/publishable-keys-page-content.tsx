import { useSuspenseQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { publishableKeysQueryOptions } from '../../queries';
import { PublishableKeyList } from '../list/publishable-key-list';
import { PublishableKeysIntro } from './publishable-keys-intro';

type PublishableKeysPageContentProps = {
  /** A dialog the route opens over the list, such as the one that issues a key. */
  children?: ReactNode;
  /** Whether the revoked keys are listed too: the URL says it. */
  includeRevoked: boolean;
  onIncludeRevokedChange: (includeRevoked: boolean) => void;
};

/**
 * The page of the publishable keys: what a key is for, and every key of the
 * organization, to search, to issue, to edit and to revoke. The route loads the list,
 * like the other list pages load theirs, and the list filters, sorts and pages it. A
 * dialog route draws it with its dialog as `children`, so that the list stays under it.
 */
export function PublishableKeysPageContent({
  children,
  includeRevoked,
  onIncludeRevokedChange,
}: PublishableKeysPageContentProps) {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(
    publishableKeysQueryOptions(includeRevoked),
  );
  const KeyIcon = dataModelIcons.publishableKey;

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <KeyIcon className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>
              {t('Pages.Integrations.PublishableKeys.title')}
            </Page.Title>
            <Page.Subtitle>
              {t('Pages.Integrations.PublishableKeys.subtitle')}
            </Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>
      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-4">
        <PublishableKeysIntro />
        <div className="min-h-0 flex-1">
          <PublishableKeyList
            includeRevoked={includeRevoked}
            keys={data.items}
            onIncludeRevokedChange={onIncludeRevokedChange}
          />
        </div>
      </div>
      {children}
    </Page>
  );
}
