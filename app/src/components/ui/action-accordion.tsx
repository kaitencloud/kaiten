import { ChevronDownIcon } from 'lucide-react';
import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import type * as React from 'react';

import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem } from './accordion';
import { useTranslation } from 'react-i18next';

const ActionAccordion = Accordion;
const ActionAccordionItem = AccordionItem;
const ActionAccordionContent = AccordionContent;

// Header row that lays out the trigger and the actions side by side
function ActionAccordionHeader({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Header> & { className?: string }) {
  const { t } = useTranslation();
  return (
    <AccordionPrimitive.Header className={cn('flex items-center', className)} {...props}>
        {children}
        <AccordionPrimitive.Trigger
          data-slot="accordion-chevron"
          aria-label={t('Common.toggleSection')}
          className="ml-4 p-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&[data-panel-open]>svg]:rotate-180"
        >
          <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 translate-y-0.5 transition-transform duration-200" />
        </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

// The clickable trigger part — renders a <button> that toggles the accordion
function ActionAccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger> & { className?: string }) {
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

export {
  ActionAccordion,
  ActionAccordionActions,
  ActionAccordionContent,
  ActionAccordionHeader,
  ActionAccordionItem,
  ActionAccordionTrigger,
};
