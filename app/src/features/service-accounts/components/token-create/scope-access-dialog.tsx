import { Button } from '@/components/ui/button';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { AccessLevel, AccessLevels, ResourceType } from '../../types';
import { ScopeAccessTable } from './scope-access-table';

const I18N = 'Pages.Integrations.ServiceAccounts.NewToken.Access';

type ScopeAccessDialogProps = {
  className?: string;
  levels: AccessLevels;
  onLevelChange: (resource: ResourceType, level: AccessLevel) => void;
};

/**
 * The scope table where the page is too short to keep it inline. It edits the
 * form directly, like the inline table: there is no draft to apply or discard,
 * and the summary behind it follows every change.
 */
export function ScopeAccessDialog({
  className,
  levels,
  onLevelChange,
}: ScopeAccessDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={className}>
          <SlidersHorizontal aria-hidden />
          {t(`${I18N}.adjust`)}
        </Button>
      </DialogTrigger>
      <DialogContent variant="form" className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t(`${I18N}.dialogTitle`)}</DialogTitle>
          <DialogDescription>
            {t(`${I18N}.dialogDescription`)}
          </DialogDescription>
        </DialogHeader>
        {/* No top padding on the scroller itself: a sticky heading stops at
            the scroller's padding edge, and rows scrolled past it showed
            through that band. The form variant sets the padding through its
            group selector, so the override has to use the same one; the list
            carries the gap instead. */}
        <DialogBody className="group-data-[variant=form]/dialog-content:pt-0">
          <ScopeAccessTable
            className="pt-4"
            levels={levels}
            onLevelChange={onLevelChange}
          />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">{t(`${I18N}.done`)}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
