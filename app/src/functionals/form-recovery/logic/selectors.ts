import type { FormRecoveryNotice, FormRecoveryOffer } from '../types';
import { resolveArrival } from './arrival';
import type { FormRecoveryEntry } from '@/lib/form-recovery';
import type { SessionState } from '../store/session-context';

/** The entry on offer: the first one the person has not skipped. */
export function currentCandidate(
  state: Pick<SessionState, 'candidates' | 'skipped'>,
): FormRecoveryEntry | null {
  return (
    state.candidates.find((entry) => !state.skipped.includes(entry.key)) ??
    state.candidates[0] ??
    null
  );
}

/** Whether a send went out on this entry without a verdict. */
export function isUncertain(entry: FormRecoveryEntry): boolean {
  return entry.status === 'submitting' || entry.attemptedAt !== null;
}

export function selectOffer(
  state: SessionState,
  info: {
    version: number;
    steps: readonly string[];
    stepFields?: Readonly<Record<string, readonly string[]>>;
  },
): FormRecoveryOffer | null {
  const candidate = currentCandidate(state);
  if (
    !state.offerReady ||
    state.offerMode === 'hidden' ||
    !candidate ||
    state.writer.status === 'disabled'
  ) {
    return null;
  }

  if (state.offerMode === 'condensed') {
    return { kind: 'condensed', savedAt: candidate.updatedAt };
  }

  const others = state.candidates.length - 1;
  if (isUncertain(candidate)) {
    return {
      kind: 'uncertain',
      attemptedAt: candidate.attemptedAt ?? candidate.updatedAt,
      savedAt: candidate.updatedAt,
      omittedFilled: candidate.omittedFilled,
      others,
    };
  }

  const offer: FormRecoveryOffer = {
    kind: 'resumable',
    savedAt: candidate.updatedAt,
    omittedFilled: candidate.omittedFilled,
    formChanged: candidate.formVersion !== info.version,
    others,
  };
  if (info.steps.length > 0) {
    const arrival = resolveArrival({
      steps: info.steps,
      stored: {
        stepId: candidate.stepId,
        furthestStepId: candidate.furthestStepId,
        stepIds: candidate.stepIds,
      },
      stepFields: info.stepFields,
      problemKeys: [],
      omittedFilled: [],
    });
    offer.stepIndex = arrival.stepIndex;
    offer.stepCount = info.steps.length;
  }
  return offer;
}

export function selectNotices(state: SessionState): FormRecoveryNotice[] {
  if (state.writer.status === 'disabled') return [];

  const notices: FormRecoveryNotice[] = [];
  const { writer } = state;

  if (state.lost) notices.push({ kind: 'lost', savedAt: state.lost.savedAt });
  if (state.followUp) {
    notices.push({ kind: 'followUp', created: state.followUp.created });
  }
  if (writer.status === 'sentElsewhere')
    notices.push({ kind: 'sentElsewhere' });
  if (writer.status === 'paused' && writer.reason !== 'quota') {
    notices.push({ kind: 'notKept', reason: writer.reason });
  }
  if (state.openElsewhere) notices.push({ kind: 'openElsewhere' });
  if (state.unknownOutcome) notices.push({ kind: 'unknownOutcome' });
  if (state.followUpPending) notices.push({ kind: 'followUpPending' });
  if (state.omittedReminder.length > 0) {
    notices.push({ kind: 'omitted', paths: state.omittedReminder });
  }
  return notices;
}
