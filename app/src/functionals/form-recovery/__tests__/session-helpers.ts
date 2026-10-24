import { vi } from 'vite-plus/test';
import { encodePayload, type FormRecoveryEntry } from '@/lib/form-recovery';
import { defineFormRecovery } from '../define-form-recovery';
import {
  createFormRecoverySession,
  type FormRecoverySession,
} from '../store/form-recovery-session';
import type { SessionConfig } from '../store/session-context';
import type { FormRecoverySnapshot } from '../types';

export type ThingValues = {
  name: string;
  count: number;
  note: string;
  secret: string;
};

export const pristine = (): ThingValues => ({
  name: '',
  count: Number.NaN,
  note: '',
  secret: '',
});

export const thingRecovery = defineFormRecovery<ThingValues>({
  formId: 'things.create',
  version: 1,
  omit: ['secret'],
  steps: ['identity', 'details'],
  stepFields: { identity: ['name'], details: ['count', 'note'] },
  fieldLabels: {
    name: { text: 'Name' },
    count: { text: 'Count' },
    note: { text: 'Note' },
    secret: { text: 'Secret' },
  },
});

export const IDENTITY = { userId: 'user_1', organizationId: 'org_1' };

export function snapshotOf(
  patch: [string, unknown][],
  overrides: Partial<FormRecoverySnapshot> = {},
): FormRecoverySnapshot {
  return {
    counts: patch.length > 0,
    payload: encodePayload(patch),
    omittedFilled: [],
    labels: {},
    extra: null,
    extraSource: null,
    stepId: 'identity',
    furthestStepId: 'identity',
    stepIds: ['identity', 'details'],
    ...overrides,
  };
}

export type Harness = {
  session: FormRecoverySession;
  notify: ReturnType<typeof vi.fn>;
  state: () => FormRecoverySession['store']['state'];
  dispose: () => void;
};

/** A session as a render creates it: not started, nothing committed yet. */
export function createSession(overrides: Partial<SessionConfig> = {}) {
  const notify = vi.fn();
  const session = createFormRecoverySession({
    descriptor: thingRecovery,
    enabled: true,
    identity: IDENTITY,
    context: '',
    pristine: pristine(),
    steps: ['identity', 'details'],
    notify,
    ...overrides,
  });
  return { session, notify };
}

export function mountSession(overrides: Partial<SessionConfig> = {}): Harness {
  const { session, notify } = createSession(overrides);
  session.start();

  return {
    session,
    notify,
    state: () => session.store.state,
    dispose: () => session.dispose(),
  };
}

export function otherTabEvent(): void {
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: 'kaiten:form-recovery',
      storageArea: window.localStorage,
    }),
  );
}

export function storedRecords(): Record<string, Record<string, any>> {
  const raw = window.localStorage.getItem('kaiten:form-recovery');
  const blob = raw ? (JSON.parse(raw) as Record<string, { data: object }>) : {};
  return Object.fromEntries(
    Object.values(blob).map(({ data }) => [
      (data as { lineageId: string }).lineageId,
      data as Record<string, any>,
    ]),
  );
}

export function seedEntry(entry: FormRecoveryEntry): void {
  const raw = window.localStorage.getItem('kaiten:form-recovery');
  const blob = raw ? JSON.parse(raw) : {};
  blob[`s:${entry.key}`] = { versionKey: crypto.randomUUID(), data: entry };
  window.localStorage.setItem('kaiten:form-recovery', JSON.stringify(blob));
}

/** Lets the microtasks of a session settle. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** What the adapter does on a change of the form. */
export function track(
  harness: Harness,
  snapshot: FormRecoverySnapshot,
  immediate = false,
): void {
  harness.session.actions.track(
    snapshot,
    immediate,
    harness.session.actions.getEpoch(),
  );
}
