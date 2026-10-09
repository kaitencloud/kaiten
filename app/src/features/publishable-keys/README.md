# Publishable keys

A publishable key (`pk_…`) lets a web page read the public catalogue of the organization: it sends the key in the `X-Kaiten-Publishable-Key` header to `GET /public/catalog`, and nothing else accepts it. It is not a secret, since it ships in the page, so it is bounded by the browser origins allowed to send it. This feature is the page where those keys are managed, where billing is on: it lists them by their last four characters, issues one and shows it once, changes the label and the origins of a live one, revokes one after a confirmation, and says in a sentence what a key is for and where to switch on what the catalogue lists.

## Routes

| Path | Route file | What it renders |
| --- | --- | --- |
| `/integrations/publishable-keys` | `app/src/routes/integrations/publishable-keys/route.tsx` | The layout: it guards the section, reads the keys and draws `PublishableKeysPageContent` around an `Outlet`. `?includeRevoked=true` lists the revoked keys too |
| `/integrations/publishable-keys` (index) | `app/src/routes/integrations/publishable-keys/index.tsx` | Nothing: the list is the layout's, so that it stays where it was under the dialogs of the routes beside it |
| `/integrations/publishable-keys/new` | `app/src/routes/integrations/publishable-keys/new/index.tsx` | `PublishableKeyFormDialog` that issues a key |
| `/integrations/publishable-keys/$keyId/edit` | `app/src/routes/integrations/publishable-keys/$keyId/edit.tsx` | `PublishableKeyFormDialog` on a live key. A key that is revoked leads back to the list, a key the API does not list is a page that does not exist |

The dialogs follow [dialog via route](../../../docs/03-patterns/dialog-via-route.md): the layout route draws the page, the dialog routes draw only the dialog, closing one navigates back to the list with the search it had (`includeRevoked` stays). The confirmation that revokes a key is local state, as it confirms an action on the key of a page and edits nothing.

The keys are billing's, and the page is gated like the rest of it. `routes/integrations/publishable-keys/route.tsx` calls `requireBillingCapability(context.queryClient)` in its `beforeLoad` and has `BillingNotFound` as its `notFoundComponent`: where billing is off, a link to any of the routes explains why in place of the screen, and nothing of the keys is requested but the capabilities. **The guard asks for no `features.publicSurface` and no `publicSurface.enabled`.** The API fixes both to false whatever the deployment can do (`api/internal/modules/billing/getbillingcapabilities`), although the public catalogue and the keys are shipped, so a gate on them would hide the page everywhere. What a session may do is its scopes. The entry of the Integrations section of the side navigation (`integrationsSubRoutes` in `app/src/routes/-components/side-nav/side-nav.constants.ts`, `needsBilling`) is listed under the same condition, and only to a session whose scopes cover `read:publishable_keys`.

## Structure

```txt
app/src/features/publishable-keys/
├── components/
│   ├── page/            # publishable-keys-page-content (header, intro, list, the route's dialog) and
│   │                    # publishable-keys-intro (what a key is for, and the way to the Public catalogue switches)
│   ├── list/            # publishable-key-list (search, the include-revoked switch, the New button, empty states),
│   │                    # publishable-keys-table, origins-cell (folds past three), the status badge, row actions
│   ├── form/            # publishable-key-form-dialog (issue or change) and publishable-key-fields
│   ├── created/         # created-key-view: the key, once, with Copy; leave-without-key-dialog: the question asked before a key that was not copied is dismissed
│   ├── revoke/          # the confirmation, and the button of a row that opens it
│   ├── __tests__/, stories/
│   └── index.ts
├── hooks/               # use-publishable-key-form (issue or change), use-revoke-publishable-key
├── queries/             # the list under the generated key (with `includeRevoked` in it), ensurePublishableKey
│                        # (one key, for the edit route), and the invalidation
├── schemas/             # the form (label, origins as a text), its bodies, and the search of the URL
├── utils/               # origins (what the API accepts as an origin), the fields of the search
└── index.ts
```

## Data

- `publishableKeysQueryOptions(includeRevoked)` reads `GET /publishable-keys`, a plain array the API answers where the rest of the console reads pages, through `toListPage` (the one place that turns one into the other). It keeps the generated key of the operation, with the query in it, so the list with the revoked keys and the one without are two entries of the cache and `listPublishableKeysQueryKey()` reaches both. It is never retried: a refusal of billing is the screen's to show.
- The API has no read of a single key. `ensurePublishableKey` finds one in a list the cache holds, or in the list with the revoked keys read now; the edit route uses it.
- `usePublishableKeyForm` issues (`createPublishableKeyMutation`) or changes (`updatePublishableKeyMutation`); `useRevokePublishableKey` revokes. After each, `invalidatePublishableKeyQueries` reads the list again. None is optimistic: a refusal must not show as a success.
- Reading the keys needs `read:publishable_keys`; issuing, changing and revoking one needs `write:publishable_keys`. The actions are `publishableKeys.list`, `.create`, `.update` and `.revoke` of `BILLING_ACTIONS` in the [billing domain](../../domains/billing/README.md); their scopes are read from the contract.

## Behaviour

- **The key is shown once.** The answer to the creation carries the plaintext, and `usePublishableKeyForm` hands it to `onCreated` and nowhere else: the dialog keeps it in its own state and turns into the view of the key, with the warning that it will not be shown again, a Copy button (the shared `CopyableValueField`) and the focus on the field. It is not in the address, a key of the cache, the storage of the browser, a toast or a log: the mutation that holds it is dropped as soon as nothing observes it (`gcTime: 0`), and the list shows `…` and the last four characters. Closing the dialog is leaving it for good, so Escape, a click outside or the close button ask first while the key has not been copied (by the button or by hand from the field); the Done button and a dismissal after a copy close at once. A reload of `/new` is an empty form.
- **Origins.** A key holds up to 50 origins, each `https://host[:port]` or `http://localhost[:port]` (the API also takes `127.0.0.1` and `[::1]`), with no path, query or fragment. The field is a text, one origin to a line (a space or a comma separates them as well, for a list pasted from a page of settings). It says in general what an origin is, names the entries it refuses under the field, and cannot be sent until they are mended. A lone trailing slash is refused though the API drops it: an origin has none. A key with no origin is valid: no browser may send it, a server rendering the page still can. An origin typed twice counts once.
- **Label.** One to a hundred characters once trimmed. The form schema reads the label's bounds and the limit on the number of origins from the contract's generated schema and writes only the words of the refusal; `MAX_ORIGINS` is kept for the text and the counter of the field, and a unit test holds it to the contract.
- **A refusal goes where the person is looking.** A 422 about the label or an origin (`*.InvalidLabel`, `*.InvalidOrigin`, `*.TooManyOrigins`) is shown on its field in the API's own words, and the form stays as it was typed; any other is shown above the buttons. A 409 `UpdatePublishableKey.Revoked` says the key can no longer change and to create a new one, and reads the list again, which then shows the key revoked. A missing scope is a banner that names it.
- **A revoked key is final.** It has no action, `/edit` of it leads back to the list, and its revocation is idempotent on the API: revoking one from another tab is a success here too. With the revoked keys left out, a key leaves the list when it is revoked and a toast says so; with them listed, the row reads Revoked.
- **Scopes.** A session that cannot write the keys sees the list with none of New, Edit or Revoke, and the dialogs open nothing from their address. A session whose token says nothing about its scopes is offered every action, and the API's 403 is the answer.
- **What a key is for.** The sentence above the list says that a page reads the public catalogue with the key, and links to the license families and the add-on families (the latter only where the release ships add-ons and the session may read them), whose Public catalogue switches decide what it lists.

## Tests

- Unit and component tests (Vitest): `app/src/features/publishable-keys/utils/__tests__/origins.test.ts`, `schemas/__tests__/publishable-key.schema.test.ts`, and under `components/__tests__/` the list, the form dialog (the key shown once, in no storage, the refusals on their fields) and the revocation. `app/src/routes/-components/side-nav/side-nav-sections.test.tsx` covers the entry of the navigation, `app/src/domains/billing/__tests__/billing-actions.test.ts` the scopes of the actions.
- Stories: `Features/PublishableKeys/Screens` in `components/stories/publishable-key-screens.stories.tsx`.
- E2E (`app/e2e/app/`): `integrations/integrations.publishable-keys.spec.ts` (read, issue, change, revoke), `.access.spec.ts` (the navigation, where billing is not there, who may do what), `.french.spec.ts`, `accessibility/accessibility.publishable-keys.spec.ts` and `mobile/mobile.publishable-keys.spec.ts`, driven by `PublishableKeysDriver`. The mocks are `BillingPublishableKeys` (`e2e/app/_support/model/billing-publishable-keys.ts`), which refuses as the API does, and `src/e2e/msw/billing-publishable-key-handlers.ts`; `dev:mock` seeds live and revoked keys (`src/e2e/msw/dev-world/publishable-keys.ts`).

## Public API

`app/src/features/publishable-keys/index.ts` exports `PublishableKeysPageContent`, `PublishableKeyFormDialog`, `publishableKeysQueryOptions`, `ensurePublishableKey` and `readPublishableKeysSearch`. Only the routes under `app/src/routes/integrations/publishable-keys/` import them (see [Import rules](../../../docs/AI_CONTEXT.md#import-rules)).
