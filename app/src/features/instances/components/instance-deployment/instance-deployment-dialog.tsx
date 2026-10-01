import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeploymentZone } from '@/api-client';
import { getInstanceOptions } from '@/api-client/@tanstack/react-query.gen';
import { allDeploymentZonesOptions } from '@/lib/api/all-pages-query-options';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useInstanceDeploymentMutation } from '../../hooks/use-instance-deployment-mutation';
import { getInstanceDeploymentMode } from '../../utils/instance-deployment.utils';

export type InstanceDeploymentDialogProps = {
  /** Current zone of the instance, or null/undefined when it is orphan. */
  deploymentZoneId?: string | null;
  instanceName: string;
  instanceSlug: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

const getZoneLabel = (zone: DeploymentZone) =>
  zone.type ? `${zone.name} — ${zone.type}` : zone.name;

export const InstanceDeploymentDialog = ({
  deploymentZoneId,
  instanceName,
  instanceSlug,
  onOpenChange,
  open,
}: InstanceDeploymentDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent variant="form">
      {/* The body lives in its own component so that closing the dialog
          unmounts it. Reopening therefore starts from an empty pick, and the
          two queries below are scoped to the dialog being open by virtue of
          mounting with it rather than through an `enabled` flag. */}
      <InstanceDeploymentForm
        deploymentZoneId={deploymentZoneId}
        instanceName={instanceName}
        instanceSlug={instanceSlug}
        onOpenChange={onOpenChange}
      />
    </DialogContent>
  </Dialog>
);

type InstanceDeploymentFormProps = Omit<InstanceDeploymentDialogProps, 'open'>;

const InstanceDeploymentForm = ({
  deploymentZoneId,
  instanceName,
  instanceSlug,
  onOpenChange,
}: InstanceDeploymentFormProps) => {
  const { t } = useTranslation();
  const zoneSelectId = useId();
  const mode = getInstanceDeploymentMode(deploymentZoneId);
  const [selectedZoneId, setSelectedZoneId] = useState('');

  // The PUT replaces the whole instance, so the body has to be built from the
  // authoritative resource rather than from whatever projection the caller
  // happens to hold -- the table row is a narrower GraphQL selection. On the
  // detail route this query is already in cache.
  const { data: instance, isPending: isLoadingInstance } = useQuery(
    getInstanceOptions({ path: { instanceSlug } }),
  );
  const { data: deploymentZonesData, isPending: isLoadingZones } = useQuery(
    allDeploymentZonesOptions(),
  );

  const { deployInstance, isDeploying } = useInstanceDeploymentMutation({
    onSuccess: () => onOpenChange(false),
  });

  const deploymentZones = deploymentZonesData?.items ?? [];
  // Migrating onto the zone the instance already sits on is a no-op the API
  // would accept silently, so the current zone is shown above the picker
  // rather than offered as a target.
  const availableZones = deploymentZones.filter(
    (zone) => zone.id !== deploymentZoneId,
  );
  const currentZone = deploymentZones.find(
    (zone) => zone.id === deploymentZoneId,
  );
  const isLoading = isLoadingInstance || isLoadingZones;
  const hasNoZoneAvailable = !isLoading && availableZones.length === 0;

  const handleConfirm = async () => {
    if (!instance || !selectedZoneId) {
      return;
    }

    await deployInstance(instance, selectedZoneId);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {mode === 'migrate'
            ? t('Pages.Customers.Instances.Deployment.migrateTitle', {
                name: instanceName,
              })
            : t('Pages.Customers.Instances.Deployment.deployTitle', {
                name: instanceName,
              })}
        </DialogTitle>
        <DialogDescription>
          {mode === 'migrate'
            ? t('Pages.Customers.Instances.Deployment.migrateDescription')
            : t('Pages.Customers.Instances.Deployment.deployDescription')}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-6">
        {mode === 'migrate' ? (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {t('Pages.Customers.Instances.Deployment.currentZone')}
            </p>
            <p className="text-sm font-medium">
              {currentZone
                ? getZoneLabel(currentZone)
                : t('Pages.Customers.Instances.Detail.quickStats.unknown')}
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2">
          <Label htmlFor={zoneSelectId}>
            {t('Pages.Customers.Instances.Deployment.targetZone')}
          </Label>
          <Select
            items={availableZones.map((zone) => ({
              value: zone.id,
              label: getZoneLabel(zone),
            }))}
            value={selectedZoneId || null}
            onValueChange={(value) => setSelectedZoneId(value ?? '')}
            disabled={isLoading || hasNoZoneAvailable || isDeploying}
          >
            <SelectTrigger id={zoneSelectId} className="w-full">
              <SelectValue
                placeholder={t(
                  'Pages.Customers.Instances.Deployment.targetZonePlaceholder',
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {availableZones.map((zone) => (
                <SelectItem key={zone.id} value={zone.id}>
                  {getZoneLabel(zone)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasNoZoneAvailable ? (
            <p className="text-xs text-muted-foreground">
              {t('Pages.Customers.Instances.Deployment.noZoneAvailable')}
            </p>
          ) : null}
        </div>
      </DialogBody>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isDeploying}
        >
          {t('Common.cancel')}
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={isLoading || isDeploying || !selectedZoneId || !instance}
        >
          {mode === 'migrate'
            ? t('Pages.Customers.Instances.Deployment.migrateAction')
            : t('Pages.Customers.Instances.Deployment.deployAction')}
        </Button>
      </DialogFooter>
    </>
  );
};
