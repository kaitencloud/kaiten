import { useServiceAccountsMutations } from '../hooks/use-service-accounts-mutations';
import { CreateServiceAccountDialog } from './create-dialog';

interface ServiceAccountCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Route-connected create dialog: wires the presentational
 * `CreateServiceAccountDialog` to the create mutation. Rendered by the
 * `/integrations/service-accounts/new` route so the dialog is URL-driven and
 * the list stays mounted behind it (no page flash).
 */
export function ServiceAccountCreateDialog({
  open,
  onOpenChange,
}: ServiceAccountCreateDialogProps) {
  const { mutations, handlers } = useServiceAccountsMutations();

  return (
    <CreateServiceAccountDialog
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={handlers.handleCreateSA}
      isPending={mutations.createServiceAccount.isPending}
    />
  );
}
