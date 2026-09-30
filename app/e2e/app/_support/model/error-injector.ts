/**
 * One-shot error injector for stateful test models.
 *
 * Lets a test arm a specific operation (e.g. "create", "update", "delete") to
 * fail with a given HTTP status on its *next* invocation. The error is
 * consumed after one call.
 *
 * @example
 *   const errors = new ErrorInjector<'create' | 'update'>();
 *   errors.setNextError('create', 500);
 *   errors.consume('create'); // throws { httpStatus: 500 } once
 *   errors.consume('create'); // returns false → no error
 */
export class ErrorInjector<TOp extends string = string> {
  private pending = new Map<TOp, number>();

  /**
   * Arm the next call to `op` to fail with the given HTTP status.
   * One-shot: cleared after the next `consume(op)`.
   */
  setNextError(op: TOp, status: number): void {
    this.pending.set(op, status);
  }

  /**
   * Throw an error with `httpStatus` if the operation was armed.
   * Clears the armed status. No-op when nothing is pending.
   */
  consume(op: TOp): void {
    const status = this.pending.get(op);

    if (status == null) {
      return;
    }

    this.pending.delete(op);
    throw Object.assign(new Error(`Server error ${status}`), {
      httpStatus: status,
    });
  }

  snapshot(): Array<[TOp, number]> {
    return Array.from(this.pending.entries());
  }

  restore(entries: Array<readonly [TOp, number]>): void {
    this.pending = new Map(entries);
  }
}
