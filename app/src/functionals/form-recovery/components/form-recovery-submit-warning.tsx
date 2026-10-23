import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { FormRecovery } from '../types';
import { useRecoveryText } from './use-recovery-text';

export type FormRecoverySubmitWarningProps = {
  recovery: FormRecovery<any, any>;
  /** The feature's own action: "View the list". */
  children?: ReactNode;
  className?: string;
};

/**
 * Above the submit button, where the person decides: these entries were sent
 * from another tab, or the last send got no answer and may have gone through.
 * Gone at the next verdict of the server.
 */
export function FormRecoverySubmitWarning({
  recovery,
  children,
  className,
}: FormRecoverySubmitWarningProps) {
  const { t } = useRecoveryText();
  const sentElsewhere = recovery.notices.some(
    (notice) => notice.kind === 'sentElsewhere',
  );
  const unknownOutcome = recovery.notices.some(
    (notice) => notice.kind === 'unknownOutcome',
  );

  if (!recovery.persistent || (!sentElsewhere && !unknownOutcome)) {
    return null;
  }

  return (
    <Alert role="status" className={cn(className)}>
      <TriangleAlert aria-hidden="true" />
      <AlertDescription className="text-foreground">
        <p>
          {sentElsewhere
            ? t('Functionals.FormRecovery.sentElsewhere.description')
            : t('Functionals.FormRecovery.unknownOutcome.description')}
        </p>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </AlertDescription>
    </Alert>
  );
}
