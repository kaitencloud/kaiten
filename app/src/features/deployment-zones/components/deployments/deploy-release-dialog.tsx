import { Button } from '@/components/ui/button';
import { useEffect } from 'react';
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
import { useDeployReleaseDialogStore } from '../../hooks';
import { useDeployReleaseMutation } from '../../hooks/use-deploy-release-mutation';
import type { DeployReleaseDialogProps } from '../../types';

export function DeployReleaseDialog({
  deploymentZone,
  releases,
  open,
  onOpenChange,
}: DeployReleaseDialogProps) {
  const { t } = useTranslation();
  // Opens on the release the zone runs, or on nothing. The list offers no
  // "none" entry: the API cannot take a zone off its release, since an omitted
  // `releaseId` means "keep the current one" and every deployment names one.
  const currentReleaseId = deploymentZone.releaseId || '';
  const { selectedReleaseId, resetSelectedReleaseId, setSelectedReleaseId } =
    useDeployReleaseDialogStore(currentReleaseId);
  const hasChange =
    selectedReleaseId !== '' && selectedReleaseId !== currentReleaseId;

  useEffect(() => {
    if (!open) {
      return;
    }

    resetSelectedReleaseId();
  }, [open, resetSelectedReleaseId]);

  const updateMutation = useDeployReleaseMutation({
    onSuccess: () => onOpenChange(false),
  });

  const handleDeploy = async () => {
    await updateMutation.mutateAsync({
      path: { deploymentZoneSlug: deploymentZone.slug! },
      body: {
        name: deploymentZone.name,
        type: deploymentZone.type,
        description: deploymentZone.description,
        metadata: deploymentZone.metadata,
        releaseId: selectedReleaseId,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="form">
        <DialogHeader>
          <DialogTitle>
            {t('Features.Releases.Form.deployToZone', {
              zone: deploymentZone.name,
            })}
          </DialogTitle>
          <DialogDescription>
            {t('Features.Releases.Form.selectRelease')}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="release">
              {t('Features.Releases.Form.selectRelease')}
            </Label>
            <Select
              value={selectedReleaseId}
              onValueChange={setSelectedReleaseId}
            >
              <SelectTrigger id="release" className="w-full">
                <SelectValue
                  placeholder={t(
                    'Features.Releases.Form.selectReleasePlaceholder',
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {releases.map((release) => (
                  <SelectItem key={release.id} value={release.id}>
                    {release.version}
                    {release.description && ` - ${release.description}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            disabled={!hasChange || updateMutation.isPending}
          >
            {t('Features.Releases.Actions.deploy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
