import type { ReactNode } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type BadgeExplanationProps = {
  /** The badge. */
  children: ReactNode;
  /** What stands behind the badge; none leaves the badge as it is. */
  explanation?: string;
};

/**
 * Says what stands behind a badge, on hover and on focus. A native `title` does
 * neither for a keyboard, a touch screen or most screen readers, and the reason
 * a draft is held is something a person needs to read, not a nicety.
 */
export function BadgeExplanation({
  children,
  explanation,
}: BadgeExplanationProps) {
  if (!explanation) {
    return <>{children}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="inline-flex w-fit rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            tabIndex={0}
          >
            {children}
          </span>
        }
      />
      <TooltipContent className="max-w-xs whitespace-normal">
        {explanation}
      </TooltipContent>
    </Tooltip>
  );
}
