import type { ReactNode } from 'react';
import { Page } from '@/functionals/page';
import { type DataModelIconKey, dataModelIcons } from '@/lib/data-model-icons';
import { ReleaseManagementTabs } from './release-management-tabs';

type ReleaseManagementPageShellProps = {
  actions?: ReactNode;
  children?: ReactNode;
  content: ReactNode;
  iconKey: Extract<
    DataModelIconKey,
    'component' | 'deploymentZone' | 'release'
  >;
  stats?: ReactNode;
  subtitle: string;
  title: string;
};

export function ReleaseManagementPageShell({
  children,
  actions,
  content,
  iconKey,
  stats,
  subtitle,
  title,
}: ReleaseManagementPageShellProps) {
  const Icon = dataModelIcons[iconKey];

  return (
    <>
      <Page className="h-full min-h-0 overflow-hidden">
        <Page.Header>
          <Page.Leading>
            <Page.Icon>
              <Icon className="size-8 text-primary-subtle-foreground" />
            </Page.Icon>
            <Page.Heading>
              <Page.Title>{title}</Page.Title>
              <Page.Subtitle>{subtitle}</Page.Subtitle>
            </Page.Heading>
          </Page.Leading>
          {actions ? <Page.Actions>{actions}</Page.Actions> : null}
        </Page.Header>
        <ReleaseManagementTabs />
        {stats ? <div className="mt-6 shrink-0">{stats}</div> : null}
        <div className="flex-1 min-h-0">{content}</div>
      </Page>
      {children}
    </>
  );
}
