# Stats cards

Rules for the figures built with `StatCard` (`app/src/functionals/stat-card/`): the strip under the header of a list or of an entity page, and the cards of the dashboard.

## Compose the card

A card is put together from its parts, in this order:

```tsx
<StatCard.Row columnsClassName="md:grid-cols-3">
  <StatCard>
    <StatCard.Label>License expires</StatCard.Label>
    <StatCard.Icon className="text-warning-subtle-foreground">
      <Calendar />
    </StatCard.Icon>
    <StatCard.Value>Oct 1, 2027</StatCard.Value>
    <StatCard.Helper>in 12 months</StatCard.Helper>
    <StatCard.Helper>renewal pending</StatCard.Helper>
  </StatCard>
</StatCard.Row>
```

`Label` and `Value` are required; `Icon` and up to two `Helper` lines are optional. Two figures that weigh the same ("2 near limit", "1 limit reached") take two `Value`s, at one size; `StatCard.Unit` sets the words after a number as its caption:

```tsx
<StatCard.Value>
  2<StatCard.Unit>near limit</StatCard.Unit>
</StatCard.Value>
<StatCard.Value>
  1<StatCard.Unit>limit reached</StatCard.Unit>
</StatCard.Value>
```

 The unit also carries the zone of a date or of a period, which the figure leaves out (`Jun 12, 2026` and, after it, `(UTC)`), as the strip of an invoice does (`app/src/features/billing/components/invoice-detail/invoice-detail-stats.tsx`). A tone goes on the `className` of the part it colours: the icon draws in `currentColor`. A card stands on its own outside a row, with the same look.

## A card carries a number that informs a decision

A state ("Planned", "Development", "Not deployed") is a badge in the page title, not a card: the value slot is set in numeral type, 30 px from `md`. When a card must show a word, `StatBadgeValue` renders it as a badge so that it does not pass for a figure. A figure has one home, the strip or a card of the tab, never both. The strip of an invoice has two exceptions, each written in its component (`invoice-detail-stats.tsx`): the total is also the foot of the lines, where the totals end under the column of amounts, and the due day of an invoice that ended is in its summary, since the card then says when it ended.

## A short label, two values and two helpers at most

Three words at most for the label, one line for each helper, two values and two helpers at most. In a `StatCard.Row`, each card spans five tracks of the row's grid (label, two values, two helpers) and lays its parts on them as a CSS subgrid: the labels, the values and each helper line sit on one line across the row, whatever the height of the labels and whichever cards leave a helper out. A third helper or value, or a helper that wraps, pushes the card's own content off those lines.

## The icon says what the figure counts

An icon that stands for an entity is that entity's icon from `dataModelIcons` (`@/lib/data-model-icons`), never another glyph: the licenses card draws the license icon, the tokens card the token icon. When the figure counts one entity and a helper another, the icon follows the figure. An icon for a state or a property keeps its own glyph: an alert, a date, a check. The rule is the "One icon per entity" principle in [AI_CONTEXT.md](../AI_CONTEXT.md#principles): it is reviewed in pull requests and no command checks it.

## Dense

`dense` makes a card smaller: tighter padding, smaller label and value. Set it on the row, and every card in it follows; set it on a card only when the card stands alone. A row mixes no dense and regular cards.

## Colour when the number is a state

An alert, an expiry, an overrun: colour under a condition, as the dashboard does (`app/src/features/dashboard/components/cards/dashboard-stats-cards.tsx`). A count stays neutral: a "0" is not a success.

## Two columns up to `xl`

By default the row has two columns from `md` and four from `xl` (`md:grid-cols-2 xl:grid-cols-4`), and two columns below `md`. A row of six, or of three, passes its own `columnsClassName` and keeps two or three columns below `xl`. The dashboard passes `md:grid-cols-3 xl:grid-cols-6`.

A row whose figures are wider than a number can keep two columns higher up. The strip of an invoice holds dates with their zone and a period of two dates, which a third of a tablet cuts in two: it has two columns up to `lg`, with its period across the second row (`col-span-2 lg:col-span-1` on the card), and sets that one figure a size below the others (`text-xl md:text-2xl`), as the usage alerts of an instance set their two. A period that is still too long wraps after its dash, each date whole.

## Complete data

A count computed over one page of results, such as the 200 events the instance audit-trail tab reads, says so in its label, or reads everything. `app/src/lib/api/all-pages-query-options.ts` has the query options that read every page.

## Review it

Look at the row at a width of 820 px, just above the `md` breakpoint. The stories are under `Functionals/StatCard`.
