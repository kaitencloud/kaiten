import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import {
  licenseFamiliesQueryOptions,
  licensesWithInstancesQueryOptions,
} from '../../queries';
import { LicenseList } from '../license-list';

export function LicensesPageContent() {
  const { data: licenses } = useSuspenseQuery(
    licensesWithInstancesQueryOptions,
  );
  const { data: families } = useSuspenseQuery(licenseFamiliesQueryOptions);
  const { t } = useTranslation();
  const LicenseIcon = dataModelIcons.license;

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <LicenseIcon className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>{t('Pages.Licenses.title')}</Page.Title>
            <Page.Subtitle>{t('Pages.Licenses.subtitle')}</Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>
      <div className="flex-1 min-h-0">
        <LicenseList
          families={families?.items ?? []}
          licenses={licenses ?? []}
        />
      </div>
    </Page>
  );
}
