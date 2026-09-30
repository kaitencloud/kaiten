import { parse } from 'cel-js';
import type { CstNode, CstToken, ParseResult } from './format-cel.types';
import { printCst } from './format-cel-printer';

/**
 * The token images of an expression, in source order — the expression's
 * meaning with its whitespace removed. Null when the code does not parse.
 */
export const celTokenImages = (code: string): string[] | null => {
  try {
    const result = parse(code) as unknown as ParseResult;
    if (!result.isSuccess || !result.cst) {
      return null;
    }

    const tokens: CstToken[] = [];
    const collect = (node: CstNode | CstToken) => {
      if ('image' in node) {
        tokens.push(node);
        return;
      }
      for (const values of Object.values(node.children)) {
        for (const child of values) {
          collect(child);
        }
      }
    };
    collect(result.cst);

    return tokens
      .sort((left, right) => left.startOffset - right.startOffset)
      .map((token) => token.image);
  } catch {
    return null;
  }
};

/*
formatCEL rewrites whitespace and never anything else, and the guard at the
end is what makes that a property instead of a hope.

The printer walks a CST it has to know every node of, and an accessor it does
not know prints as nothing — which is how Format once turned
`entitlements['customers'].percentage` into `entitlements.percentage`: a
syntactically fine rule that means something else, one click, no error. So
the result only replaces the author's text if it parses back to the exact
same token sequence; otherwise the original is returned untouched and the
gap is a console error for us, not a corrupted rule for them.
*/
export const formatCEL = (code: string): string => {
  try {
    const result = parse(code) as unknown as ParseResult;
    if (!result.isSuccess || !result.cst) {
      return code;
    }

    const formatted = printCst(result.cst, 0);

    const before = celTokenImages(code);
    const after = celTokenImages(formatted);
    if (
      before === null ||
      after === null ||
      before.length !== after.length ||
      before.some((image, index) => image !== after[index])
    ) {
      console.error(
        'formatCEL: printer changed the expression, keeping the original',
        { code, formatted },
      );
      return code;
    }

    return formatted;
  } catch (e) {
    console.error('Failed to parse CEL for formatting:', e);
    return code;
  }
};
