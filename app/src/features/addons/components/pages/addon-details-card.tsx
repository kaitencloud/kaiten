import { Link } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Addon } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCanPerform } from '@/domains/billing';
import { DetailCard } from '@/functionals/detail-card';
import { PRICING_TYPE_LABEL_KEYS } from '../../utils/addon-labels';
import { AddonDefaultAction } from '../actions/addon-default-action';
import { AddonDeleteDraftAction } from '../actions/addon-delete-draft-action';
import { AddonLifecycleAction } from '../actions/addon-lifecycle-action';
import { AddonLifecycleBadge } from '../actions/addon-lifecycle-badge';

type AddonDetailsCardProps = {
  addon: Addon;
  /** Called once a draft is deleted: the page it was on is gone. */
  onDraftDeleted: () => void;
};

// The edit link of the page: the dialog it opens is the layout route's, drawn when
// the search says `mode=configure`, over whichever tab is open.
function EditLink() {
  const { t } = useTranslation();
  const mayUpdate = useCanPerform('addons.update');

  if (!mayUpdate) {
    return null;
  }

  return (
    <Button
      nativeButton={false}
      render={
        <Link
          data-addon-edit
          search={(previous) => ({ ...previous, mode: 'configure' as const })}
          to="."
        >
          <Pencil className="size-3" />
          {t('Common.edit')}
        </Link>
      }
      role="link"
      size="sm"
      variant="outline"
    />
  );
}

/**
 * What a version is: its name and number, how it is sold, its state, whether it is the
 * default of its family and the most an instance can hold. What can be done to it is
 * in the header: edit it, publish, archive or unarchive it, make it the default, and
 * delete a draft.
 */
export function AddonDetailsCard({
  addon,
  onDraftDeleted,
}: AddonDetailsCardProps) {
  const { t } = useTranslation();

  return (
    <DetailCard>
      <DetailCard.Header>
        <DetailCard.Title>
          {t('Pages.Addons.Detail.cardTitle')}
        </DetailCard.Title>
        <DetailCard.Description>
          {t('Pages.Addons.Detail.cardDescription')}
        </DetailCard.Description>
        <DetailCard.Action className="flex flex-wrap items-center gap-2">
          <EditLink />
          <AddonDeleteDraftAction
            addon={addon}
            appearance="card"
            onDeleted={onDraftDeleted}
          />
          <AddonLifecycleAction addon={addon} appearance="card" />
          <AddonDefaultAction addon={addon} appearance="card" />
        </DetailCard.Action>
      </DetailCard.Header>
      <DetailCard.Content>
        <DetailCard.Rows>
          <DetailCard.Row
            label={t('Pages.Addons.Detail.Fields.name')}
            value={addon.name}
          />
          <DetailCard.Row
            label={t('Pages.Addons.Detail.Fields.version')}
            value={`${addon.version} (${addon.versionName})`}
          />
          <DetailCard.Row
            label={t('Pages.Addons.Detail.Fields.lifecycleState')}
            value={<AddonLifecycleBadge addon={addon} />}
          />
          {addon.isDefault ? (
            <DetailCard.Row
              label={t('Pages.Addons.Detail.Fields.default')}
              value={
                <Badge variant="default">
                  {t('Pages.Addons.Detail.defaultBadge')}
                </Badge>
              }
            />
          ) : null}
          <DetailCard.Row
            label={t('Pages.Addons.Detail.Fields.pricingType')}
            value={
              <Badge variant="outline">
                {t(PRICING_TYPE_LABEL_KEYS[addon.pricingType])}
              </Badge>
            }
          />
          <DetailCard.Row
            label={t('Pages.Addons.Detail.Fields.maxQuantity')}
            value={
              addon.maxQuantity === undefined
                ? t('Pages.Addons.Detail.unbounded')
                : addon.maxQuantity
            }
          />
          <DetailCard.Row
            align="start"
            label={t('Pages.Addons.Detail.Fields.description')}
            value={addon.description || '-'}
          />
        </DetailCard.Rows>
      </DetailCard.Content>
    </DetailCard>
  );
}
