import { Link } from '@tanstack/react-router';
import { CirclePlus, Globe, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ActionAccordionActions,
  ActionAccordionContent,
  ActionAccordionHeader,
  ActionAccordionItem,
  ActionAccordionTrigger,
} from '@/components/ui/action-accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCanPerform } from '@/domains/billing';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { AddonGroup } from '../../types';
import { AddonFamilyPublicToggle } from './addon-family-public-toggle';
import { AddonVersionsTable } from './addon-versions-table';

type AddonListItemProps = {
  group: AddonGroup;
};

/**
 * One family of the list: its name, how many versions it has, which one is the
 * default, whether it is listed in the public catalogue, the switch that lists it
 * and the way to a new version, over the table of its versions.
 */
export function AddonListItem({ group }: AddonListItemProps) {
  const { t } = useTranslation();
  const mayCreate = useCanPerform('addons.create');
  const AddonIcon = dataModelIcons.addon;

  return (
    <ActionAccordionItem
      className="rounded-xl border border-border border-b-0 bg-card px-6"
      value={group.family.id}
    >
      <ActionAccordionHeader className="py-2">
        <ActionAccordionTrigger className="py-4 hover:no-underline">
          <div className="flex flex-wrap items-center gap-3 text-left">
            <AddonIcon className="size-5 text-primary-subtle-foreground" />
            <span className="text-lg font-semibold">{group.name}</span>
            <Badge variant="secondary">
              {t('Pages.Addons.List.versionCount', {
                count: group.family.versions?.length ?? group.versions.length,
              })}
            </Badge>
            {group.defaultVersion ? (
              <Badge className="gap-1" variant="default">
                <Star className="size-3" />
                {t('Pages.Addons.List.defaultBadge', {
                  version: group.defaultVersion.versionName,
                })}
              </Badge>
            ) : null}
            {group.family.isPublic ? (
              <Badge className="gap-1" variant="outline">
                <Globe className="size-3" />
                {t('Pages.Addons.Public.badge')}
              </Badge>
            ) : null}
          </div>
        </ActionAccordionTrigger>
        <ActionAccordionActions>
          <AddonFamilyPublicToggle group={group} />
          {mayCreate ? (
            <Button
              nativeButton={false}
              render={
                <Link search={{ family: group.family.slug }} to="/addons/new">
                  <CirclePlus className="size-4" />
                  {t('Pages.Addons.List.newVersionButton')}
                </Link>
              }
              role="link"
              size="sm"
              variant="outline"
            />
          ) : null}
        </ActionAccordionActions>
      </ActionAccordionHeader>
      <ActionAccordionContent className="pb-6">
        <AddonVersionsTable addons={group.versions} />
      </ActionAccordionContent>
    </ActionAccordionItem>
  );
}
