# Detail cards

Rules for the pages built with `DetailCard` (`app/src/functionals/detail-card/`): the Overview tab of an entity, with its information, summary and empty-state cards. The parts of `DetailCard` are listed in [composition](./composition.md#in-the-code).

## A card is as tall as its content

`DetailCard` sets no height of its own: no `h-full`, no minimum height on the header, no `flex-1` on the content. The rows follow the header, and the card ends after the last row. A grid still stretches its items to the height of the row, which is what the next section prevents.

Do not compensate for a height difference from inside a card: no `mt-auto`, `content-end` or `auto-rows-fr` on `DetailCard.Rows`. A card stretched to the height of its neighbour opens a gap between its header and its rows, and that is where an empty band reads most like a hole.

## The grid aligns at the top

A grid of cards carries `items-start`. The bottoms of the cards are uneven, and that is expected.

```tsx
// app/src/features/entitlements/components/entitlement-detail/entitlement-detail-overview.tsx (abridged)
<div className="grid items-start gap-4 xl:grid-cols-3">
  <EntitlementDetailGeneralCard … /> {/* <DetailCard className="xl:col-span-2"> */}
  <EntitlementDetailLicensesCard … />
</div>
```

The General card spans two columns and the linked licenses take the third.

## Short cards stack

When a short card sits next to a long one, stack it with another short card in a column (`<div className="grid gap-4">`) instead of stretching it or leaving it alone on a row.

The instance overview (`app/src/features/instances/components/instance-detail/tabs/overview/instance-detail-overview-tab.tsx`) has three columns from `xl`. The first holds Details and the CRM sync card, the second License and Metadata, the third Release. The CRM card renders only when the connector is on, so the columns stay about as tall with or without it.

## Empty states

An empty state (dashed border) is as tall as its message and its action. It does not use `flex-1` to centre itself in a stretched card.

## Review it on a sparse entity

Look at the screen with an entity that has little data: no description, no release, no metadata. A card that stretches, or a column that ends up short, shows there first.
