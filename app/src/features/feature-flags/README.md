# Feature flags

The feature flags screens manage the flags that products evaluate through Kaiten. A user lists the flags of the organization, filters them, switches one on or off, creates a flag, and edits its variants, its default strategy and its targeting rules. The detail page shows a flag as configured and previews an evaluation against a context the user writes.

A flag has a type (`boolean`, `string`, `number` or `object`), a list of variants (named values of that type), a default strategy and an ordered list of targeting rules written in CEL. The API evaluates flags for products through its OFREP endpoints (`/ofrep/v1/evaluate/flags`); this feature only edits flags and previews the result.

The console also gates some of its own features on flags (today `demo-sandbox`), through `app/src/lib/feature-flags.ts`. Unless both `VITE_KAITEN_PLATFORM_API_URL` and `VITE_KAITEN_PLATFORM_FLAGS_TOKEN` are set (see `app/.env.example`), local, development and e2e builds evaluate them against the API's own OFREP endpoint (Mock Service Worker answers it in e2e), which serves the catalog this feature edits. A flag saved here can then gate a console feature, and the console re-reads its flags after every successful mutation, including the ones made from these screens. When both variables are set, it reads the service they name instead and does not refresh. A deployed build that does not set both evaluates nothing, and every such flag is off.

The variants editor, the targeting editor and the rollout controls are folders of this feature (`variants/`, `targeting/`, `rollout/`), documented below. They are private to the feature.

## Routes

| Path | Route file |
| --- | --- |
| `/feature-flags` (search `view`: `list` or `table`, default `table`) | `app/src/routes/feature-flags/index.tsx` |
| `/feature-flags/new` | `app/src/routes/feature-flags/new/index.tsx` |
| `/feature-flags/$featureFlagSlug` (Overview tab) | `app/src/routes/feature-flags/$featureFlagSlug/route.tsx` (layout) and `index.tsx` |
| `/feature-flags/$featureFlagSlug?mode=configure` | the same layout, which renders the edit form instead of the detail page |
| `/feature-flags/$featureFlagSlug/variants` | `app/src/routes/feature-flags/$featureFlagSlug/variants.tsx` |
| `/feature-flags/$featureFlagSlug/targeting` | `app/src/routes/feature-flags/$featureFlagSlug/targeting.tsx` |
| `/feature-flags/$featureFlagSlug/evaluation` | `app/src/routes/feature-flags/$featureFlagSlug/evaluation.tsx` |
| `/feature-flags/$featureFlagSlug/audit-trail` | `app/src/routes/feature-flags/$featureFlagSlug/audit-trail.tsx`, which redirects to the Overview |

The detail layout loads the flag in `beforeLoad` and in `loader`, and sets the breadcrumb title to the flag name. `mode` accepts only `configure`. The API cannot filter audit events by flag, so a flag has no audit tab. The URL still resolves.

## Structure

```txt
app/src/features/feature-flags/
├── components/
│   ├── feature-flags-page-content.tsx   # the /feature-flags page: header, stats cards, list
│   ├── feature-flag-list.tsx            # toolbar, filters, table or list switch
│   ├── feature-flag-table.tsx           # table view
│   ├── feature-flag-card.tsx            # list view: one card per flag, with the enable switch
│   ├── feature-flag-stats-cards.tsx     # the four counters above the list
│   ├── variant-display.tsx              # variant badges for table cells
│   ├── targeting-display.tsx            # targeting badges for table cells
│   ├── try-it-dialog.tsx                # evaluates a flag for a context
│   ├── feature-flag-configure-page.tsx  # the form in edit mode
│   ├── feature-flag-detail/             # detail layout, shared context, the four tabs
│   ├── feature-flag-form/               # create stepper, edit tabs, one form per step
│   │   └── default-variant/             # default strategy and codegen fallback
│   ├── __tests__/, stories/
│   └── index.ts
├── hooks/       # form, toggle and rename hooks; hooks that read the stores
├── queries/     # query options and cache helpers
├── schemas/     # form schema and one schema per step
├── store/       # TanStack Store factories for local UI state
├── types/       # form value and prop types
├── utils/       # `featureFlagFormOpts`, shared by the form and its steps
├── rollout/     # date and percentage rollout controls
├── targeting/   # targeting rules list, dialog and CEL field
├── variants/    # variants list and variant form
└── index.ts     # what routes import
```

The stores hold local UI state: whether the Try it dialog of a card is open (`store/feature-flag-card-store.ts`), the JSON text of that dialog (`store/feature-flag-try-it-dialog-store.ts`) and the state of the default strategy section of the form (`store/default-variant-config-store.ts`). Each has a hook in `hooks/`.

Each submodule follows the same layout, keeping only the folders it needs:

- `variants/`: `components/`, `schemas/`, `types/`.
- `targeting/`: `components/`, `hooks/` (`targeting/hooks/use-targeting-editor-support.ts`), `queries/`, `schemas/`, `types/`, `utils/`.
- `rollout/`: `components/`, `logic/` (the arithmetic on distributions).

Text uses the `Pages.FeatureFlags.*` keys, plus `Features.Targeting.*` and `Features.Variants.*` for the submodules. See [i18n](../../../docs/02-conventions/i18n.md).

## Data

- **List.** `featureFlagsQueryOptions` is `allFeatureFlagsOptions()` from `app/src/lib/api/all-pages-query-options.ts`: the query key of the generated `getFeatureFlagsOptions()`, with a `queryFn` that walks every page. The route loader calls `ensureQueryData` on it.
- **Detail.** `featureFlagQueryOptions(featureFlagSlug)` is the generated `getFeatureFlagOptions`. The detail layout reads it in `beforeLoad` and `loader` and with `useSuspenseQuery`.
- **Mutations.** `createFeatureFlagMutation` and `updateFeatureFlagMutation` come from `@/api-client/@tanstack/react-query.gen`. The update endpoint is a full `PUT`: the switch on a card, the rename in the detail header and the form each send the whole flag. `evaluateFlagMutation` (`POST /ofrep/v1/evaluate/flags/{key}`, where the key is the flag slug) backs the Try it dialog.
- **Targeting support.** `getTargetingContextOptions` (`GET /feature-flags/targeting/context`), `lintTargetingRule` (`POST /feature-flags/targeting/lint`) and `testTargetingRule` (`POST /feature-flags/targeting/test`) serve the CEL editor. The Test dialog also reads `allInstancesOptions()` once it opens.
- **Cache.** After an update, `mergeFeatureFlagIntoCache` writes the saved flag into the cached list (it replaces the flag, or puts it first when it is absent) and into the flag's detail entry. When the slug changed, it removes the detail entry of the old slug. `revalidateFeatureFlagsListQuery` then invalidates the list and swallows the error. A creation only revalidates the list.
- **Not used.** The feature has no GraphQL document. The API also exposes `DELETE /feature-flags/{featureFlagSlug}`, which no screen calls.

## Behaviour

### Scopes

The API requires `read:feature_flags` to list, read and evaluate flags and to read the targeting context, and `write:feature_flags` to create, update and delete flags and to lint and test a rule. No component of the feature checks scopes, so a screen stays visible when the token lacks one. The API's refusal then appears as follows:

- A toast, with the API's message, for the enable switch of a card, the rename in the detail header (which also restores the old name) and the form submission.
- Inline in the Try it dialog, for an evaluation.
- The restricted-access state of the route error component, with the API's message, when the list or a flag fails to load.
- Nowhere, for the editor's CEL requests. A rule that cannot be linted does not block a save, and the Test dialog of the editor shows neither a message nor a result when its request fails.

### List page

- The default view is the table. `?view=list` shows one card per flag. The switch in the toolbar replaces the search parameter, so it adds no history entry.
- The filters run in the browser over the whole list: a name search (the pinned text filter), a type filter built from the types present in the list, and an enabled or disabled filter. The four stats cards (total, enabled, disabled, with targeting) count the unfiltered list.
- The table shows the name with its slug, the type, the status, the variants, the targeting rules and the metadata (opened in a JSON dialog). A row opens the detail page.
- A card shows the name, an enable switch, the type, the slug, the variant and rule counts, and three buttons: Try it, View and Configure (`?mode=configure`). The switch asks for confirmation first, because it changes the flag for every evaluation. On confirmation it sends the flag with `enabled` flipped, then shows a success or an error toast. The table has no switch.
- In the list view, an empty organization shows an empty-state text, and filters that exclude every flag show "no results".

### Detail page

- The header renames the flag inline. The rename sends a full `PUT` rebuilt from the flag with only the name changed, so the slug stays. Badges show the status and the type. Try it opens the evaluation dialog, Configure opens the form.
- Four stat cards show the number of variants, the number of targeting rules (and how many of them are rollouts), the number of evaluations tried in this session and the default strategy.
- **Overview.** The general card shows the type, the event name, the slug, the status and the owner, read from `metadata.owner`. A created and updated block shows only when the payload carries `created_at` or `updated_at`; the API does not return them. A card shows the default strategy: the variant, the start and end of a date rollout, or the distribution with a total badge that is styled as an error when it is not 100. Another card shows the metadata as JSON.
- **Variants.** A table of the variants with their name, description and value, and a column that says how the default strategy uses each one: a "default" badge, its percentage, or a "date based" badge.
- **Targeting.** The rules in order, each with its name, type, CEL rule and outcome. A closing block names the default strategy that applies when no rule matches.
- **Evaluation** (the tab is labelled "Try it history"). A table of the evaluations tried from the Try it dialog (context, variant, reason, value) and a card with session counters.
- The four tabs read one context, `FeatureFlagDetailContext`, that the layout builds with `useFeatureFlagDetailContextValue`.

### Try it

- The dialog takes a JSON evaluation context. The default is `{"targetingKey": "user-123"}`. Invalid JSON, or a context without `targetingKey`, shows an inline error and sends nothing.
- The result shows the reason, the value, the variant and the metadata. An API error shows inline, through `getApiErrorMessage`.
- On the detail page, each successful run adds a sample to the Evaluation tab. The page keeps the last ten in memory, and a reload clears them. From a card, the dialog records nothing.
- A disabled flag still evaluates. The API answers with the default strategy and the reason `DISABLED` (`api/internal/modules/featureflags/evaluator/evaluator.go`).

### Create and edit form

- One TanStack Form instance holds the whole flag, in four steps: Basic Information, Variants Configuration, Default Variant and Targeting Rules. `featureFlagFormSchema` extends the generated `zFeatureFlagWritable`, and each step validates with a `.pick()` of it (`step1Schema` to `step4Schema`). See [forms](../../../docs/03-patterns/forms.md).
- **Create** (`/feature-flags/new`) is a guided stepper (`FeatureFlagCreateStepper`). Next stays disabled until the schema of the current step passes, and a tooltip on the disabled button lists what is missing. Back and the step bar return to any step already reached. The last step ends in the submit button, whose tooltip lists what blocks it. The header holds the enabled switch and Cancel. A success returns to `/feature-flags` with a toast.
- **Edit** (`?mode=configure`) shows the same four steps as free tabs, with the submit button in the header. It stays disabled until the form is valid and changed, and its tooltip lists the blockers. A success opens the detail page of the flag, at its new slug if it changed. Cancel returns to the detail page.
- Typing in the name field overwrites the slug with `generateSlug(name)` from `@/functionals/slug`, in both modes. The slug field stays editable. The schema only requires a non-empty slug; the blockers tooltip also names a slug that is not 2 to 100 characters of lowercase letters, digits and hyphens, starting and ending with a letter or digit.
- The type is locked in edit mode. In create mode, changing it while the form holds variants or targeting rules opens a confirmation. Confirming resets the variants, the default strategy and the targeting rules, and drops `metadata.fallback_value`. Cancelling restores the previous type.
- The form has no field for `event_name`, nor for `metadata` beyond `fallback_value`. A new flag sends an empty `event_name`, and an edit sends both back as loaded.
- A failed submission shows `getApiErrorMessage` in a toast and leaves the form as it is.

### Default strategy and codegen fallback

The Default Variant step (`components/feature-flag-form/default-variant/`) sets what the flag returns when no targeting rule matches.

- The strategy is one of `basic` (one variant, labelled "Simple Variant"), `rollout_date` and `rollout_percentage`. Switching strategy resets its value to the first variant.
- For `basic`, a flag with a single variant selects it automatically. If the selected variant is removed or renamed away, the selection moves to the first variant, or to nothing when no variant is left.
- A second card sets the codegen fallback, stored in `metadata.fallback_value`. It is used by generated code only, not by evaluation: the OpenFeature manifest of the API (`GET /openfeature/v0/manifest`) lists the flags that have one. The card is on by default: opening the step on a flag that has variants and no fallback copies the value of the selected variant (the first variant, for a rollout strategy) into `metadata.fallback_value`. Its switch removes the key. The value field accepts JSON and falls back to a plain string.

## Variants

`variants/` edits the variants of a flag.

- `VariantList` is a controlled component: the parent owns the array and receives every change through `onChange`, so it has no store. Its props are `variants`, `type` and `onChange`, plus an optional `disabled`. See [state management](../../../docs/03-patterns/state-management.md). The form wires it as follows:

```tsx
// app/src/features/feature-flags/components/feature-flag-form/variants-form.tsx (abridged)
import type { Variant } from '@/api-client';
import { VariantList } from '../../variants';

<form.AppField name="variants">
  {(field: any) => (
    <VariantList
      variants={field.state.value || []}
      type={variantType as 'boolean' | 'string' | 'number' | 'object'}
      onChange={(variants: Variant[]) => {
        field.handleChange([...variants]);
      }}
    />
  )}
</form.AppField>
```

- Each variant is an accordion item with a name, a description and a value. The value field follows the flag type: a disabled true or false select for `boolean`, a text field for `string`, a number field for `number` and a JSON editor for `object`. An `object` value that is not valid JSON fails validation (`objectVariantSchema` in `variants/schemas/variant.schema.ts`).
- For a `boolean` flag, an empty list is seeded with `true` and `false`. The list offers no add or delete button, and the value is locked. The names and descriptions stay editable.
- Other types add a variant with an empty name and a default value (`''`, `0` or `{}`). Deleting one asks for confirmation.
- A variant form validates on blur with the schema of the flag type (`getVariantSchemaByType`). The item header previews the edit as it is typed and shows "Invalid" when the form is invalid. A duplicate name shows a warning under the list title, and the form does not block on it. The form-level schema requires at least one variant, each with a name and a non-empty value.
- `mapToFormVariants` and `mapToApiVariants` convert between the API and the form shape.

## Targeting

`targeting/` edits the targeting rules of a flag. The API tries the rules in list order and serves the outcome of the first that matches. When none matches, the default strategy applies.

- `TargetingList` is a controlled component like `VariantList`: `targetings`, `variants` and `onChange`, plus optional `disabled` and `disableCelValidation`. Adding a rule is disabled while the flag has no variant, and a message replaces the empty state.
- A rule is a `Targeting`, one of three generated types told apart by `type`. All three have a `name` and a CEL `rule`.
  - `basic` adds a `variant`.
  - `rollout_date` adds a `start` and an `end`, each with a `date`, a `percentage` and a `variant`.
  - `rollout_percentage` adds a `distribution` of percentages per variant.
- The list shows each rule with its position. A user reorders rules by dragging a card (`@dnd-kit`, activation after 8 px), with the keyboard (dnd-kit's `KeyboardSensor`) or with the arrow buttons, and edits or deletes one from its card. A percentage rollout rule also shows its distribution as a stacked bar (`DistributionBar`). Deleting asks for confirmation.
- `TargetingFormDialog` creates or edits a rule. Only the create mode offers the type select. Save stays disabled while the form is invalid, unchanged, submitting or waiting for the lint. Clicking outside does not close the dialog.
- Each type has its own form schema in `targeting/schemas/targeting.schema.ts`, built on the generated `zBasicTargeting`: a name and a rule are required, and so are the variant of a `basic` rule and the dates, percentages (0 to 100) and variants of a `rollout_date` rule. A `rollout_percentage` distribution must total 100 (`validateDistribution`).
- **The rule field.** `CelField` shows the rule as a coloured, read-only preview. A click opens the CEL editor dialog, which edits a draft and commits it on Apply. The editor is the [`cel-editor` functional](../../functionals/cel-editor/README.md).
- **What the editor knows comes from the server.**
  - `useTargetingEditorSupport` fetches the names a rule may read (`targetingContextQueryOptions`, kept for five minutes). When the request fails, for instance without the scope, the editor gets no schema and still completes CEL's own vocabulary.
  - `TargetingBaseFields` wires the lint as an async field validator, debounced by 400 ms, on change and on submit, so the verdict that draws the editor's markers is the one that disables Save.
  - A lint that cannot be reached does not block a save. The feature has no CEL validator of its own; the editor also runs a local syntax check, which its README describes.
  - The issues are shown in English, as the server words them.
- **Test.** The editor toolbar has a Test button, disabled while the rule is empty. It opens `CelTestDialog`, which runs the draft rule through `POST /feature-flags/targeting/test` for an optional instance, a targeting key and a JSON context. It reports whether the rule matched, was invalid or failed to evaluate, and shows the facts the server computed.

## Rollout

`rollout/` holds the two controls that edit a rollout, used by the default strategy and by the targeting forms.

- `RolloutPercentageConfig` edits a distribution of percentages per variant. With two variants, one slider moves both shares. With three or more, each variant has a slider and the shares are rescaled to whole percentages that total 100. Adding a variant splits the total evenly and gives the remainder to the new one. Removing one rescales the others in proportion. A button resets to an even split. The total is shown in the error colour when it is not 100. The arithmetic is in `rollout/logic/rollout-percentage-config-helpers.ts`.
- `RolloutDateConfig` edits a start and an end, each with a date, a percentage and a variant. The percentage sliders keep the start at or below the end: raising the start above the end pulls the end up, and lowering the end below the start pulls the start down. The caller renders the variant selects (`renderSelectField`, required) and, optionally, the date pickers (`renderDatePicker`). The targeting form supplies TanStack Form fields for both.
- The targeting form refuses a distribution that does not total 100. The default-strategy form does not check the sum, and the Overview tab styles the total as an error when it is not 100.

## Tests

Run from `app/`.

- **Unit** (`pnpm run test`):
  - `components/__tests__/feature-flag-card.test.tsx`: the confirmation before switching a flag.
  - `components/__tests__/feature-flag-detail-page-content.test.tsx`: the layout of the evaluation table for large payloads.
  - `components/__tests__/feature-flag-form.test.tsx`: the stepper in create mode, Next disabled until the step is valid, the tabs in edit mode, the blockers tooltip.
  - `hooks/use-feature-flag-form.test.tsx`: create and update submissions, cancel, the type change dialog.
  - `schemas/__tests__/feature-flag.schema.test.ts`, `variants/schemas/__tests__/variant.schema.test.ts`: the form and variant schemas.
  - `rollout/__tests__/`: `RolloutDateConfig` and `RolloutPercentageConfig`.
  - `targeting/` has no unit test.
- **Stories** (`pnpm run storybook`; `pnpm run test:stories` runs them as tests):
  - `components/feature-flag-form/stories/feature-flag-form.stories.tsx`
  - `components/stories/feature-flag-stats-cards.stories.tsx`
  - `variants/components/stories/variant-list.stories.tsx`
  - `targeting/components/stories/targeting-list.stories.tsx`
  - `targeting/components/stories/targeting-form-dialog.stories.tsx`
  - `rollout/stories/rollout-percentage-config.stories.tsx`
- **E2E** (`pnpm run test:e2e:app`), in `app/e2e/app/feature-flags/`:
  - `feature-flags.read.spec.ts`: list, filter, detail tabs. `feature-flags.read.number.spec.ts` and `feature-flags.read.object.spec.ts` read a `number` flag and an `object` flag (the second also evaluates it).
  - `feature-flags.create.spec.ts` and `feature-flags.create.string.spec.ts`: creating a flag.
  - `feature-flags.update.spec.ts`: edit mode, a slug change and a new targeting rule.
  - `feature-flags.toggle.spec.ts`: the switch of a card.
  - `feature-flags.evaluation.spec.ts`: Try it and the recorded sample.
  - `feature-flags.errors.spec.ts`: a server error on creation.
  - The drivers are `app/e2e/app/_support/drivers/feature-flag-*.driver.ts` and `feature-flags-list.driver.ts`. The accessibility and mobile specs also open the list.

## Public API

`app/src/features/feature-flags/index.ts` exports the components and the query helpers that routes use:

- Components: `FeatureFlagsPageContent`, `FeatureFlagForm`, `FeatureFlagConfigurePage`, `FeatureFlagDetailPageContent`, `FeatureFlagDetailOverviewTab`, `FeatureFlagDetailVariantsTab`, `FeatureFlagDetailTargetingTab`, `FeatureFlagDetailEvaluationTab`, `FeatureFlagList` and `FeatureFlagStatsCards`.
- Queries: `featureFlagsQueryOptions`, `featureFlagQueryOptions`, `mergeFeatureFlagIntoCache` and `revalidateFeatureFlagsListQuery`.

Only routes import the barrel, as the feature root is reserved to them. The routes of this feature import it as follows:

```tsx
// app/src/routes/feature-flags/new/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { FeatureFlagForm } from '@/features/feature-flags';

export const Route = createFileRoute('/feature-flags/new/')({
  component: RouteComponent,
});

function RouteComponent() {
  return <FeatureFlagForm />;
}
```

The route files import:

- `index.tsx`: `FeatureFlagsPageContent` and `featureFlagsQueryOptions`.
- `new/index.tsx`: `FeatureFlagForm`.
- `$featureFlagSlug/route.tsx`: `FeatureFlagConfigurePage`, `FeatureFlagDetailPageContent` and `featureFlagQueryOptions`.
- `$featureFlagSlug/variants.tsx`, `targeting.tsx`, `evaluation.tsx` and `index.tsx`: the tab component of the same name.

No route imports `FeatureFlagList`, `FeatureFlagStatsCards`, `mergeFeatureFlagIntoCache` or `revalidateFeatureFlagsListQuery` today.

`variants/`, `targeting/` and `rollout/` each have an `index.ts`, and `app/scripts/architecture-rules.ts` keeps them private to this feature: nothing outside `features/feature-flags` may import them. Inside the feature, imports are relative. See [Import rules](../../../docs/AI_CONTEXT.md#import-rules).

- `variants/index.ts`: `VariantList`, `variantFormSchema`, `mapToFormVariants`, `mapToApiVariants` and the types `Variant`, `VariantFormValues`, `VariantFormState` and `VariantListProps`.
- `targeting/index.ts`: `TargetingList`, `TargetingFormDialog`, the guards `isBasicTargeting`, `isRolloutDateTargeting` and `isRolloutPercentageTargeting`, and the types `Targeting`, `TargetingListProps`, `TargetingFormDialogProps`, `TargetingFormValues` and one form values type per rule type.
- `rollout/index.ts`: `RolloutDateConfig`, `RolloutPercentageConfig` and their prop types.
