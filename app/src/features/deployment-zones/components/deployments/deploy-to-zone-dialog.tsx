import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useDeployReleaseMutation } from '../../hooks/use-deploy-release-mutation';
import type { DeploymentZone, DeployToZoneDialogProps } from '../../types';

/**
 * Deploys a given release to a zone the user picks. Same mutation as
 * `DeployReleaseDialog` (a deployment is an update of the zone), entered from
 * the release rather than from the zone.
 */
export function DeployToZoneDialog({
  release,
  deploymentZones,
  open,
  onOpenChange,
}: DeployToZoneDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="form">
        {/* The picker lives in its own component so that closing the dialog
            unmounts it: reopening then starts from an empty selection without
            an effect having to reach in and reset it. */}
        <DeployToZoneForm
          deploymentZones={deploymentZones}
          onOpenChange={onOpenChange}
          release={release}
        />
      </DialogContent>
    </Dialog>
  );
}

type DeployToZoneFormProps = Omit<DeployToZoneDialogProps, 'open'>;

function DeployToZoneForm({
  release,
  deploymentZones,
  onOpenChange,
}: DeployToZoneFormProps) {
  const { t } = useTranslation();
  const [selectedZoneSlug, setSelectedZoneSlug] = useState('');

  const selectedZone = deploymentZones.find(
    (zone) => zone.slug === selectedZoneSlug,
  );
  const alreadyRunsRelease = selectedZone?.releaseId === release.id;
  const canDeploy = Boolean(selectedZone) && !alreadyRunsRelease;

  const updateMutation = useDeployReleaseMutation({
    onSuccess: () => onOpenChange(false),
  });

  const handleDeploy = async () => {
    if (!selectedZone?.slug) {
      return;
    }

    await updateMutation.mutateAsync({
      path: { deploymentZoneSlug: selectedZone.slug },
      body: {
        name: selectedZone.name,
        type: selectedZone.type,
        description: selectedZone.description,
        metadata: selectedZone.metadata,
        releaseId: release.id,
      },
    });
  };

  function renderZoneOption(zone: DeploymentZone) {
    return (
      <SelectItem key={zone.slug} value={zone.slug ?? ''}>
        {zone.name}
      </SelectItem>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t('Features.Releases.Form.deployVersion', {
            version: release.version,
          })}
        </DialogTitle>
        <DialogDescription>
          {t('Features.Releases.Form.deployVersionDescription')}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-6">
        <div className="grid grid-cols-1 gap-2">
          <Label htmlFor="deployment-zone">
            {t('Features.Releases.Form.selectZone')}
          </Label>
          <Select
            items={deploymentZones.map((zone) => ({
              value: zone.slug ?? '',
              label: zone.name,
            }))}
            value={selectedZoneSlug || null}
            onValueChange={(value) => setSelectedZoneSlug(value ?? '')}
          >
            <SelectTrigger id="deployment-zone" className="w-full">
              <SelectValue
                placeholder={t('Features.Releases.Form.selectZonePlaceholder')}
              />
            </SelectTrigger>
            <SelectContent>
              {deploymentZones.map(renderZoneOption)}
            </SelectContent>
          </Select>
          {alreadyRunsRelease ? (
            <p className="text-sm text-muted-foreground">
              {t('Features.Releases.Form.zoneAlreadyRuns', {
                version: release.version,
              })}
            </p>
          ) : null}
        </div>
      </DialogBody>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={updateMutation.isPending}
        >
          {t('Common.cancel')}
        </Button>
        <Button
          onClick={handleDeploy}
          disabled={!canDeploy || updateMutation.isPending}
        >
          {t('Features.Releases.Actions.deploy')}
        </Button>
      </DialogFooter>
    </>
  );
}
