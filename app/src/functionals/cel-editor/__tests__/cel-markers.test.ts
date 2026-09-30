import { describe, it, expect } from 'vite-plus/test';
import {
  isSyntaxIssue,
  issueToMarker,
  type MarkerModel,
} from '../logic/cel-markers';

const ERROR = 8;

/** A model whose only word is `slgu`, at columns 18..22 of line 1. */
const model: MarkerModel = {
  getWordAtPosition: ({ column }) =>
    column >= 18 && column <= 22
      ? { startColumn: 18, endColumn: 22 }
      : null,
  getLineContent: () => "__kaiten.license.slgu == 'scale'",
};

describe('isSyntaxIssue', () => {
  /*
  The local engine is given no context, so it calls every name in every rule
  undeclared — including the host attributes a rule may legitimately target
  on. Keeping those would put a red squiggle under `user` in a rule the server
  accepts, which is the failure this whole change is about, inverted.
  */
  it('discards the local engine s verdict on whether a name exists', () => {
    expect(isSyntaxIssue("Undeclared reference to 'user'")).toBe(false);
  });

  it('keeps what the local engine can be right about', () => {
    expect(isSyntaxIssue('Unexpected end of input')).toBe(true);
    expect(isSyntaxIssue('mismatched input <EOF>')).toBe(true);
  });
});

describe('issueToMarker', () => {
  // The server computes the extent from the rule's own syntax tree, so it
  // already names the offending token exactly.
  it('draws an issue that came with an extent exactly as given', () => {
    const marker = issueToMarker(
      { message: 'nope', line: 1, column: 17, endLine: 1, endColumn: 22 },
      model,
      ERROR,
    );

    expect(marker).toMatchObject({
      startLineNumber: 1,
      startColumn: 17,
      endLineNumber: 1,
      endColumn: 22,
      severity: ERROR,
    });
  });

  it('underlines the word under a bare point', () => {
    const marker = issueToMarker(
      { message: 'nope', line: 1, column: 19 },
      model,
      ERROR,
    );

    expect(marker).toMatchObject({ startColumn: 18, endColumn: 22 });
  });

  it('falls back to a single character where there is no word', () => {
    const marker = issueToMarker(
      { message: 'nope', line: 1, column: 5 },
      model,
      ERROR,
    );

    expect(marker).toMatchObject({ startColumn: 5, endColumn: 6 });
  });

  // A blank rule is wrong without being wrong anywhere, and the server says so
  // by sending no position at all.
  it('places an issue with no position at the start of the rule', () => {
    const marker = issueToMarker(
      { message: 'targeting rule is empty', line: 0, column: 0 },
      model,
      ERROR,
    );

    expect(marker).toMatchObject({
      startLineNumber: 1,
      startColumn: 1,
      endColumn: 2,
    });
  });
});
