import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ActionAccess } from './use-can-perform';

/**
 * What a dialog that a session may not use does when its address is opened by hand: it says so
 * and closes, which takes the address back to the page behind it. The buttons that lead to the
 * dialog are hidden from such a session, so only the address gets here, and a page with a
 * breadcrumb that ends in "New" and nothing to say why would look broken.
 *
 * Nothing is said while the token is still being read, or while the dialog is not asked for
 * (`open` false).
 */
export function useLeaveRestrictedDialog(
  access: ActionAccess,
  leave: () => void,
  open = true,
) {
  const { t } = useTranslation();
  const leaveRef = useRef(leave);
  const refused = open && !access.isPending && !access.allowed;

  useEffect(() => {
    leaveRef.current = leave;
  });

  useEffect(() => {
    if (!refused) {
      return;
    }
    // One toast even where the effect runs twice (a strict-mode render).
    toast.error(t('Errors.restrictedAction'), { id: 'restricted-action' });
    leaveRef.current();
  }, [refused, t]);
}
