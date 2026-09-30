# `components/dialog`

Dialog shells built on the `Dialog` and `AlertDialog` primitives of
`components/ui`. They hold no business vocabulary.

| Component | Use |
| --- | --- |
| `FormDialog` | A shell for a form in a dialog: fixed header and footer, scrolling content. |
| `DeleteConfirmationDialog` | A confirmation dialog around any trigger you pass in. |
| `DialogFormSkeleton`, `DialogFormSkeletonCard` | Placeholders shown while a dialog form loads. |

Import `FormDialog` and `DeleteConfirmationDialog` from `@/components/dialog`. The
skeletons are not in the barrel: import them from
`@/components/dialog/dialog-form-skeleton`.

## `FormDialog`

`FormDialog` is a compound component: a root and named parts.

| Part | Renders |
| --- | --- |
| `FormDialog` | A controlled `Dialog` and its `DialogContent`. It takes `open`, `onOpenChange`, `children`, `className` and `onInteractOutside`. |
| `FormDialog.Header` | `DialogHeader`, which does not shrink. |
| `FormDialog.Title`, `FormDialog.Description` | `DialogTitle` and `DialogDescription`. |
| `FormDialog.Content` | The scrolling body. Its optional `loadingFields` (default `3`) sizes the `DialogFormSkeleton` that shows while a lazy child suspends. |
| `FormDialog.Footer` | `DialogFooter`, which does not shrink. |

The panel is at most `90vh` high and `sm:max-w-lg` wide. `className` is merged
over those classes, so `className="sm:max-w-5xl"` widens it. `onInteractOutside`
goes to `DialogContent`: `TargetingFormDialog` calls `preventDefault()` in it so
that a click outside does not close the dialog.

```tsx
// app/src/features/webhooks/components/webhook-list/create-webhook-dialog.tsx (abridged)
<FormDialog open={open} onOpenChange={handleDialogOpenChange}>
  <FormDialog.Header>
    <FormDialog.Title>
      {t('Pages.Integrations.Webhooks.Dialog.title')}
    </FormDialog.Title>
    <FormDialog.Description>
      {t('Pages.Integrations.Webhooks.Dialog.description')}
    </FormDialog.Description>
  </FormDialog.Header>

  <FormDialog.Content>
    <form id={formId} onSubmit={handleFormSubmit}>
      {/* fields */}
    </form>
  </FormDialog.Content>

  <FormDialog.Footer>
    <Button type="button" variant="outline" onClick={handleClose}>
      {t('Common.cancel')}
    </Button>
    <Button type="submit" form={formId} disabled={disabled}>
      {t('Pages.Integrations.Webhooks.Dialog.createButton')}
    </Button>
  </FormDialog.Footer>
</FormDialog>
```

The footer is outside the `<form>`, so the submit button names the form with
`form={formId}`. Other users are `TargetingFormDialog`
(`app/src/features/feature-flags/targeting/components/targeting-form-dialog.tsx`)
and `attio-mapping-editor-dialog.tsx` in `app/src/features/connectors/attio/components/`.

### When not to use it

- The create and edit dialogs of the entities (customers, instances,
  entitlements, deployment zones, components) use `StackedFormDialog`, a
  functional in `app/src/functionals/stacked-form-dialog/`, and open from a
  route. See [dialog via route](../../../docs/03-patterns/dialog-via-route.md#the-dialog-shell).
- A dialog with its own anatomy uses the `Dialog` primitives directly, with
  `DialogContent variant="form"` for the delimited header and footer bands and a
  body that scrolls on its own. `app/src/features/service-accounts/components/create-dialog.tsx`
  does.

## `DeleteConfirmationDialog`

It renders an `AlertDialog` with a trash icon, a title, a description and two
buttons. The caller supplies the trigger and every text, already translated.
Cancel and confirm both close the dialog, and confirm calls `onConfirm`.

| Prop | Type | Role |
| --- | --- | --- |
| `trigger` | `ReactNode` | The element that opens the dialog. It is wrapped in `AlertDialogTrigger asChild`. |
| `title` | `string` | The dialog title. |
| `description` | `ReactNode` | The body. Long unbroken text, such as a URL, wraps. |
| `cancelLabel`, `confirmLabel` | `string` | The button labels. |
| `onConfirm` | `() => void` | Called when the user confirms. |
| `confirmDisabled` | `boolean` | Disables the confirm button, for example while a precondition is being checked. The description says why. |
| `onOpenChange` | `(open: boolean) => void` | Called when the dialog opens or closes. |

```tsx
// app/src/features/service-accounts/components/token-list/token-list-item.tsx (abridged)
<DeleteConfirmationDialog
  trigger={
    <Button variant="outline" size="sm">
      <XCircle className="size-3" />
      {t('Pages.Integrations.ServiceAccounts.Token.revoke')}
    </Button>
  }
  title={t('Pages.Integrations.ServiceAccounts.Token.revokeConfirmTitle')}
  description={t(
    'Pages.Integrations.ServiceAccounts.Token.revokeConfirmDescription',
    { name: tokenName },
  )}
  cancelLabel={t('Common.cancel')}
  confirmLabel={t('Pages.Integrations.ServiceAccounts.Token.revoke')}
  onConfirm={onRevoke}
/>
```

`TableDeleteDialog` (the delete action of the tables) and `DestructiveActionButton`
are built on it.

## `DialogFormSkeleton`

`DialogFormSkeleton` is a stack of field-shaped placeholders, one label and one
input each. Its `fields` prop (default `3`) should match the form about to
appear. It renders an `<output>` with `aria-live="polite"` and `aria-busy`, and a
screen-reader-only `Common.loading` text. `DialogFormSkeletonCard` wraps it in a
card with a title (`title`, or a skeleton bar when it is absent) for the stage of a
stacked form. `FormDialog.Content` and `StackedFormDialog` use them as their
`Suspense` fallback.

## Storybook

Run `pnpm run storybook` from `app/`. The stories are in `stories/` and sit under
**Components > Dialog**: `FormDialog`, `DeleteConfirmationDialog` and
`DialogFormSkeleton`. `delete-confirmation-dialog.test.tsx` is the unit test.
