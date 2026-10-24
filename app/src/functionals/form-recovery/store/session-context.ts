import type { Store } from '@tanstack/react-store';
import type { FormRecoveryEntry, FormRecoveryScope } from '@/lib/form-recovery';
import type { SessionIdentity } from '@/lib/session-identity';
import type {
  CreatedRef,
  FormRecoverySnapshot,
  FormRecoveryDescriptor,
  FormRecoveryNote,
  FormRecoveryRestored,
  FormRecoveryWriterState,
} from '../types';

export type OfferMode = 'offering' | 'condensed' | 'hidden';

/** What a toast of the session offers to undo. */
export type SessionToast = 'discarded' | 'cancelled' | 'replaced';

/** The state the hooks read; everything else lives in {@link SessionRuntime}. */
export type SessionState = {
  /** What this mount does with its own lineage. */
  writer: FormRecoveryWriterState;
  persistent: boolean;
  lineageId: string;
  /** Changes when the subtree of the form must be mounted again. */
  generation: number;
  restored: FormRecoveryRestored<any, any> | null;
  notes: FormRecoveryNote[];
  /** Omitted paths the person had filled in, until they fill them again. */
  omittedReminder: string[];
  /** The Web Locks are known: no entry held by another tab is on offer. */
  offerReady: boolean;
  /** The entries of the scope other than this lineage, newest first. */
  candidates: FormRecoveryEntry[];
  skipped: string[];
  offerMode: OfferMode;
  condensedChanges: number;
  lost: { savedAt: string } | null;
  followUp: { created: CreatedRef; key: string } | null;
  openElsewhere: boolean;
  unknownOutcome: boolean;
  followUpPending: boolean;
  /** Raised when the focus must move to the form (after "Resume"). */
  focusToken: number;
};

export type SessionConfig = {
  descriptor: FormRecoveryDescriptor<any, any, any>;
  enabled: boolean;
  identity: SessionIdentity | null;
  context: string;
  pristine: object;
  /** The steps of the form now, in order; empty for a single page. */
  steps: readonly string[];
  /** Shows a toast that offers to undo a deliberate discard. */
  notify: (kind: SessionToast, undo?: () => void) => void;
  now?: () => Date;
};

/** The part of a mount that no component reads: plain fields, not state. */
export type SessionRuntime = {
  alive: boolean;
  scope: FormRecoveryScope;
  scopeKey: string;
  sessionId: string;
  mountedAt: string;
  /** Raised each time the subtree of the form is replaced. */
  epoch: number;
  ownHold: { release: () => void } | null;
  /** The attempt to take the lock of this lineage that is under way. */
  holding: Promise<void> | null;
  snapshot: FormRecoverySnapshot | null;
  /** What was last written for this lineage, to skip a write that changes nothing. */
  lastWritten: string | null;
  createdAt: string | null;
  attempt: number;
  attemptedAt: string | null;
  /** The record of this lineage is in the storage: its absence means something. */
  ownRecordExpected: boolean;
  lastSeenAt: number | null;
  lastTracked: string | null;
  refreshToken: number;
  /** The lineages some tab holds, as of the last look. */
  live: ReadonlySet<string>;
  lockSupported: boolean;
  warnedQuota: boolean;
  openElsewhereDismissed: boolean;
  unsubscribe: (() => void) | null;
  /**
   * The entry an "Undo" brought back, restored at creation without a write:
   * `start` writes it, once the mount is committed.
   */
  pendingAdoption: FormRecoveryEntry | null;
  /** `send` or `begin` was called for this input: a submit went through the recovery. */
  sendStarted: boolean;
};

export type SessionContext = {
  config: SessionConfig;
  store: Store<SessionState>;
  runtime: SessionRuntime;
  now: () => Date;
  setState: (changes: Partial<SessionState>) => void;
  /** Debounced write of the snapshot, 1 s after the last change. */
  scheduleWrite: () => void;
  cancelWrite: () => void;
};
