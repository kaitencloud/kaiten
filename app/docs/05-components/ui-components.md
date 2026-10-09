# UI components

`app/src/components/ui/` holds the primitives every screen builds on. Look here before you write a new one. The folder is the inventory; this page groups it by use and links each component to its Storybook story when there is one. The stories carry the `autodocs` tag, so Storybook builds a Docs page that lists the props: they are not repeated here.

Most files follow the shadcn/ui shape (`components.json` at `app/`, style `base-vega`): each part of a component is a separate named export (`Card`, `CardHeader`, `CardContent`), and the shadcn CLI adds and updates them. Class names merge with `cn` from `@/lib/utils`. Variants are `cva` variants, exported next to the component (`buttonVariants`, `badgeVariants`, `toggleVariants`). The shared stylesheet imports `shadcn/tailwind.css` for the state and orientation variants and accordion animations.

This folder is the only place that imports `@base-ui/*`. `pnpm run lint` refuses that import in the rest of `src`, except in tests and stories, which lint does not scan; the folder itself is not linted either. To use a primitive that has no wrapper yet, add one here: see [import rules](../AI_CONTEXT.md#import-rules). `pnpm run check:file-sizes` does not apply to this folder.

Paths of the stories are `app/src/components/ui/stories/<name>.stories.tsx`.

## Actions and feedback

| Component | What it is | Story |
| --- | --- | --- |
| `Button` | A button, or another element styled as one with `render`. Links use `nativeButton={false}` and `role="link"`. The variants and sizes are `buttonVariants` in `button.tsx`. | none |
| `Badge` | A small label. The variants are `badgeVariants` in `badge.tsx`. | none |
| `Alert` | An inline message: `Alert`, `AlertTitle`, `AlertDescription`. | [alert](../../src/components/ui/stories/alert.stories.tsx) |
| `Skeleton` | A loading placeholder block. | [skeleton](../../src/components/ui/stories/skeleton.stories.tsx) |
| `Toaster` (`sonner.tsx`) | The toast host, mounted once in `app/src/routes/__root.tsx`. Raise a toast with `toast` from `sonner`. | [sonner](../../src/components/ui/stories/sonner.stories.tsx) |
| `Tooltip` | `Tooltip`, `TooltipTrigger`, `TooltipContent` and `TooltipProvider`. `app/src/main.tsx` mounts a provider around the router. | [tooltip](../../src/components/ui/stories/tooltip.stories.tsx) |
| `AnimatedThemeToggler` | The light and dark theme button. | [animated-theme-toggler](../../src/components/ui/stories/animated-theme-toggler.stories.tsx) |

## Inputs

In a form, use the [form fields](./form-components.md): they wrap these controls and add the label, the description and the error message.

| Component | What it is | Story |
| --- | --- | --- |
| `Input`, `Textarea` | The text controls. | [textarea](../../src/components/ui/stories/textarea.stories.tsx) |
| `NumberInput` | A number field with stepper buttons, on Base UI. Its value is `null` when the field is empty. | [number-input](../../src/components/ui/stories/number-input.stories.tsx) |
| `Select` | A single choice from a list: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` and their siblings. Pass `items` with value/label pairs so the trigger shows its label before opening, and use `null` for no selection. The list is never wider than the space the page leaves it (`max-w-(--available-width)`), so a long option wraps on a phone and does not scroll the page sideways. | [select](../../src/components/ui/stories/select.stories.tsx) |
| `Checkbox`, `Switch`, `Slider` | A boolean, an on and off setting, a range value. | [checkbox](../../src/components/ui/stories/checkbox.stories.tsx), [switch](../../src/components/ui/stories/switch.stories.tsx), [slider](../../src/components/ui/stories/slider.stories.tsx) |
| `Toggle`, `ToggleGroup` | A two-state button, and a group of them. | [toggle](../../src/components/ui/stories/toggle.stories.tsx), [toggle-group](../../src/components/ui/stories/toggle-group.stories.tsx) |
| `Label` | The label of a control. | none |
| `Calendar` | The month grid (react-day-picker) inside the date pickers. | [calendar](../../src/components/ui/stories/calendar.stories.tsx) |
| `Combobox` parts | A searchable list on Base UI's Combobox: `ComboboxPanel` renders the search box (`ComboboxSearch`) and the list (`ComboboxList`, `ComboboxGroup`, `ComboboxItem`, `ComboboxEmpty`, `ComboboxSeparator`) in place, always open, for a `Popover` or a dialog that owns the surface. Pass `items`, and `value={null}` when picking runs an action. The popup parts (`ComboboxContent`, `ComboboxTrigger`, `ComboboxChips`) follow shadcn. `Combobox` (the form field) and the filter menus use the panel. | [combobox](../../src/components/ui/stories/combobox.stories.tsx) |
| `IconPicker`, `IconPickerGrid` | A searchable grid of icons. The value is an icon token such as `lucide:rocket`. | none |

`field.tsx` (the parts of Base UI's `Field`) and `tanstack-form.tsx` (`FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField`, shadcn-style parts bound to TanStack Form's `useField`) are not what the forms of the console use: they use `useAppForm` and the parts of `app/src/components/form/`. `tanstack-form.tsx` has a [story](../../src/components/ui/stories/tanstack-form.stories.tsx).

## Overlays

| Component | What it is | Story |
| --- | --- | --- |
| `Dialog` | `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogBody`, `DialogFooter`, `DialogTitle`, `DialogDescription`. `DialogContent variant="form"` delimits the header and the footer as bands, and `DialogBody` is the zone that scrolls. | [dialog](../../src/components/ui/stories/dialog.stories.tsx) |
| `AlertDialog` | A modal that asks for a decision. `AlertDialogAction` is a button; compose `AlertDialogClose render={<AlertDialogAction ... />}` when confirming should also close the dialog. | [alert-dialog](../../src/components/ui/stories/alert-dialog.stories.tsx) |
| `Sheet` | A panel that slides in from an edge. | [sheet](../../src/components/ui/stories/sheet.stories.tsx) |
| `Popover` | A floating panel anchored to a trigger. | none |
| `DropdownMenu` | A menu of actions that opens from a button, on Base UI's Menu: `DropdownMenu`, `DropdownMenuTrigger` (pass the button with `render`), `DropdownMenuContent`, `DropdownMenuItem` (`variant="destructive"` for what cannot be undone), `DropdownMenuGroup`, `DropdownMenuLabel`, `DropdownMenuSeparator`. For the actions that do not fit beside each other, such as the actions of an invoice on a phone. A choice that stays, a value, is a `Select`. | [dropdown-menu](../../src/components/ui/stories/dropdown-menu.stories.tsx) |

For a form in a dialog and for confirmations, see the dialog shells of [`components/dialog`](./README.md#dialogs).

## Layout and navigation

| Component | What it is | Story |
| --- | --- | --- |
| `Card` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`. | none |
| `Tabs` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`. Pages with a route per tab use `RouteTabs` (a functional), which also takes tabs that are one route told apart by its search (`?status=`). | [tabs](../../src/components/ui/stories/tabs.stories.tsx) |
| `Accordion` | `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`. | [accordion](../../src/components/ui/stories/accordion.stories.tsx) |
| `ActionAccordion` | An accordion whose header has room for actions next to the trigger. | [action-accordion](../../src/components/stories/action-accordion.stories.tsx) |
| `Breadcrumb` | The breadcrumb parts. | [breadcrumb](../../src/components/ui/stories/breadcrumb.stories.tsx) |
| `Sidebar` | The side navigation shell and its parts, used by `app/src/routes/-components/side-nav/`. | [sidebar](../../src/components/ui/stories/sidebar.stories.tsx) |
| `ScrollArea` | A scroll container with the app's thin scrollbar. | none |
| `Separator` | A horizontal or vertical rule. | none |
| `Item` | A list item layout: `Item`, `ItemMedia`, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemActions` and others. | none |

## Data display

| Component | What it is | Story |
| --- | --- | --- |
| `Table` | The markup primitives (`Table`, `TableRow`, `TableCell` and their siblings). `DataTable` renders with them; use [`DataTable`](./table-components.md) for a list. | none |
| `ChartContainer` and its parts (`chart.tsx`) | A Recharts wrapper: `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent`, and the `ChartConfig` type. | [chart](../../src/components/ui/stories/chart.stories.tsx) |
| `ChartShell` | A card around a chart: `title`, `description`, `headerActions`, `titleIcon`. | [chart-shell](../../src/components/ui/stories/chart-shell.stories.tsx) |
| `EntityIcon` (`icon.tsx`) | Renders an icon token (`lucide:rocket`). An unknown name renders a fallback icon. | none |

`slot.tsx` composes a single child with Base UI's `useRender`, for the form controls outside this folder that need to merge props and refs.

## Shared components outside `ui/`

Small components that sit next to `ui/` in `app/src/components/`:

| Component | What it is | Story |
| --- | --- | --- |
| `GradientButton` | The call-to-action of a page, such as the create button of a list: a `label` and either `to` (a link) or `onClick`. | [gradient-button](../../src/components/stories/gradient-button.stories.tsx) |
| `DestructiveActionButton` | A destructive button with a confirmation dialog. Disabled with a `disabledReason` shown in a tooltip. | [destructive-action-button](../../src/components/stories/destructive-action-button.stories.tsx) |
| `ChoiceButton` | One choice among a few, as a button that is pressed when chosen: the shape of a price, the type of a voucher. A choice that cannot be made stays focusable and describes why. | [choice-button](../../src/components/stories/choice-button.stories.tsx) |
| `ChartEmptyState` | The placeholder of a chart without data. | [chart-empty-state](../../src/components/stories/chart-empty-state.stories.tsx) |
| `Atlassian`, `GitHub`, `Slack` and other company logos (`company-icons.tsx`) | SVG logos as components. | [company-icons](../../src/components/stories/company-icons.stories.tsx) |

The pickers (`Combobox`, `DatePicker`, `DateRangePicker`) are in [form components](./form-components.md#pickers).
