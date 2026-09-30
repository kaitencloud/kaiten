# Composition

A shared component that lays out several regions (a header, a body, actions, a footer) exposes a root and named sub-components. It does not take a long list of structural props such as `header`, `headerClassName`, `contentClassName` or `footer`. The rule is a principle in [AI_CONTEXT.md](../AI_CONTEXT.md#principles): it is reviewed in pull requests and no command checks it.

## Why

- A caller reads the layout in the JSX and can leave a region out.
- A new variant is a new sub-component or a `className`, not a new prop on a component that already has twenty.
- The component can change inside without changing what callers write.

## How

The parts are plain components, attached to the root with `Object.assign`:

```tsx
// app/src/functionals/detail-card/detail-card.tsx (abridged)
const Root = ({ className, children }: DetailCardRootProps) => (
  <Card className={className}>{children}</Card>
);

const Header = ({ className, children }: DetailCardHeaderProps) => (
  <CardHeader className={cn('pb-3', className)}>{children}</CardHeader>
);

// …Title, Content, Rows, Row, Divider

export const DetailCard = Object.assign(Root, {
  Action,
  Header,
  Title,
  Description,
  Content,
  Rows,
  Row,
  Divider,
});
```

A caller composes the parts:

```tsx
// app/src/features/entitlements/components/entitlement-detail/entitlement-detail-general-card.tsx (abridged)
<DetailCard className="xl:col-span-2">
  <DetailCard.Header>…</DetailCard.Header>
  <DetailCard.Content>
    <EntitlementGeneralCardRows … />
    <DetailCard.Divider />
    <EntitlementGeneralCardAudit … />
  </DetailCard.Content>
</DetailCard>
```

Export the component from the `index.ts` of its folder, so that callers import it from the module's public entry point ([import rules](../AI_CONTEXT.md#import-rules)).

## In the code

| Component | Parts |
| --- | --- |
| `Page` (`app/src/functionals/page/`) | `Header`, `Leading`, `Icon`, `Heading`, `TitleRow`, `Title`, `Subtitle`, `Actions`, `Divider`, `IconHeading`, `Fixed`, `Scroll` |
| `DetailCard` (`app/src/functionals/detail-card/`) | `Action`, `Header`, `Title`, `Description`, `Content`, `Rows`, `Row`, `Divider` |
| `TableCard` (`app/src/functionals/table/`) | `Header`, `HeaderLeading`, `HeaderIcon`, `HeaderHeading`, `HeaderTitle`, `HeaderSubtitle`, `HeaderActions`, `Toolbar`, `Content`, `Table` |
| `FilterTableLayout` (`app/src/functionals/table/`) | `Toolbar`, `ToolbarRow`, `Search`, `Actions`, `Filters`, `Content` |
| `FormDialog` (`app/src/components/dialog/`) | `Header`, `Title`, `Description`, `Content`, `Footer` |

## Where it does not apply

- A leaf component with a few props (a badge, a button) stays props-only.
- The primitives of `app/src/components/ui/` follow the shadcn/ui shape: each part is a separate named export (`Card`, `CardHeader`, `CardContent`), not a property of the root.
- Some shared components also export their parts separately rather than through `Object.assign`, such as `StackedFormDialog`, `StackedFormDialogPanel` and `StackedFormDialogCard` in `app/src/functionals/stacked-form-dialog/`. It is the same idea. Follow the shape of the neighbouring components when you extend one of them.
