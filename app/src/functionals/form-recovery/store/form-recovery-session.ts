import { Store } from '@tanstack/react-store';
import {
  areLineageLocksSupported,
  buildScopeKey,
  isFormRecoveryPersistent,
  liveLineages,
  peekPendingUndo,
  readScope,
  resyncFormRecovery,
  subscribeToFormRecovery,
  takePendingUndo,
} from '@/lib/form-recovery';
import { debounce } from '@/lib/debounce';
import type {
  FormRecoveryAttempt,
  FormRecoveryNote,
  FormRecoveryNotice,
  FormRecoverySendOptions,
  FormRecoverySnapshot,
} from '../types';
import type {
  SessionConfig,
  SessionContext,
  SessionRuntime,
  SessionState,
} from './session-context';
import { adoptPendingUndo, resume } from './session-adopt';
import { keepHere } from './session-observe';
import {
  addNotes,
  clearOmitted,
  dismiss,
  restoreSetAside,
  showOther,
  startOver,
} from './session-offer';
import { applyScope, refresh } from './session-scope';
import {
  beginAttempt,
  completeChain,
  discardOwn,
  restart,
  sendRequest,
} from './session-send';
import {
  ensureHold,
  flushOnUnmount,
  newLineageId,
  releaseHold,
  setWriter,
  trackSnapshot,
  writeNow,
} from './session-writer';

export const WRITE_DEBOUNCE_MS = 1000;

export type FormRecoverySession = {
  store: Store<SessionState>;
  /** Reads the storage and the Web Locks, and listens for changes. */
  start: () => void;
  /** Stops listening and lets go of the lock; `start` may be called again. */
  dispose: () => void;
  actions: {
    track: (
      snapshot: FormRecoverySnapshot,
      immediate: boolean,
      epoch: number,
    ) => void;
    flushOnUnmount: (epoch: number) => void;
    getEpoch: () => number;
    addNotes: (notes: readonly FormRecoveryNote[]) => void;
    clearOmitted: (paths: readonly string[]) => void;
    resume: () => void;
    startOver: () => void;
    showOther: () => void;
    restoreSetAside: () => void;
    keepHere: () => void;
    dismiss: (kind: FormRecoveryNotice['kind'] | 'notes' | 'condensed') => void;
    send: <T>(
      request: () => Promise<T>,
      options?: FormRecoverySendOptions<T>,
    ) => Promise<T>;
    begin: () => FormRecoveryAttempt;
    complete: () => void;
    discard: (options?: { undo?: () => void }) => void;
    restart: () => void;
  };
};

function initialState(
  persistent: boolean,
  lockSupported: boolean,
): SessionState {
  return {
    writer: persistent
      ? { status: lockSupported ? 'reading' : 'idle' }
      : { status: 'disabled' },
    persistent,
    lineageId: newLineageId(),
    generation: 0,
    restored: null,
    notes: [],
    omittedReminder: [],
    offerReady: false,
    candidates: [],
    skipped: [],
    offerMode: 'offering',
    condensedChanges: 0,
    lost: null,
    followUp: null,
    openElsewhere: false,
    unknownOutcome: false,
    followUpPending: false,
    focusToken: 0,
  };
}

function createRuntime(
  config: SessionConfig,
  mountedAt: string,
): SessionRuntime {
  const scope = {
    userId: config.identity?.userId ?? '',
    organizationId: config.identity?.organizationId ?? '',
    formId: config.descriptor.formId,
    context: config.context,
  };

  return {
    alive: false,
    scope,
    scopeKey: buildScopeKey(scope),
    sessionId: crypto.randomUUID(),
    mountedAt,
    epoch: 0,
    ownHold: null,
    snapshot: null,
    lastWritten: null,
    createdAt: null,
    attempt: 0,
    attemptedAt: null,
    ownRecordExpected: false,
    lastSeenAt: null,
    lastTracked: null,
    refreshToken: 0,
    live: new Set(),
    lockSupported: areLineageLocksSupported(),
    warnedQuota: false,
    openElsewhereDismissed: false,
    unsubscribe: null,
  };
}

/**
 * One mount of the recovery of a form: its two machines in one TanStack Store.
 * The write machine says what this mount does with its own lineage; the offer
 * machine, what it proposes of the other ones. Every transition is a named
 * action, and nothing reads the storage during a render.
 *
 * With `enabled: false`, no identity or no usable storage, the session is
 * `disabled`: it reads nothing, writes nothing and passes a send through.
 */
export function createFormRecoverySession(
  config: SessionConfig,
): FormRecoverySession {
  const now = config.now ?? (() => new Date());
  const persistent =
    config.enabled && config.identity !== null && isFormRecoveryPersistent();
  const runtime = createRuntime(config, now().toISOString());
  const store = new Store<SessionState>(
    initialState(persistent, runtime.lockSupported),
  );

  const debounced = debounce(() => writeNow(ctx), WRITE_DEBOUNCE_MS);
  const ctx: SessionContext = {
    config,
    store,
    runtime,
    now,
    setState: (changes) =>
      store.setState((state) => ({ ...state, ...changes })),
    scheduleWrite: () => debounced(),
    cancelWrite: () => debounced.cancel(),
  };

  // The collection is read once here, synchronously, so that the first render
  // already knows whether to offer something. A pure read: StrictMode may run
  // this twice.
  if (persistent) {
    const pendingUndo = peekPendingUndo(runtime.scopeKey);
    if (pendingUndo) {
      adoptPendingUndo(ctx, pendingUndo);
    }
    applyScope(
      ctx,
      readScope(runtime.scope, now()),
      new Set(),
      !runtime.lockSupported,
    );
  }

  const onVisible = () => {
    resyncFormRecovery();
    void refresh(ctx);
    if (runtime.ownRecordExpected) void ensureHold(ctx);
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      debounced.flush();
    } else {
      onVisible();
    }
  };
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) onVisible();
  };
  const onPageHide = () => debounced.flush();

  async function read() {
    const live = await liveLineages();
    if (!runtime.alive) return;
    runtime.live = live;
    applyScope(ctx, readScope(runtime.scope, now()), live, true);

    if (store.state.writer.status === 'reading') {
      setWriter(ctx, { status: 'idle' });
      if (runtime.snapshot?.counts) {
        const { snapshot } = runtime;
        runtime.snapshot = null;
        trackSnapshot(ctx, snapshot, false);
      }
    }
  }

  return {
    store,
    start: () => {
      runtime.alive = true;
      if (!persistent) return;

      takePendingUndo(runtime.scopeKey);
      runtime.unsubscribe = subscribeToFormRecovery(() => void refresh(ctx));
      window.addEventListener('pagehide', onPageHide);
      window.addEventListener('pageshow', onPageShow);
      document.addEventListener('visibilitychange', onVisibilityChange);
      if (runtime.ownRecordExpected) void ensureHold(ctx);
      void read();
    },
    dispose: () => {
      runtime.alive = false;
      debounced.cancel();
      runtime.unsubscribe?.();
      runtime.unsubscribe = null;
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      releaseHold(ctx);
    },
    actions: {
      track: (snapshot, immediate, epoch) => {
        // The adapter of a subtree that was replaced may still report once.
        if (epoch === runtime.epoch) trackSnapshot(ctx, snapshot, immediate);
      },
      flushOnUnmount: (epoch) => flushOnUnmount(ctx, epoch),
      getEpoch: () => runtime.epoch,
      addNotes: (notes) => addNotes(ctx, notes),
      clearOmitted: (paths) => clearOmitted(ctx, paths),
      resume: () => void resume(ctx),
      startOver: () => void startOver(ctx),
      showOther: () => showOther(ctx),
      restoreSetAside: () => void restoreSetAside(ctx),
      keepHere: () => keepHere(ctx),
      dismiss: (kind) => dismiss(ctx, kind),
      send: (request, options) => sendRequest(ctx, request, options),
      begin: () => beginAttempt(ctx),
      complete: () => completeChain(ctx),
      discard: (options) => discardOwn(ctx, options),
      restart: () => restart(ctx),
    },
  };
}
