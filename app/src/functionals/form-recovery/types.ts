import type { z } from 'zod';

/** A label: an i18n key, or a text that came from the server (a metadata field). */
export type FormRecoveryLabel = { key: string } | { text: string };

/**
 * A path in the values: a key of the first level, or a path into an object
 * (`licenseDate.to`, `metadata.<key>`).
 */
export type FormRecoveryPath<TValues> =
  | (keyof TValues & string)
  | `${keyof TValues & string}.${string}`;

/** What `reconcile` and the sorting of drifts say about a restored value. */
export type FormRecoveryNote =
  /** `name` is null for what must not be named (a customer). */
  | { kind: 'unavailable'; entity: FormRecoveryLabel; name: string | null }
  | { kind: 'reset'; field: FormRecoveryLabel }
  | { kind: 'itemRemoved'; field: FormRecoveryLabel }
  | { kind: 'sourceChanged'; source: FormRecoveryLabel };

export type FormRecoveryDescriptor<
  TValues extends object,
  TRefs = void,
  TExtra = never,
> = {
  /** Stable id of the creation form, per form component: `<feature>.create`. */
  formId: string;
  /** Raise it when the shape or the meaning of the values changes. */
  version: number;
  /** Entries of a lower version are dropped, and the person is told. */
  incompatibleBelow?: number;
  /** Paths never written: secrets, codes entered once, files. Required. */
  omit: readonly FormRecoveryPath<TValues>[];
  /** An omission decided by the value or the references (a `writeOnly` field). */
  omitWhen?: (
    path: readonly string[],
    value: unknown,
    references: Partial<TRefs>,
  ) => boolean;
  /** Paths that do not make an input worth keeping: technical keys (`grants[].key`). */
  ignore?: readonly string[];
  /** Ids of the steps, in order. Absent for a single page. */
  steps?: readonly string[];
  /** The first-level fields of each step: sets the step a restore lands on. */
  stepFields?: Readonly<Record<string, readonly (keyof TValues & string)[]>>;
  /** Schema of the form, derived from the generated one: shape and drifts. */
  schema?: z.ZodType<TValues>;
  /** Labels of the first-level fields, for the notes. */
  fieldLabels?: Partial<Record<keyof TValues & string, FormRecoveryLabel>>;
  /** Schema of the state outside the form (`extra`) when read back. */
  extraSchema?: z.ZodType<TExtra>;
  /** Fingerprint of what `extra` was copied from; if it moved, `extra` is dropped. */
  extraSource?: (references: Partial<TRefs>) => string | null;
  /** Names that source in a note: "The base license". */
  extraSourceLabel?: FormRecoveryLabel;
  /** How long an entry is kept; 7 days by default. */
  retentionDays?: number;
  /** Pure. Gets the lists loaded so far; replayed as each other list arrives. */
  reconcile?: (
    values: TValues,
    references: Partial<TRefs>,
  ) => { values: TValues; notes: FormRecoveryNote[] };
  /** Pure. Names of catalog objects to keep with their ids; never a customer. */
  labels?: (
    values: TValues,
    references: Partial<TRefs>,
  ) => Record<string, string>;
  /** The feature's own texts for a chain left unfinished. */
  followUpMessageKeys?: { pending: string; later: string };
};

export type CreatedRef = { id: string; label?: string };

export type FormRecoveryWriterState =
  | { status: 'reading' }
  | { status: 'disabled' }
  | { status: 'idle' }
  | { status: 'dirty' }
  | { status: 'saved' }
  | { status: 'submitting' }
  | { status: 'submitted' }
  | { status: 'discarded' }
  | { status: 'sentElsewhere' }
  | {
      status: 'paused';
      reason: 'otherTab' | 'discarded' | 'unknown' | 'quota';
    };

export type FormRecoveryOffer =
  | {
      kind: 'resumable';
      savedAt: string;
      stepIndex?: number;
      stepCount?: number;
      omittedFilled: string[];
      formChanged: boolean;
      others: number;
    }
  | {
      kind: 'uncertain';
      attemptedAt: string;
      savedAt: string;
      omittedFilled: string[];
      others: number;
    }
  | { kind: 'condensed'; savedAt: string };

export type FormRecoveryNotice =
  | { kind: 'openElsewhere' }
  | { kind: 'notKept'; reason: 'otherTab' | 'discarded' | 'unknown' }
  | { kind: 'sentElsewhere' }
  | { kind: 'unknownOutcome' }
  | { kind: 'followUpPending' }
  | { kind: 'followUp'; created: CreatedRef }
  | { kind: 'lost'; savedAt: string }
  | { kind: 'omitted'; paths: string[] };

export type FormRecoveryRestored<TValues, TExtra> = {
  /** Initial values, the patch on top, omitted paths back to initial, drifts reset. */
  values: TValues;
  stepIndex: number;
  furthestIndex: number;
  /** Absent when it was not modified, or when it could not be read back. */
  extra?: TExtra;
  /** The fingerprint `extra` was stored with; the adapter checks it against today's. */
  extraSource?: string | null;
};

export type FormRecoveryAttempt = {
  /** Resolves once the tombstone is written; never rejects. */
  accepted: (
    created?: CreatedRef,
    options?: { followUp?: boolean },
  ) => Promise<void>;
  failed: (error: unknown) => void;
};

export type FormRecoverySendOptions<T> = {
  created?: (result: T) => CreatedRef;
  /** A next request must still succeed: call `complete()` after it. */
  followUp?: boolean;
};

export type FormRecovery<TValues, TExtra = never> = {
  writer: FormRecoveryWriterState;
  /** False when the storage is unavailable, or on an edit form. */
  persistent: boolean;
  offer: FormRecoveryOffer | null;
  notices: FormRecoveryNotice[];
  notes: FormRecoveryNote[];
  /** Give it as `key` to the subtree of the form: it changes when entries are restored. */
  sessionKey: string;
  /** The initial values, frozen at mount: the form takes them as defaults. */
  pristine: TValues;
  /** What the subtree must start from; null for a blank form. */
  restored: FormRecoveryRestored<TValues, TExtra> | null;
  /**
   * For the `initialFocus` of a dialog that has an offer: the "Resume" button,
   * or the default focus if it is not there yet. A function, not a ref object,
   * so that `recovery` does not read as holding a ref during a render.
   */
  focusOffer: () => HTMLElement | boolean;

  /** Adopts the entries on offer: the subtree is mounted again. */
  resume: () => void;
  /** Discards the entries on offer, and begins new ones. */
  startOver: () => void;
  showOther: () => void;
  /** "Bring them back" from the condensed offer. */
  restoreSetAside: () => void;
  keepHere: () => void;
  dismiss: (kind: FormRecoveryNotice['kind'] | 'notes' | 'condensed') => void;

  /**
   * The one road to "sent". Rejects what `request` rejects, so the form keeps
   * its own try/catch. A pass-through when the recovery is off.
   */
  send: <T>(
    request: () => Promise<T>,
    options?: FormRecoverySendOptions<T>,
  ) => Promise<T>;
  /** For a send made of several requests whose first irreversible one is buried. */
  begin: () => FormRecoveryAttempt;
  /** The next request of a chain succeeded. */
  complete: () => void;
  /** A deliberate abandon; with `undo`, a toast brings the entries back. */
  discard: (options?: { undo?: () => void }) => void;
  /** "Create another" after a success: a new lineage. */
  restart: () => void;

  /** What the adapter needs of the session; not for the features. */
  internals: FormRecoveryInternals;
};

export type FormRecoveryInternals = {
  descriptor: FormRecoveryDescriptor<any, any, any>;
  /** The steps of the form now, in order; empty for a single page. */
  steps: readonly string[];
  /** Raised each time the subtree is replaced: tells a stale adapter from the live one. */
  epoch: () => number;
  /** Raised when the focus must move to the form. */
  focusToken: number;
  /** `epoch` is the one the adapter was mounted with: a stale one is ignored. */
  track: (
    snapshot: FormRecoverySnapshot,
    immediate: boolean,
    epoch: number,
  ) => void;
  flushOnUnmount: (epoch: number) => void;
  addNotes: (notes: readonly FormRecoveryNote[]) => void;
  /** Removes these paths from the reminder of the never-kept fields. */
  clearOmitted: (paths: readonly string[]) => void;
};

/**
 * What the form hands the session on every change worth looking at: computed
 * by the adapter from the values, so that the session never sees the form.
 */
export type FormRecoverySnapshot = {
  /** The values differ from the reference: there is something to keep. */
  counts: boolean;
  /** The patch against the initial values, encoded. */
  payload: string;
  omittedFilled: string[];
  labels: Record<string, string>;
  extra: string | null;
  extraSource: string | null;
  stepId: string | null;
  furthestStepId: string | null;
  stepIds: string[] | null;
};
