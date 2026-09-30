import type {
  CELBooleanLiteral,
  CELBytesLiteral,
  CELConditionalAnd,
  CELConditionalOr,
  CELDynamicPropertyAccessor,
  CELExpression,
  CELIdentifier,
  CELLiteral,
  CELMember,
  CELMemberNegatedIdentifier,
  CELMemberNegatedIdentifierChain,
  CELNullLiteral,
  CELNumericLiteral,
  CELRelop,
  CELStringLiteral,
  DefaultCombinatorName,
  DefaultOperatorName,
} from '../types/cel.types';
import {
  isCELConditionalAnd,
  isCELConditionalOr,
  isCELIdentifier,
  isCELMember,
  isCELNegatedIdentifier,
  isCELStringLiteral,
  isCELSubqueryExpression,
} from './cel-type-guards';

export const extractSubqueryComponents = (
  expr: CELMember,
): {
  field: string;
  method: 'all' | 'exists';
  alias: string | null;
  condition: CELExpression;
} | null => {
  // istanbul ignore next
  if (!isCELSubqueryExpression(expr)) {
    return null;
  }

  const field = getCELIdentifierFromChain(expr.left);
  const method = expr.right.value;
  const [aliasExpr, conditionExpr] = expr.list.value;

  const alias = isCELIdentifier(aliasExpr)
    ? aliasExpr.value
    : /* istanbul ignore next */ null;

  return {
    field,
    method,
    alias,
    condition: conditionExpr,
  };
};

export const getCELIdentifierFromChain = (
  expr: CELIdentifier | CELMember | CELDynamicPropertyAccessor,
): string => {
  if (isCELIdentifier(expr)) {
    return expr.value;
  }

  if (expr.type === 'DynamicPropertyAccessor') {
    const leftField = getCELIdentifierFromChain(expr.left);
    if (isCELStringLiteral(expr.right)) {
      const propertyName = evalCELLiteralValue(expr.right);
      return `${leftField}["${propertyName}"]`;
    }

    // istanbul ignore next
    return `${leftField}[${expr.right.type}]`;
  }

  if (expr.left && expr.right && isCELIdentifier(expr.right)) {
    if (isCELIdentifier(expr.left) || isCELMember(expr.left)) {
      return `${getCELIdentifierFromChain(expr.left)}.${expr.right.value}`;
    }
  }

  // istanbul ignore next
  return expr.type;
};

export const getCELIdentifierFromNegatedChain = (
  expr: CELMemberNegatedIdentifier | CELMemberNegatedIdentifierChain,
): string => {
  if (isCELNegatedIdentifier(expr)) {
    return `${``.padStart(expr.negations, '!')}${expr.value.value}`;
  }

  return `${getCELIdentifierFromNegatedChain(expr.left)}.${expr.right.value}`;
};

export function evalCELLiteralValue(literal: CELStringLiteral): string;
export function evalCELLiteralValue(literal: CELBooleanLiteral): boolean;
export function evalCELLiteralValue(literal: CELNumericLiteral): number | null;
export function evalCELLiteralValue(literal: CELBytesLiteral): null;
export function evalCELLiteralValue(literal: CELNullLiteral): null;
export function evalCELLiteralValue(
  literal: CELLiteral,
): string | boolean | number | null;
export function evalCELLiteralValue(literal: CELLiteral) {
  switch (literal.type) {
    case 'StringLiteral':
      return literal.value.replaceAll(
        /^((?:'''|"""|'|")?)([\S\s]*?)\1$/gm,
        '$2',
      );
    case 'BooleanLiteral':
      return literal.value;
    case 'NullLiteral':
    case 'BytesLiteral':
      return null;
    default:
      return literal.value;
  }
}

export const celNormalizeCombinator = (
  combinator: '&&' | '||',
): DefaultCombinatorName => (combinator === '||' ? 'or' : 'and');

export const celNormalizeOperator = (
  op: CELRelop,
  flip?: boolean,
): DefaultOperatorName => {
  if (flip) {
    if (op === '<') return '>';
    if (op === '<=') return '>=';
    if (op === '>') return '<';
    if (op === '>=') return '<=';
  }

  if (op === '==') {
    return '=';
  }

  return op;
};

export const celGenerateFlatAndOrList = (
  expr: CELConditionalAnd | CELConditionalOr,
): (DefaultCombinatorName | CELExpression)[] => {
  const combinator = celNormalizeCombinator(
    expr.type === 'ConditionalAnd' ? '&&' : '||',
  );
  const { left, right } = expr;

  if (isCELConditionalAnd(left) || isCELConditionalOr(left)) {
    return [...celGenerateFlatAndOrList(left), combinator, right];
  }

  return [left, combinator, right];
};

export const celGenerateMixedAndOrList = (
  expr: CELConditionalAnd | CELConditionalOr,
): (DefaultCombinatorName | CELExpression | ('and' | CELExpression)[])[] => {
  const flatList = celGenerateFlatAndOrList(expr);
  const mixedList: (
    | DefaultCombinatorName
    | CELExpression
    | ('and' | CELExpression)[]
  )[] = [];

  for (let index = 0; index < flatList.length; index += 2) {
    if (flatList[index + 1] === 'and') {
      const andGroup = collectAndGroup(flatList, index);
      mixedList.push(andGroup.group);
      index = andGroup.endIndex - 2;
      continue;
    }

    if (flatList[index + 1] === 'or') {
      pushOrSegment(mixedList, flatList, index);
    }
  }

  if (mixedList.length === 1 && Array.isArray(mixedList[0])) {
    return mixedList[0];
  }

  return mixedList;
};

const collectAndGroup = (
  flatList: (DefaultCombinatorName | CELExpression)[],
  startIndex: number,
): { group: ('and' | CELExpression)[]; endIndex: number } => {
  let endIndex = startIndex;

  while (flatList[endIndex + 1] === 'and') {
    endIndex += 2;
  }

  return {
    group: flatList.slice(startIndex, endIndex + 1) as (
      | 'and'
      | CELExpression
    )[],
    endIndex,
  };
};

const pushOrSegment = (
  mixedList: (
    | DefaultCombinatorName
    | CELExpression
    | ('and' | CELExpression)[]
  )[],
  flatList: (DefaultCombinatorName | CELExpression)[],
  index: number,
) => {
  const isFirstOperator = index === 0;
  const isLastOperator = index === flatList.length - 3;

  if (isFirstOperator || isLastOperator) {
    if (isFirstOperator || flatList[index - 1] === 'or') {
      mixedList.push(flatList[index] as CELExpression);
    }
    mixedList.push(flatList[index + 1] as DefaultCombinatorName);
    if (isLastOperator) {
      mixedList.push(flatList[index + 2] as CELExpression);
    }
    return;
  }

  if (flatList[index - 1] === 'and') {
    mixedList.push(flatList[index + 1] as DefaultCombinatorName);
    return;
  }

  mixedList.push(
    flatList[index] as CELExpression,
    flatList[index + 1] as DefaultCombinatorName,
  );
};
