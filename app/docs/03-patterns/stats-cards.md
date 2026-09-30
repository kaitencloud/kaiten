# Stats cards

Rules for the row of figures built with `StatsCardsRow` (`app/src/functionals/stats-cards-row/`): the strip under the header of a list or of an entity page.

## A card carries a number that informs a decision

A state ("Planned", "Development", "Not deployed") is a badge in the page title, not a card: the value slot is set in numeral type, 30 px from `md`. When a card must show a word, `StatBadgeValue` renders it as a badge so that it does not pass for a figure. A figure has one home, the strip or a card of the tab, never both.

## A short label, a one-line helper

Three words at most for the label, one line for the helper. The component aligns the values of the whole row on one line, whatever the height of the labels, and reserves the helper line on every card as soon as one card has a helper. It does not absorb a two-line helper or content nested in a card: both push the value of their card off the line.

## Colour when the number is a state

An alert, an expiry, an overrun: colour under a condition, as the dashboard does (`app/src/features/dashboard/components/cards/dashboard-stats-cards.tsx`). A count stays neutral: a "0" is not a success.

## Two columns up to `xl`

By default the row has two columns from `md` and four from `xl` (`md:grid-cols-2 xl:grid-cols-4`), and two columns below `md`. A row of six, or of three, passes its own `columnsClassName` and keeps two or three columns below `xl`. The dashboard passes `md:grid-cols-3 xl:grid-cols-6`.

## Complete data

A count computed over one page of results, such as the 200 events the instance audit-trail tab reads, says so in its label, or reads everything. `app/src/lib/api/all-pages-query-options.ts` has the query options that read every page.

## Review it

Look at the row at a width of 820 px, just above the `md` breakpoint.
