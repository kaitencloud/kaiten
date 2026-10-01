import { Button } from '@/components/ui/button';
import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type TableActionButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  'size' | 'variant'
> & {
  tooltip: string;
  asChild?: boolean;
};

export function TableActionButton({
  className,
  tooltip,
  asChild,
  children,
  disabled,
  ref,
  ...props
}: TableActionButtonProps) {
  const button = (
    <Button
      {...props}
      ref={ref}
      aria-label={tooltip}
      disabled={disabled}
      className={cn(className, 'h-8 w-8 p-0')}
      variant="ghost"
      nativeButton={props.nativeButton ?? !asChild}
      role={props.role ?? (asChild ? 'link' : undefined)}
      render={
        asChild
          ? (React.Children.only(children) as React.ReactElement)
          : props.render
      }
      onClick={(e) => {
        e.stopPropagation();
        if (!asChild) {
          props.onClick?.(e);
        }
      }}
    >
      {asChild ? undefined : children}
    </Button>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            disabled ? (
              <span className="inline-flex" tabIndex={0}>
                {button}
              </span>
            ) : (
              button
            )
          }
        />
        <TooltipContent className="max-w-64 whitespace-pre-line">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

TableActionButton.displayName = 'TableActionButton';
