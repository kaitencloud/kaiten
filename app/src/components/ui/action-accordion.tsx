import { ChevronDownIcon } from 'lucide-react';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

// Re-export Root and Content from the base accordion
function ActionAccordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function ActionAccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn('border-b last:border-b-0', className)}
      {...props}
    />
  );
}

// Header row that lays out the trigger and the actions side by side
function ActionAccordionHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <AccordionPrimitive.Header asChild>
      <div className={cn('flex items-center', className)} {...props}>
        {children}
        <AccordionPrimitive.Trigger
          data-slot="accordion-chevron"
          className="ml-4 p-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&[data-state=open]>svg]:rotate-180"
        >
          <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 translate-y-0.5 transition-transform duration-200" />
        </AccordionPrimitive.Trigger>
      </div>
    </AccordionPrimitive.Header>
  );
}

// The clickable trigger part — renders a <button> that toggles the accordion
function ActionAccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Trigger
      data-slot="accordion-trigger"
      className={cn(
        'focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-center gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </AccordionPrimitive.Trigger>
  );
}

// Slot for action buttons — sits outside the <button> trigger, no nesting issue
function ActionAccordionActions({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="accordion-actions"
      className={cn('flex items-center gap-2', className)}
      {...props}
    >
      {children}
    </div>
  );
}

function ActionAccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
      {...props}
    >
      <div className={cn('pt-0 pb-4', className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export {
  ActionAccordion,
  ActionAccordionActions,
  ActionAccordionContent,
  ActionAccordionHeader,
  ActionAccordionItem,
  ActionAccordionTrigger,
};
