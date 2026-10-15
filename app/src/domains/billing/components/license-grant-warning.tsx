import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';

type LicenseGrantWarningProps = {
  /** The sentences of the warning, one paragraph each. */
  children: ReactNode;
  className?: string;
  testId: string;
};

/**
 * The frame of a warning about a grant of an add-on or a voucher that would lower what a
 * license grants. The write stays allowed -- it is the vendor's intent, and
 * the API refuses none of them -- so this is a note above the buttons, never a blocker.
 * What it says is the caller's: each screen has its own words for what it is about to
 * send.
 */
export function LicenseGrantWarning({
  children,
  className,
  testId,
}: LicenseGrantWarningProps) {
  return (
    <Alert className={className} data-testid={testId} role="status">
      <TriangleAlert className="text-warning-subtle-foreground" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
