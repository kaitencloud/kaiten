import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  BellRing,
  DatabaseZap,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';
import { ExportDataCard } from '../data-export';
import { ApplicationSettingsSection } from './application-settings-section';
import { BillingSettingsLinkCard } from './billing-settings-link-card';
import { SettingsLinkCard } from './settings-link-card';

type SettingsPageContentProps = {
  // Extra sections appended after the built-in ones (e.g. the demo-sandbox
  // card, mounted from the route so this feature never imports another
  // feature — see architecture rule `cross-feature`).
  children?: ReactNode;
};

export function SettingsPageContent({ children }: SettingsPageContentProps) {
  const { t } = useTranslation();

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <Settings2 className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>{t('Pages.Settings.title')}</Page.Title>
            <Page.Subtitle>{t('Pages.Settings.subtitle')}</Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>

      <div className="mt-6 flex-1 min-h-0 space-y-8 overflow-auto pr-1">
        {/* Two levels of settings live here: the organization's, and what
            this browser remembers. Naming the groups keeps them apart. */}
        <OrganizationSettingsSection />

        <BrowserSettingsSection />

        {children}
      </div>
    </Page>
  );
}

// The organization's own settings: one card per page under /settings.
function OrganizationSettingsSection() {
  const { t } = useTranslation();

  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t('Pages.Settings.groups.organization')}
      </h2>
      <SettingsLinkCard
        icon={DatabaseZap}
        title={t('Pages.Settings.Metadata.title', 'Metadata fields')}
        description={t(
          'Pages.Settings.Metadata.cardDescription',
          'Configure typed metadata fields for Deployment Zones and Instances.',
        )}
        buttonLabel={t(
          'Pages.Settings.Metadata.configureFieldsButton',
          'Configure metadata fields',
        )}
        to="/settings/metadata"
        search={{ resourceType: 'DEPLOYMENT_ZONE' }}
      />

      <SettingsLinkCard
        icon={BellRing}
        title={t('Pages.Settings.Notifications.title', 'Notifications')}
        description={t(
          'Pages.Settings.Notifications.cardDescription',
          'Choose which events notify you and on which channels.',
        )}
        buttonLabel={t(
          'Pages.Settings.Notifications.configureButton',
          'Configure notifications',
        )}
        to="/settings/notifications"
      />

      <BillingSettingsLinkCard />

      <ExportDataCard />
    </section>
  );
}

// What this browser remembers, as opposed to the organization's settings.
function BrowserSettingsSection() {
  const { t } = useTranslation();

  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {t('Pages.Settings.groups.browser')}
      </h2>
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-6">
          <div className="flex items-start gap-3">
            <SlidersHorizontal className="size-5 text-primary-subtle-foreground" />
            <div className="space-y-1">
              <CardTitle>{t('Pages.Settings.App.title')}</CardTitle>
              <CardDescription>
                {t('Pages.Settings.App.description')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <ApplicationSettingsSection />
        </CardContent>
      </Card>
    </section>
  );
}
