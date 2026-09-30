import type { RefObject } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useEllipsis } from '@/hooks/use-ellipsis';
import { cn } from '@/lib/utils';

type ReleaseComponentNameTextProps = {
  className?: string;
  name: string;
  textRef?: RefObject<HTMLElement | null>;
};

function ReleaseComponentNameText({
  className,
  name,
  textRef,
}: ReleaseComponentNameTextProps) {
  return (
    <span
      ref={textRef as RefObject<HTMLSpanElement>}
      className={cn('block min-w-0 max-w-full', className)}
    >
      {name}
    </span>
  );
}

type ReleaseComponentNameProps = {
  className?: string;
  name: string;
};

export function ReleaseComponentName({
  className,
  name,
}: ReleaseComponentNameProps) {
  const ellipsis = useEllipsis();

  if (!ellipsis.isEllipsis) {
    return (
      <ReleaseComponentNameText
        className={cn(ellipsis.className, className)}
        name={name}
        textRef={ellipsis.ref}
      />
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="block min-w-0 max-w-full cursor-help text-left"
          >
            <ReleaseComponentNameText
              className={cn(ellipsis.className, className)}
              name={name}
              textRef={ellipsis.ref}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent align="start" side="top" className="max-w-sm px-3 py-2">
          <span className="break-all text-sm">{name}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
