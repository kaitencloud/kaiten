# form-recovery

Offers back what a person typed in a **creation** form and did not send. After a
crash, a reload, an expired session, a deploy or a closed tab, the next visit to
the same form shows an `Alert` with **Resume** and **Start over**. Nothing is
restored without that click.

The console calls it an **unsent input** ("saisie" in French) and never a draft:
a draft is a server object in the `DRAFT` state. The code says `formRecovery`
for the same reason. How a form adopts it is in
[forms.md](../../../docs/03-patterns/forms.md#recovering-an-unsent-creation-form);
where it sits among the state tools, in
[state-management.md](../../../docs/03-patterns/state-management.md#recoverable-input-of-a-creation-form).

## Why a functional with one consumer

`docs/AI_CONTEXT.md` asks a functional for two independent consumers, and
allows that "a deliberately generic primitive may be shared earlier". This one
carries no Kaiten vocabulary and no API client, and it ships before its
consumers, which are known:

| Order | Form                                                                                      |
| ----- | ----------------------------------------------------------------------------------------- |
| 1     | entitlement (`/catalog/entitlements/new`), the pilot                                      |
| 2     | voucher wizard (`/catalog/vouchers/new`)                                                  |
| 3     | feature flag, instance (stacked dialog), release (after its non-atomic creation is fixed) |
| 4     | license, license version                                                                  |

The entitlement is the first to adopt it
(`features/entitlements/components/form/entitlement-create-page.tsx`, declared
in `entitlement-recovery.ts`); the others follow in the order above. The stories
and the tests of the module drive it through `stories/recovery-demo-form.tsx`.

## Layers

- `app/src/lib/form-recovery/` is the storage, with no React: a TanStack DB
  `localStorageCollectionOptions` collection under `kaiten:form-recovery`, **one
  record per unsent input** (a _lineage_), of three kinds: an `entry`, a
  `tombstone` (sent, discarded, evicted) and a `userMark` (explicit sign-out).
  Web Locks tell a tab that works on a lineage from one that crashed.
- `app/src/lib/session-identity.ts` reads the signed-in user and organization
  synchronously.
- This folder is the generic part: `defineFormRecovery`, the door
  `useFormRecovery`, the adapter `useFormRecoveryForm`, and four components.

```
logic/        pure: patch, restore (shape, drifts), arrival step, outcome of a send
store/        the session: two machines in one TanStack Store, named actions
hooks/        use-form-recovery (the door), use-form-recovery-form (the adapter)
components/   FormRecoveryAlert, FormRecoveryNotes, FormRecoverySubmitWarning,
              FormRecoveryAnnouncer
```

## API

```ts
const recovery = defineFormRecovery<Values, Refs, Extra>({
  formId: 'entitlements.create',
  version: 1,
  omit: [],                 // required; paths never stored
  steps: ['identity', 'type'],
  stepFields: { identity: ['name', 'slug'], type: ['type'] },
  schema: entitlementFormSchema,
  fieldLabels: { name: { key: '...' }, slug: { key: '...' }, type: { key: '...' } }, // every field
});

// outside the subtree of the form
const r = useFormRecovery(recovery, { enabled: !entity, pristine, context });
<FormRecoveryAnnouncer recovery={r} stepLabels={labels} />
<Wizard key={r.sessionKey} recovery={r} />

// inside it
const { focusRef } = useFormRecoveryForm(r, form, { stepIndex, furthestIndex, references, ready });
const saved = await r.send(() => mutation.mutateAsync({ body }), { created });
```

`recovery.discard({ undo })` is for a deliberate abandon (the "Cancel" of a
page): a toast offers **Undo**, which brings back the entries and calls `undo()`.
What was typed within the write debounce is written first, so that a cancel right after
typing still has something to bring back.
`restart()` begins a new input after a success. `begin()` / `complete()` serve a
send made of several requests.

`focusOffer` is for the `initialFocus` of a dialog: it returns the Resume button
(marked `data-form-recovery-resume`), or `true` for the default focus.

## What it guarantees

1. An input is offered only to the same user, in the same organization, on the
   same form and in the same context.
2. A **sent** input is never offered again, from any tab and in any state. An
   input whose send got no answer is offered with a warning that it may have
   gone through, never as a plain resume.
3. Nothing is restored, replaced or erased without the person seeing or asking.
4. No secret reaches the storage: `omit` is required and typed, `omitWhen`
   decides from the data. No customer name either: `labels` keeps catalog names.
5. A blocked, full or absent storage leaves the form exactly as it is: no
   offer, no message.
6. An edit form (`enabled: false`) reads and writes nothing and does not create
   the collection.
7. An input another tab holds is not offered in this one.

## Edge cases it handles

| Case                                            | What happens                                                                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Quota exceeded                                  | Makes room (expired, then the oldest entry no tab holds, as a tombstone) and tries once more; else drops the lineage and pauses, with one `logger.warn`                                          |
| Quota exceeded at an accepted send              | Evicts and retries the tombstone; else removes the entry; if even that fails, the entry stays and is offered with the "may have gone through" warning, never as a plain resume |
| Corrupt blob, invalid or foreign-version record | Read as empty or removed silently; the next write repairs the key                                                                                                                                |
| Two tabs                                        | One lineage and one lock each: two creations never pause one another. A tab that does not hold the lineage it sees sent, discarded or vanished says why, and **Keep them here** begins a new one |
| Sign-out                                        | `SignedOutGate` purges everything and leaves a mark; a tab still open writes nothing once the mark exists. An expired session purges nothing and flushes its last input                                                    |
| Expiry                                          | 7 days from the last write (`retentionDays`); read as absent and removed                                                                                                                         |
| Tombstone                                       | Written whatever the state of the tab, even after the page was unmounted, before `send` returns                                                                                                  |
| Untrusted storage                               | What is read back is cleaned: a path through `__proto__`, `constructor` or `prototype` is dropped, and an omitted path is stripped even inside a value taken whole (an object over a `null` initial value, an array row). `omit` may go through an array with `[]` (`grants[].token`) |
| Cleared form                                    | Back to the initial values removes the record                                                                                                                                                    |
| Version                                         | Another `version` is offered with a warning; below `incompatibleBelow` it is dropped and the person told                                                                                         |
| Steps                                           | Restores the stored step by id, or an earlier one holding a field to correct or a never-kept field that was filled                                                                               |
| StrictMode                                      | A mount may start, stop and start again; a late report of a replaced subtree is ignored                                                                                                          |

## What is not proven yet

The sign-out purge relies on one ordering of Clerk's: on an explicit sign-out it
navigates to `afterSignOutUrl` (`/signed-out`, `SIGNED_OUT_PATH`) before it
renders the signed-out state, so that `SignedOutGate` finds that URL and purges.
The unit tests cover each side of it: `ClerkProvider` passes `SIGNED_OUT_PATH`,
`ClerkGate` draws the gate for a signed-out session, the gate purges when it
finds the path, and the startup prune removes what another user left. None of
them runs Clerk, so the ordering itself, and the two-tab case (a tab left open
across a sign-out writes nothing once the mark exists), are **unverified** until
an end-to-end test runs on the authenticated stack, which needs a Clerk
development instance.

## Tests and stories

Unit tests are in `__tests__/` and `app/src/lib/form-recovery/__tests__/`; the
stories (`stories/form-recovery.stories.tsx`) run in the Storybook test project
with the axe check.
