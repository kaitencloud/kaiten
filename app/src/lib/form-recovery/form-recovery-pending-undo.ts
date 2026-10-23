const pending = new Map<string, string>();

/**
 * "Undo" after a cancelled form brings the person back to the form, and the
 * form must then restore the entries without offering them. The intention
 * outlives the form that was cancelled: it is kept by scope, and the next form
 * of that scope takes it at mount.
 */
export function setPendingUndo(scopeKey: string, lineageId: string): void {
  pending.set(scopeKey, lineageId);
}

/** Takes the lineage a scope is to restore directly, once. */
export function takePendingUndo(scopeKey: string): string | null {
  const lineageId = pending.get(scopeKey) ?? null;
  pending.delete(scopeKey);
  return lineageId;
}

export function resetPendingUndo(): void {
  pending.clear();
}
