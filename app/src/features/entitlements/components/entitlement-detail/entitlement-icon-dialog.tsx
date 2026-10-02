import type { IconToken } from '@/components/ui/icon';
import { IconPickerGrid } from '@/components/ui/icon-picker';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Entitlement } from '@/api-client';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getApiErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useEntitlementFormMutations } from '../../hooks';
import { entitlementToUpdateBody } from '../../utils/entitlement-writable';

type EntitlementIconDialogProps = {
  entitlement: Entitlement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Searchable icon grid dialog used to edit an entitlement icon from the
 * detail view. Picking an icon (or clearing it) saves immediately.
 */
export function EntitlementIconDialog({
  entitlement,
  open,
  onOpenChange,
}: EntitlementIconDialogProps) {
  const { t } = useTranslation();
  const { updateMutation } = useEntitlementFormMutations();

  const handleSelect = async (token: IconToken | null) => {
    try {
      await updateMutation.mutateAsync({
        path: { entitlementSlug: entitlement.slug! },
        body: entitlementToUpdateBody(entitlement, {
          icon: token ?? undefined,
        }),
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="sm:max-w-md"
        variant="form"
      >
        <DialogHeader>
          <DialogTitle>
            {t('Pages.Entitlements.Detail.iconDialog.title', 'Choose an icon')}
          </DialogTitle>
        </DialogHeader>
        <DialogBody
          className={cn(
            updateMutation.isPending && 'pointer-events-none opacity-50',
          )}
        >
          <IconPickerGrid
            value={entitlement.icon}
            onSelect={(token) => {
              void handleSelect(token);
            }}
            gridClassName="max-h-80 grid-cols-8 gap-1.5"
            iconClassName="size-5"
            maxIcons={120}
            labels={{
              searchPlaceholder: t(
                'Pages.Entitlements.Mutation.Form.Icon.search',
              ),
              empty: t('Pages.Entitlements.Mutation.Form.Icon.empty'),
              clear: t('Pages.Entitlements.Mutation.Form.Icon.clear'),
            }}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
