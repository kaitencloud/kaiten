# Page scrolling

A page whose body scrolls keeps its header in place and puts the scrollbar at the right edge of the page, not against the content. This is `Page layout="scroll"` with `Page.Fixed` and `Page.Scroll` (`app/src/functionals/page/`). The parts of `Page` are described in the [functional's README](../../src/functionals/page/README.md).

## The layout

A page whose content can exceed the screen, and whose body is not a table, uses the `scroll` layout of `Page`. The header (title, actions, tabs, stats) stays visible and only the content scrolls. The scrollbar is the one of `ScrollArea` (`app/src/components/ui/scroll-area.tsx`): the native scrollbar is hidden and a thin one appears when the pointer is over the area.

```tsx
// app/src/features/notifications/components/notifications-page-content.tsx (abridged)
<Page layout="scroll">
  <Page.Fixed>
    <Page.Header>…</Page.Header>
    <div className="mt-6 …">…filters…</div>
  </Page.Fixed>

  <Suspense fallback={<NotificationsFeedListSkeleton />}>
    <NotificationsFeedList … />
  </Suspense>
</Page>
```

`NotificationsFeedList` renders a fixed column header in a `Page.Fixed` and the rows in a `Page.Scroll`. `Page.Scroll` takes `className` for the scroll area and `contentClassName` for the wrapper around the content.

## How it works

The horizontal gutter goes down into the sections. No ancestor of the scroll area carries it. In the `scroll` layout the `Page` root has no horizontal padding, and `Page.Fixed` and the inner wrapper of `Page.Scroll` each apply the standard gutter (`px-4 sm:px-6`). The `ScrollArea` therefore reaches the edge of the page with no negative margin to compensate, and its scrollbar sits at that edge, with the gutter as its gap.

Without the `scroll` layout, a page puts the padding above the scroller, so a native scrollbar sits against the elements:

```tsx
// Native scroller in a bounded Page: the gutter is above the scroller, the scrollbar touches the content
<Page className="h-full min-h-0 overflow-hidden">
  <div className="flex-1 min-h-0 overflow-auto pr-1">…</div>
</Page>

// Page layout="scroll": a gutter per section, the scrollbar at the page edge
<Page layout="scroll">
  <Page.Fixed>…</Page.Fixed>
  <Page.Scroll>…</Page.Scroll>
</Page>
```

Reasons for the `scroll` layout:

- The header stays visible while the content scrolls.
- A scrollbar at the page edge is where the eye expects it. Against the cards, it draws attention to the layout mechanics.
- `ScrollArea` avoids a wide, permanent native scrollbar that depends on the operating system.
- One scroll container per page: no double scrollbar, no trapped wheel.

## Where it is used

Two pages use `layout="scroll"`: the notifications feed and the notification preferences (`app/src/features/notifications/components/`). Most list pages use `<Page className="h-full min-h-0 overflow-hidden">` around a table that scrolls its own body (see [Tables](#tables)) or a native `overflow-auto` container. Detail and form pages vary. Some use a plain `<Page>`, often with `space-y-*`. `DetailEntityLayout` (`app/src/functionals/detail-entity-layout/`) uses `h-full overflow-hidden`; its Content region scrolls while Top and Tabs stay fixed.

Use `layout="scroll"` for a new page with a scrolling body that is not a table.

The `<main className="flex-1 overflow-auto">` of `app/src/routes/__root.tsx` scrolls a page that does not structure its own scrolling, such as a plain `<Page>` root.

## Tables

A page whose content is a table lets `DataTable` scroll its body. `bodyScrollable` makes the body scroll under the column header and the table fill the height of its parent, so no `Page.Scroll` is needed around it:

```tsx
// app/src/features/customers/components/customers-page-content.tsx (abridged)
<Page className="h-full min-h-0 overflow-hidden">
  <Page.Header>…</Page.Header>
  <RouteTabs tabs={tabs} />
  <div className="flex-1 min-h-0">
    <CustomersTable customers={customers} /> {/* DataTable with bodyScrollable */}
  </div>
</Page>
```

The pages that list rows in a table are built this way. See [tables](./tables.md) and the [`table` functional](../../src/functionals/table/README.md).

## Overlays

`ScrollArea` gives a bounded overlay (popover, dropdown, dialog, sheet) the same thin scrollbar. The notification panel does it: `app/src/features/notifications/components/notification-panel.tsx`. Some existing containers use a native `overflow-y-auto` instead; prefer `ScrollArea` for a new scrolling zone.
