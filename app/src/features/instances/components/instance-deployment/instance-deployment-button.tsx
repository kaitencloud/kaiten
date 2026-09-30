import { Button } from '@/components/ui/button';
import { ArrowLeftRight, Rocket } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { TableActionButton } from '@/functionals/table';
import { useModal } from '@/hooks/use-modal';
import { getInstanceDeploymentMode } from '../../utils/instance-deployment.utils';
import { InstanceDeploymentDialog } from './instance-deployment-dialog';

type InstanceDeploymentActionProps = {
  /** Current zone of the instance, or null/undefined when it is orphan. */
  deploymentZoneId?: string | null;
  instanceName: string;
  instanceSlug: string;
};

type InstanceDeploymentButtonProps = InstanceDeploymentActionProps &
  Pick<ComponentProps<typeof Button>, 'size' | 'variant'>;

/**
 * One control for the two transitions: an orphan instance is *deployed*, an
 * already-deployed one is *migrated*. Both open the same zone picker, so the
 * mode only drives the label and the icon.
 */
const useDeploymentAction = (deploymentZoneId?: string | null) => {
  const { t } = useTranslation();
  const { isOpen, open, close } = useModal();
  const mode = getInstanceDeploymentMode(deploymentZoneId);

  return {
    close,
    Icon: mode === 'migrate' ? ArrowLeftRight : Rocket,
    isOpen,
    label:
      mode === 'migrate'
        ? t('Pages.Customers.Instances.Deployment.migrateAction')
        : t('Pages.Customers.Instances.Deployment.deployAction'),
    open,
  };
};

export const InstanceDeploymentButton = ({
  deploymentZoneId,
  instanceName,
  instanceSlug,
  size = 'sm',
  variant = 'outline',
}: InstanceDeploymentButtonProps) => {
  const { close, Icon, isOpen, label, open } =
    useDeploymentAction(deploymentZoneId);

  return (
    <>
      <Button variant={variant} size={size} className="gap-2" onClick={open}>
        <Icon className="size-4" />
        {label}
      </Button>
      <InstanceDeploymentDialog
        deploymentZoneId={deploymentZoneId}
        instanceName={instanceName}
        instanceSlug={instanceSlug}
        open={isOpen}
        onOpenChange={(nextOpen) => (nextOpen ? open() : close())}
      />
    </>
  );
};

export const InstanceDeploymentTableAction = ({
  deploymentZoneId,
  instanceName,
  instanceSlug,
}: InstanceDeploymentActionProps) => {
  const { close, Icon, isOpen, label, open } =
    useDeploymentAction(deploymentZoneId);

  return (
    <>
      <TableActionButton tooltip={label} onClick={open}>
        <Icon size={16} />
      </TableActionButton>
      <InstanceDeploymentDialog
        deploymentZoneId={deploymentZoneId}
        instanceName={instanceName}
        instanceSlug={instanceSlug}
        open={isOpen}
        onOpenChange={(nextOpen) => (nextOpen ? open() : close())}
      />
    </>
  );
};
