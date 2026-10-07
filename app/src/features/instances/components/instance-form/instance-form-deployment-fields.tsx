import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeploymentZone } from '@/api-client';

type InstanceDeploymentFieldsProps = {
  // A zone can only be taken back to none while the instance has none. The PUT
  // reads an omitted deploymentZoneId as "keep the current one", so on a
  // deployed instance the entry would offer a detach the API cannot perform
  // — detaching is not a thing, migrating to another zone is.
  canClearDeploymentZone?: boolean;
  deploymentZones: DeploymentZone[];
  form: any;
};

export const InstanceDeploymentFields = ({
  canClearDeploymentZone = false,
  deploymentZones,
  form,
}: InstanceDeploymentFieldsProps) => {
  const { t } = useTranslation();

  return (
    <Suspense fallback={null}>
      <form.AppField name="deploymentZoneId">
        {(field: any) => (
          <field.ComboboxField
            // The zone is optional: an instance can be created orphan and
            // deployed later, so picking one must stay undoable.
            clearable={canClearDeploymentZone}
            clearLabel={t(
              'Pages.Customers.Instances.Mutation.Form.Placeholders.noDeploymentZone',
            )}
            label={t(
              'Pages.Customers.Instances.Mutation.Form.Labels.deploymentZoneId',
            )}
            placeholder={t(
              'Pages.Customers.Instances.Mutation.Form.Placeholders.deploymentZoneId',
            )}
            description={t(
              'Pages.Customers.Instances.Mutation.Form.Descriptions.deploymentZoneId',
            )}
            searchPlaceholder={t(
              'Pages.Customers.Instances.Mutation.Form.Placeholders.deploymentZoneIdSearch',
            )}
            getOptionLabel={(zone: DeploymentZone) =>
              zone.type ? `${zone.name} — ${zone.type}` : zone.name
            }
            getOptionValue={(zone: DeploymentZone) => zone.id}
            options={deploymentZones}
          />
        )}
      </form.AppField>
    </Suspense>
  );
};
