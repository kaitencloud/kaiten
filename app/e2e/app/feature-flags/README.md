# Feature flags E2E pack

The specs in this folder drive the feature flag screens of the console, with the API served by a mock model. [`app/e2e/README.md`](../../README.md) says how the suite runs and which rules every pack follows. This page covers what is specific to feature flags: how the scenarios are organised, what the specs cover and what is left.

## Why the scenarios are split

A feature flag changes shape along three axes, so one generic scenario does not last:

| Axis | Values | What it changes |
| --- | --- | --- |
| Value type (`type`) | `boolean`, `string`, `number`, `object` | The variants form and how values display. |
| Default variant strategy (`default_variant.type`) | `basic`, `rollout_percentage`, `rollout_date` | The default variant form and the detail page. |
| Targeting rule type | `basic`, `rollout_percentage`, `rollout_date` | The targeting form and how a rule displays. |

The screens add three more things that the specs have to walk through:

- **Create** (`/feature-flags/new`) is a four-step stepper: basic information, variants, default variant, targeting rules. The submit button is on the last step.
- **Edit** happens on the detail route. With `?mode=configure` in the URL, the same form shows as tabs (Basic Information, Variants Configuration, Default Variant, Targeting Rules) instead of steps.
- **Try it** is a dialog on the detail page. Its results also appear in the Try it history tab, which lists the evaluations run in the current browser session.

The console has no screen that deletes a feature flag, so the pack has no delete spec.

## Specs

| Spec | What it checks | Scenario | Flag types it shows |
| --- | --- | --- | --- |
| `feature-flags.read.spec.ts` | The list, the search filter, opening a flag, and its Variants, Targeting and Try it history tabs. | `createFeatureFlagsListModel()` | `string`, `boolean` |
| `feature-flags.read.number.spec.ts` | A number flag: its variants (`basic`, `pro`, `enterprise`) and its two basic targeting rules. | `createNumberFeatureFlagModel()` | `number` |
| `feature-flags.read.object.spec.ts` | An object flag: its variants, its targeting rule, and a Try it evaluation that falls back to the default variant. | `createObjectFeatureFlagModel()` | `object` |
| `feature-flags.create.spec.ts` | Opening `/feature-flags/new`, walking the four steps, submitting, and finding the new flag in the list. | `createEmptyFeatureFlagsModel()` | `boolean` (the form default) |
| `feature-flags.create.string.spec.ts` | The same stepper with another name and description. It keeps the form's default type and default variants. | `createEmptyFeatureFlagsModel()` | `boolean` (the form default) |
| `feature-flags.update.spec.ts` | Configure mode: renaming the flag and its slug, adding a basic targeting rule, landing on the new slug, and the list showing the new name. | `createEditableFeatureFlagModel()` | `string` |
| `feature-flags.toggle.spec.ts` | Switching to the list view (`?view=list`), toggling a flag from its card and confirming, the success toast, the tracked `feature_flag_toggled` event and the new state. | `createFeatureFlagsListModel()` | `boolean` |
| `feature-flags.evaluation.spec.ts` | Try it with invalid JSON, then with a context that matches a rule, then the sample in the Try it history tab. | `createEvaluableFeatureFlagModel()` | `string` |
| `feature-flags.errors.spec.ts` | A create that fails with a 500 shows an error toast, keeps the user on `/feature-flags/new` and leaves the list unchanged. | `createEmptyFeatureFlagsModel()` | `boolean` (the form default) |

The scenarios are in `feature-flags.scenarios.ts`. Each factory returns a `FeatureFlagAppModel` (`e2e/app/_support/model/feature-flag-app-model.ts`), and `pnpm run check:e2e-contracts` instantiates all of them.

## How the model answers

- The model validates its seed against the generated Zod schemas, so a seed that no longer matches the API fails at construction.
- `model.setNextError('create' | 'update' | 'delete' | 'evaluate', status)` makes the next call of that kind fail once.
- Try it is answered by `evaluateFlag`, which is a small evaluator and not a CEL engine. A targeting rule is split on `&&`, and it matches when every part does. A part matches when it has one of the forms `context.<key> == "<text>"`, `context.<key> == true`, `context.<key> == false`, `context.<key> == <number>` or `context.<key>.startsWith("<prefix>")`. An empty rule, or an empty part between two `&&`, matches every context. Any other form never matches, so write scenario rules in the forms above.
- `basic`, `rollout_percentage` and `rollout_date` are all evaluated, for targeting rules and for the default variant. No spec exercises the two rollout strategies yet.

## Not covered yet

- Creating a flag of type `string`, `number` or `object`: both create specs keep the default type, `boolean`.
- Try it on a flag whose targeting or default variant uses `rollout_percentage` or `rollout_date`.
- Editing the default variant, and a flag whose default variant is not `basic`.
- Editing variants, and editing, deleting or reordering a targeting rule.

## Writing a spec here

- Keep a spec short and centred on one intention, and name it `feature-flags.<intent>.spec.ts`.
- Keep the knowledge of the DOM in the drivers: `feature-flags-list.driver.ts`, `feature-flag-detail.driver.ts`, `feature-flag-form.driver.ts` and `feature-flag-try-it.driver.ts` in `e2e/app/_support/drivers/`.
- Keep the data in `feature-flags.scenarios.ts`. When a flag differs structurally from the others, which happens for a new type or a new strategy, add a factory named after it, such as `createRolloutDateFeatureFlagModel()`, instead of adding options to an existing one.
- Add each new factory to `scripts/check-e2e-contracts.ts`.
- The targeting rule field opens a CEL editor dialog (Monaco). `FeatureFlagFormDriver.fillBasicTargeting` waits up to 30 seconds for the editor to load and types the rule into it. Reuse the driver instead of driving the editor from a spec.
