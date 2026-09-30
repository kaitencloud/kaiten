import type { CstNode, CstToken } from './format-cel.types';

const INDENT_SIZE = 2;

const getIndent = (level: number): string => ' '.repeat(level * INDENT_SIZE);

const getTokenImage = (token: CstNode | CstToken): string =>
  'image' in token ? token.image : '';

const printAtomicExpression = (node: CstNode, indentLevel: number): string => {
  const { children } = node;
  const nestedExpressionKeys = [
    'parenthesisExpression',
    'listExpression',
    'mapExpression',
    'identifierExpression',
    'stringLiteral',
    'bytesLiteral',
    'integerLiteral',
    'floatLiteral',
    'booleanLiteral',
    'nullLiteral',
  ] as const;

  for (const key of nestedExpressionKeys) {
    if (children[key]) {
      return printCst(children[key][0], indentLevel);
    }
  }

  const literalTokenKeys = [
    'Integer',
    'Float',
    'StringLiteral',
    'Bool',
  ] as const;

  for (const key of literalTokenKeys) {
    if (children[key]) {
      return getTokenImage(children[key][0]);
    }
  }

  if (children.Null) {
    return 'null';
  }

  return '';
};

const printUnaryExpression = (node: CstNode, indentLevel: number): string => {
  const { children } = node;
  const unaryTokens = children.UnaryOp || children.Not || children.Minus;

  if (unaryTokens) {
    const op = (unaryTokens[0] as CstToken).image;
    const expression = printCst(
      children.unaryExpression?.[0] || children.atomicExpression?.[0],
      indentLevel,
    );

    return `${op}${expression}`;
  }

  return printCst(children.atomicExpression[0], indentLevel);
};

const printListExpression = (node: CstNode, indentLevel: number): string => {
  const { children } = node;
  const items: string[] = [];

  if (children.lhs) {
    items.push(printCst(children.lhs[0], indentLevel + 1));
  }

  if (children.rhs) {
    (children.rhs as CstNode[]).forEach((childNode) => {
      items.push(printCst(childNode, indentLevel + 1));
    });
  }

  if (items.length === 0) {
    return '[]';
  }

  if (items.length <= 3) {
    return `[${items.join(', ')}]`;
  }

  const indent = getIndent(indentLevel);
  const itemIndent = getIndent(indentLevel + 1);
  return `[\n${items.map((item) => `${itemIndent}${item}`).join(',\n')}\n${indent}]`;
};

const printMapExpression = (node: CstNode, indentLevel: number): string => {
  const { children } = node;
  const entries: string[] = [];

  if (children.keyValues) {
    (children.keyValues as CstNode[]).forEach((keyValueNode) => {
      entries.push(printCst(keyValueNode, indentLevel + 1));
    });
  }

  if (entries.length === 0) {
    return '{}';
  }

  const indent = getIndent(indentLevel);
  const itemIndent = getIndent(indentLevel + 1);
  return `{\n${entries.map((entry) => `${itemIndent}${entry}`).join(',\n')}\n${indent}}`;
};

// firstTokenOffset is where a node starts in the source, found by walking to
// its earliest token. The CST puts same-kind accessors together under one key,
// so a chain's interleaving of dots and indexes survives only in the offsets.
const firstTokenOffset = (node: CstNode | CstToken): number => {
  if ('image' in node) {
    return node.startOffset;
  }

  let earliest = Number.POSITIVE_INFINITY;
  for (const values of Object.values(node.children)) {
    for (const child of values) {
      earliest = Math.min(earliest, firstTokenOffset(child));
    }
  }

  return earliest;
};

const printIdentifierExpression = (
  node: CstNode,
  indentLevel: number,
): string => {
  const { children } = node;
  let result = (children.Identifier[0] as CstToken).image;

  /*
  Dots and indexes are one chain in the source — `entitlements['seats'].used`
  — but the CST shelves them under two keys, all dots on one, all indexes on
  the other. Printing shelf by shelf either dropped the indexes (the index
  shelf is named identifierIndexExpression, and the printer looked for a key
  that does not exist) or would have reordered the chain. Merging on source
  offsets prints the chain the way it was written.
  */
  const accessors = [
    ...((children.identifierDotExpression as CstNode[] | undefined) ?? []),
    ...((children.identifierIndexExpression as CstNode[] | undefined) ?? []),
  ].sort((left, right) => firstTokenOffset(left) - firstTokenOffset(right));

  for (const accessor of accessors) {
    result += printCst(accessor, indentLevel);
  }

  return result;
};

const printIdentifierDotExpression = (
  node: CstNode,
  indentLevel: number,
): string => {
  const { children } = node;
  const identifier = (children.Identifier[0] as CstToken).image;
  const args = children.OpenParenthesis
    ? `(${(children.arg as CstNode[] | undefined)?.map((argNode) => printCst(argNode, indentLevel)).join(', ') ?? ''})`
    : '';

  return `.${identifier}${args}`;
};

const printBinary = (node: CstNode, indentLevel: number): string => {
  const { children } = node;
  let result = printCst(children.lhs[0], indentLevel);

  if (!children.rhs) {
    return result;
  }

  const rhsNodes = children.rhs as CstNode[];
  const operators = Object.entries(children)
    .flatMap(([key, values]) => {
      if (key === 'lhs' || key === 'rhs') return [];
      return values.filter((value): value is CstToken => 'image' in value);
    })
    .sort((left, right) => left.startOffset - right.startOffset);

  rhsNodes.forEach((rhsNode, index) => {
    const operator = operators[index]?.image || '??';
    result += ` ${operator} ${printCst(rhsNode, indentLevel)}`;
  });

  return result;
};

export const printCst = (
  node: CstNode | CstToken,
  indentLevel: number,
): string => {
  if ('image' in node) {
    return node.image;
  }

  const { children } = node;

  switch (node.name) {
    case 'expr':
      return printCst(children.conditionalOr[0], indentLevel);
    case 'conditionalOr':
    case 'conditionalAnd':
    case 'addition':
    case 'multiplication':
      return printBinary(node, indentLevel);
    case 'relation':
      return children.rhs
        ? printBinary(node, indentLevel)
        : printCst(children.lhs[0], indentLevel);
    case 'unaryExpression':
      return printUnaryExpression(node, indentLevel);
    case 'atomicExpression':
      return printAtomicExpression(node, indentLevel);
    case 'parenthesisExpression':
      return `(${printCst(children.expr[0], indentLevel)})`;
    case 'listExpression':
      return printListExpression(node, indentLevel);
    case 'mapExpression':
      return printMapExpression(node, indentLevel);
    case 'mapKeyValues':
      return `${printCst(children.key[0], indentLevel)}: ${printCst(children.value[0], indentLevel)}`;
    case 'identifierExpression':
      return printIdentifierExpression(node, indentLevel);
    case 'identifierDotExpression':
      return printIdentifierDotExpression(node, indentLevel);
    case 'indexExpression':
      return `[${printCst(children.expr[0], indentLevel)}]`;
    default:
      return '';
  }
};
