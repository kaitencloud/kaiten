import { DatabaseZap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  type MetadataFieldDescriptor,
  partitionMetadata,
  renderMetadataValue,
} from '@/functionals/metadata-fields';
import { DetailCard } from '@/functionals/detail-card';
import { TableJsonDialog } from '@/functionals/table';

type InstanceMetadataCardProps = {
  /** Active MetadataField descriptors for INSTANCE, in display order. */
  metadataFields: MetadataFieldDescriptor[];
  metadata: Record<string, unknown> | null | undefined;
};

/**
 * Replaces the old Platform card. Both used to render a free-form JSONB blob
 * as raw key/value pairs; metadata is the one that carries a schema, so this
 * one renders each declared field the way its JSON Schema says it should read
 * — a date parsed, an enum through its label, a boolean as a check.
 *
 * Keys the schema does not declare still exist: instance metadata is tolerant
 * and the SaaS auto-reports into it. They are kept behind a raw-JSON dialog
 * rather than dropped, so nothing an instance reports becomes invisible.
 */
export const InstanceMetadataCard = ({
  metadataFields,
  metadata,
}: InstanceMetadataCardProps) => {
  const { t } = useTranslation();
  const { knownActive, archivedLeftovers, unknown } = partitionMetadata(
    metadata,
    metadataFields,
  );
  const extras = { ...archivedLeftovers, ...unknown };
  const hasExtras = Object.keys(extras).length > 0;
  // A field with no value still earns its row — the reader learns the org
  // declared it and this instance has not reported it.
  const hasFields = metadataFields.length > 0;

  return (
    <DetailCard>
      <DetailCard.Header>
        <div>
          <DetailCard.Title className="text-base flex items-center gap-2">
            <DatabaseZap className="size-4 text-primary-subtle-foreground" />
            {t('Pages.Customers.Instances.Detail.metadata.title')}
          </DetailCard.Title>
          <DetailCard.Description>
            {t('Pages.Customers.Instances.Detail.metadata.description')}
          </DetailCard.Description>
        </div>
      </DetailCard.Header>
      <DetailCard.Content>
        {hasFields ? (
          <DetailCard.Rows>
            {metadataFields.map((field) => (
              <DetailCard.Row
                key={field.id}
                align="start"
                label={field.label}
                value={renderMetadataValue(field, knownActive[field.key])}
              />
            ))}
          </DetailCard.Rows>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-center">
            <p className="text-sm font-medium">
              {t('Pages.Customers.Instances.Detail.metadata.empty')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('Pages.Customers.Instances.Detail.metadata.emptyHelper')}
            </p>
          </div>
        )}

        {hasExtras ? (
          <>
            <DetailCard.Divider />
            <DetailCard.Row
              label={t('Pages.Customers.Instances.Detail.metadata.extra')}
              value={
                <TableJsonDialog
                  title={t(
                    'Pages.Customers.Instances.Table.Dialogs.extraMetadataTitle',
                  )}
                  description={t(
                    'Pages.Customers.Instances.Table.Dialogs.extraMetadataDescription',
                  )}
                  triggerAriaLabel={t(
                    'Pages.Customers.Instances.Table.Dialogs.extraMetadataTrigger',
                  )}
                  value={extras}
                />
              }
            />
          </>
        ) : null}
      </DetailCard.Content>
    </DetailCard>
  );
};
