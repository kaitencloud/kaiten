import * as React from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  );
}

type TabsVariant = 'default' | 'line';

const TabsVariantContext = React.createContext<TabsVariant>('default');

function TabsList({
  variant = 'default',
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
  variant?: TabsVariant;
}) {
  const listClassName =
    variant === 'line'
      ? 'inline-flex h-auto w-fit items-center justify-start rounded-none border-b bg-transparent p-0'
      : 'bg-secondary text-muted-foreground inline-flex h-10 w-fit items-center gap-1 rounded-lg p-1';

  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        className={cn(listClassName, className)}
        {...props}
      >
        {children}
      </TabsPrimitive.List>
    </TabsVariantContext.Provider>
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(TabsVariantContext);

  const triggerClassName =
    variant === 'line'
      ? 'inline-flex h-10 items-center justify-center rounded-none border-b-2 border-transparent px-4 text-sm font-medium whitespace-nowrap text-muted-foreground transition-all hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4'
      : // The hover fill is scoped to `data-[state=inactive]` rather than left as a
        // bare `hover:`: the active trigger already owns `bg-background`, and an
        // unscoped hover would put a translucent copy of that same colour on top of
        // it — two rules of equal specificity whose winner is Tailwind's emission
        // order, not a decision anyone made. It also matches `RouteTabs`, which
        // reaches the same result by only emitting hover classes when inactive.
        'inline-flex h-full items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all text-muted-foreground data-[state=inactive]:hover:bg-background/70 hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4';

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(triggerClassName, className)}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
