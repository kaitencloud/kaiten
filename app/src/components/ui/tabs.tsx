import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import * as React from 'react';

import { cn } from '@/lib/utils';

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
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
}: TabsPrimitive.List.Props & {
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

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  const variant = React.useContext(TabsVariantContext);

  const triggerClassName =
    variant === 'line'
      ? 'inline-flex h-10 items-center justify-center rounded-none border-b-2 border-transparent px-4 text-sm font-medium whitespace-nowrap text-muted-foreground transition-all hover:text-foreground data-active:border-primary data-active:text-foreground data-active:shadow-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4'
      : // The hover fill is scoped to inactive triggers rather than left as a
        // bare `hover:`: the active trigger already owns `bg-background`, and an
        // unscoped hover would put a translucent copy of that same colour on top of
        // it. Base UI has no `data-inactive`, so this is `not-data-active`.
        'inline-flex h-full items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all text-muted-foreground not-data-active:hover:bg-background/70 hover:text-foreground data-active:bg-background data-active:text-foreground data-active:shadow-sm disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4';

  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(triggerClassName, className)}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
