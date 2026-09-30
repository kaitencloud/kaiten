import type { CelIssue } from '../types/cel-context.types';

/**
 * The two things that can object to a rule, kept apart so neither erases the
 * other's marks. Monaco keys markers by owner, so the local syntax check can
 * clear its own the moment a rule parses without touching a verdict that came
 * from the server.
 */
export const SYNTAX_MARKER_OWNER = 'cel-syntax';
export const LINT_MARKER_OWNER = 'cel-lint';

/**
 * The local engine reports an undeclared reference for any name it was not
 * given, and it is given none — so every host attribute a rule legitimately
 * targets on (`user.cohort`, `device.os`) comes back as one.
 *
 * Discarding those is what leaves the local engine doing the one job it can do
 * correctly offline: telling the author the rule does not parse. Whether a name
 * exists is a question only the server can answer, because only the server
 * knows the organization's entitlements and that the world is open.
 */
const UNDECLARED_REFERENCE = /^Undeclared reference/i;

export function isSyntaxIssue(message: string): boolean {
  return !UNDECLARED_REFERENCE.test(message);
}

interface MonacoWord {
  startColumn: number;
  endColumn: number;
}

export interface MarkerModel {
  getWordAtPosition: (position: {
    lineNumber: number;
    column: number;
  }) => MonacoWord | null;
  getLineContent: (lineNumber: number) => string;
}

export interface CelMarker {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: number;
}

/**
 * Turns an issue into the range Monaco underlines.
 *
 * An issue that came with an extent is drawn exactly as given — the server
 * computed it from the rule's own syntax tree, so it already names the
 * offending token. Only the ones carrying a bare point need guessing at, and
 * the word under that point is the best available guess.
 */
export function issueToMarker(
  issue: CelIssue,
  model: MarkerModel,
  severity: number,
): CelMarker {
  const line = issue.line || 1;
  const column = issue.column || 1;

  if (issue.endColumn && issue.endColumn > column) {
    return {
      startLineNumber: line,
      startColumn: column,
      endLineNumber: issue.endLine || line,
      endColumn: issue.endColumn,
      message: issue.message,
      severity,
    };
  }

  const word = model.getWordAtPosition({ lineNumber: line, column });

  return {
    startLineNumber: line,
    startColumn: word ? word.startColumn : column,
    endLineNumber: line,
    endColumn: word ? word.endColumn : column + 1,
    message: issue.message,
    severity,
  };
}
