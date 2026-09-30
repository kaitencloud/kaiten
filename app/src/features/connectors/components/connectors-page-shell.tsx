import { Plug } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';

type ConnectorsPageShellProps = {
  children?: ReactNode;
};

/** Shared page chrome for the connectors routes (index, wizard, detail). */
export function ConnectorsPageShell({ children }: ConnectorsPageShellProps) {
  const { t } = useTranslation();

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <Plug className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>{t('Pages.Integrations.Connectors.title')}</Page.Title>
            <Page.Subtitle>
              {t('Pages.Integrations.Connectors.pageDescription')}
            </Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto">{children}</div>
    </Page>
  );
}
