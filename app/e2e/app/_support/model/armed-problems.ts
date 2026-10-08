import type { ErrorDetail } from '@/api-client';
import { BillingProblem } from './billing-problem';

/** A refusal a mock is armed to give, once or `times` calls in a row, as a problem document. */
export type ArmedBillingProblem = {
  /** How many calls of the operation go through before the one that fails. */
  after?: number;
  code?: string;
  detail: string;
  errorId?: string;
  errors?: ErrorDetail[];
  /** What `Retry-After` says, when the refusal carries it. */
  retryAfterSeconds?: number;
  status: number;
  /** How many calls in a row it refuses, once its turn has come: one when it is left out. */
  times?: number;
};

/**
 * The refusals a mock holds back for the next call of an operation: a spec arms
 * one with `arm`, and the call that follows (after `after` calls that go
 * through) throws it, once or `times` calls in a row. It is how a spec makes the
 * API refuse with the code and the words the screen has to show.
 */
export class ArmedProblems<Operation extends string> {
  private readonly armed = new Map<Operation, ArmedBillingProblem>();

  static from<Operation extends string>(
    entries: ReadonlyArray<readonly [Operation, ArmedBillingProblem]>,
  ): ArmedProblems<Operation> {
    const problems = new ArmedProblems<Operation>();
    for (const [operation, problem] of entries) {
      problems.armed.set(operation, structuredClone(problem));
    }

    return problems;
  }

  arm(operation: Operation, problem: ArmedBillingProblem) {
    this.armed.set(operation, problem);
  }

  /** Throws the refusal armed for `operation`, once its turn has come. */
  consume(operation: Operation) {
    const problem = this.armed.get(operation);
    if (!problem) {
      return;
    }
    if ((problem.after ?? 0) > 0) {
      this.armed.set(operation, {
        ...problem,
        after: (problem.after ?? 0) - 1,
      });

      return;
    }
    const remaining = (problem.times ?? 1) - 1;
    if (remaining > 0) {
      this.armed.set(operation, { ...problem, times: remaining });
    } else {
      this.armed.delete(operation);
    }
    throw new BillingProblem(problem.status, problem.code, problem.detail, {
      errorId: problem.errorId,
      errors: problem.errors,
      retryAfterSeconds: problem.retryAfterSeconds,
    });
  }

  serialize(): Array<[Operation, ArmedBillingProblem]> {
    return [...this.armed.entries()].map(([operation, problem]) => [
      operation,
      structuredClone(problem),
    ]);
  }
}
