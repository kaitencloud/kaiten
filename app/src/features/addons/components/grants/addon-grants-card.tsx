import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useCanPerform } from '@/domains/billing';
import { TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { AddonGrants } from '../../hooks';
import { VersionStateNote } from '../version-state-note';
import { AddonGrantsTable } from './addon-grants-table';

const EntitlementIcon = dataModelIcons.entitlement;

type AddonGrantsCardProps = {
  grants: AddonGrants;
  /** The API refused to remove a grant because the version cannot be changed where it is. */
  onFrozen: (error: unknown) => void;
};

/**
 * What the Entitlements tab shows of a version: what one unit of quantity grants, what
 * the state of the version means for changing it -- with the way to a new version where
 * it has been on sale -- and the table of the grants. Adding one is the action of the
 * header, for a session that may write add-ons, while there is an entitlement left.
 */
export function AddonGrantsCard({ grants, onFrozen }: AddonGrantsCardProps) {
  const { t } = useTranslation();
  const mayAssign = useCanPerform('addonGrants.assign');
  const { addon, available, entitlementBySlug, grants: granted } = grants;

  return (
    <TableCard>
      <TableCard.Header>
        <TableCard.HeaderLeading>
          <TableCard.HeaderIcon>
            <EntitlementIcon />
          </TableCard.HeaderIcon>
          <TableCard.HeaderHeading>
            <TableCard.HeaderTitle>
              {t('Pages.Addons.Grants.title')}
            </TableCard.HeaderTitle>
            <TableCard.HeaderSubtitle>
              {t('Pages.Addons.Grants.tabDescription')}
            </TableCard.HeaderSubtitle>
          </TableCard.HeaderHeading>
        </TableCard.HeaderLeading>
        {mayAssign && available.length > 0 ? (
          <TableCard.HeaderActions>
            <Button
              nativeButton={false}
              render={
                <Link
                  params={{ addonSlug: addon.slug }}
                  search={{ grant: 'new' }}
                  to="/catalog/addons/$addonSlug/entitlements"
                >
                  <Plus className="size-4" />
                  {t('Pages.Addons.Grants.Actions.add')}
                </Link>
              }
              role="link"
              size="sm"
            />
          </TableCard.HeaderActions>
        ) : null}
      </TableCard.Header>
      <TableCard.Toolbar className="md:flex-col md:items-stretch">
        <VersionStateNote
          addon={addon}
          messages={{
            ARCHIVED: t('Pages.Addons.Grants.Notes.ARCHIVED'),
            DRAFT: t('Pages.Addons.Grants.Notes.DRAFT'),
            PUBLISHED: t('Pages.Addons.Grants.Notes.PUBLISHED'),
          }}
        />
      </TableCard.Toolbar>
      <TableCard.Content>
        <AddonGrantsTable
          addonSlug={addon.slug}
          entitlementBySlug={entitlementBySlug}
          grants={granted}
          onFrozen={onFrozen}
        />
      </TableCard.Content>
    </TableCard>
  );
}
