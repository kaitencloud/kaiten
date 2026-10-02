# `functionals/page`

The primitives that structure a page: a compound `Page` component for the page
header and layout, and an in-place editable title.

Import from `@/functionals/page`. The rules that apply to every functional are in
[functionals.md](../../../docs/01-architecture/functionals.md).

## `Page`

`Page` is a compound component. The root takes `className` and `layout`
(`'default'` or `'scroll'`).

| Part | Role |
| --- | --- |
| `Page.Header` | Section holding the title and the actions. Side by side from `sm`, stacked below |
| `Page.Leading`, `Page.Icon`, `Page.Heading` | Left side of the header: icon and text block |
| `Page.TitleRow`, `Page.Title`, `Page.Subtitle` | Title (`h1`), subtitle, and a row for a title with badges beside it |
| `Page.Actions` | Right side of the header |
| `Page.IconHeading` | Icon, title and subtitle in one part. Props: `icon`, `title`, `subtitle`, `size` (`sm`, `md`, `lg`, `xl`, default `xl`). At `xl` the title is the page's `h1` |
| `Page.Divider` | A horizontal rule |
| `Page.Fixed`, `Page.Scroll` | The fixed and the scrolling section of a `layout="scroll"` page |

### Layouts

- `layout="default"`: the root carries the horizontal gutter (`px-4 sm:px-6`).
  The page scrolls inside the `<main>` of the root layout, or handles its own
  scroll (list pages do it through `DataTable` with `bodyScrollable`).
- `layout="scroll"`: a fixed header and a scrollable body, with the scrollbar at
  the edge of the page. The root carries no gutter; it moves into the sections:
  `Page.Fixed` for what stays in place (header, tabs, stats) and the inner content
  of `Page.Scroll`, a full-width `ScrollArea` (`contentClassName` styles its inner
  wrapper). The pattern and its reasons are in
  [page-scrolling.md](../../../docs/03-patterns/page-scrolling.md).

```tsx
// app/src/features/notifications/components/notification-preferences-content.tsx (abridged)
<Page layout="scroll">
  <Page.Fixed>
    <Page.Header>…</Page.Header>
  </Page.Fixed>

  <Page.Scroll className="mt-4">…</Page.Scroll>
</Page>
```

A header with an editable title, from a detail page:

```tsx
// app/src/features/customers/components/customer-detail/customer-detail-header.tsx (abridged)
<Page.Header>
  <Page.IconHeading
    icon={dataModelIcons.customer}
    title={
      <EditableTitle
        value={customer.name}
        onSave={handleRename}
        label={t('Pages.Customers.Detail.editName', 'Edit name')}
      />
    }
    size="xl"
  />
  <Page.Actions>…</Page.Actions>
</Page.Header>
```

## `EditableTitle`

A title that turns into an input when clicked. It saves on Enter or blur and
cancels on Escape.

| Prop | Meaning |
| --- | --- |
| `value` | The persisted value |
| `onSave(value)` | Persists the new value; it should throw on failure. A failure shows an error toast and restores the old value |
| `label` | Accessible label of the edit button and the input |
| `minLength` | Minimum trimmed length to save. Default 1 |
| `disabled` | Read-only |
| `className`, `textClassName` | Styling; `textClassName` applies to the label and the input |

Use it inside a `Page.Title` or `Page.IconHeading` title slot so it inherits the
header layout.
