import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { CirclePlus, FileText, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ActionAccordionActions,
  ActionAccordionContent,
  ActionAccordionHeader,
  ActionAccordionItem,
  ActionAccordionTrigger,
} from '@/components/ui/action-accordion';
import type { LicenseGroup } from '../types';
import { LicenseVersionsTable } from './license-versions-table';

type LicenseListItemProps = {
  group: LicenseGroup;
};

export const LicenseListItem = ({ group }: LicenseListItemProps) => {
  const { t } = useTranslation();

  // A new version starts from the one the family is shown under -- the version
  // it resolves to -- rather than from the highest version whatever its state,
  // which may be a withdrawn one.
  const newVersionLicenseSlug = group.headLicense?.slug;

  return (
    <ActionAccordionItem
      value={group.familyId}
      className="rounded-xl border border-border border-b-0 bg-card px-6"
    >
      <ActionAccordionHeader className="py-2">
        <ActionAccordionTrigger className="py-4 hover:no-underline">
          <div className="flex flex-wrap items-center gap-3 text-left">
            <FileText className="size-5 text-primary-subtle-foreground" />
            <span className="text-lg font-semibold">{group.licenseName}</span>
            <Badge variant="secondary">
              {t('Pages.Licenses.List.versionCount', {
                count: group.licenses.length,
              })}
            </Badge>
            {group.defaultLicense && (
              <Badge variant="default" className="gap-1">
                <Star className="size-3" />
                {t('Pages.Licenses.List.defaultBadge', {
                  version:
                    group.defaultLicense.versionName?.trim() ||
                    t('Pages.Licenses.List.unknownVersion'),
                })}
              </Badge>
            )}
          </div>
        </ActionAccordionTrigger>
        <ActionAccordionActions>
          {newVersionLicenseSlug ? (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              role="link"
              render={
                <Link
                  to="/licenses/versions/$licenseSlug"
                  params={{ licenseSlug: newVersionLicenseSlug }}
                >
                  <CirclePlus className="size-4" />
                  {t('Pages.Licenses.Version.newVersionButton')}
                </Link>
              }
            />
          ) : (
            <Button variant="outline" size="sm" disabled>
              <CirclePlus className="size-4" />
              {t('Pages.Licenses.Version.newVersionButton')}
            </Button>
          )}
        </ActionAccordionActions>
      </ActionAccordionHeader>
      <ActionAccordionContent className="pb-6">
        <LicenseVersionsTable licenses={group.licenses} />
      </ActionAccordionContent>
    </ActionAccordionItem>
  );
};
