import type {
  CELConditionalAnd,
  CELConditionalOr,
  CELExpression,
  CELExpressionGroup,
  CELIdentifier,
  CELMember,
  CELNegation,
  CELPrimary,
  CELRelation,
} from '../types/cel.types';
import {
  isCELConditionalAnd,
  isCELConditionalOr,
  isCELExpressionGroup,
  isCELIdentifier,
  isCELLikeExpression,
  isCELMember,
  isCELNegatedIdentifier,
  isCELNegatedLikeExpression,
  isCELNegation,
  isCELRelation,
} from './cel-type-guards';

const isPrimitiveArrayUsage = (
  expr: CELExpression,
  alias: string | null,
): boolean => {
  // istanbul ignore next
  if (!alias) return false;

  if (isCELIdentifier(expr) && expr.value === alias) {
    return true;
  }

  if (
    isCELLikeExpression(expr) &&
    isCELIdentifier(expr.left) &&
    expr.left.value === alias
  ) {
    return true;
  }

  if (
    isCELRelation(expr) ||
    isCELConditionalAnd(expr) ||
    isCELConditionalOr(expr)
  ) {
    return (
      isPrimitiveArrayUsage(expr.left, alias) ||
      isPrimitiveArrayUsage(expr.right, alias)
    );
  }

  if (isCELExpressionGroup(expr) || isCELNegation(expr)) {
    return isPrimitiveArrayUsage(expr.value, alias);
  }

  return false;
};

const transformAliasIdentifier = (
  expr: CELExpression,
  alias: string,
): CELExpression | null =>
  isCELIdentifier(expr) && expr.value === alias
    ? ({ type: 'Identifier', value: '' } as CELIdentifier)
    : null;

const transformAliasLikeMember = (
  expr: CELExpression,
  alias: string,
  isPrimitive: boolean,
): CELExpression | null => {
  if (
    isCELMember(expr) &&
    expr.left &&
    isCELIdentifier(expr.left) &&
    expr.left.value === alias &&
    expr.right &&
    isCELIdentifier(expr.right) &&
    !isPrimitive
  ) {
    if (expr.list) {
      return {
        type: 'Member',
        left: { type: 'Identifier', value: '' },
        right: expr.right,
        list: expr.list,
      } as CELMember;
    }

    return expr.right;
  }

  if (
    isCELLikeExpression(expr) &&
    isCELIdentifier(expr.left) &&
    expr.left.value === alias
  ) {
    return {
      type: 'Member',
      left: { type: 'Identifier', value: '' },
      right: expr.right,
      list: expr.list,
    } as CELMember;
  }

  if (
    isCELNegatedLikeExpression(expr) &&
    expr.left &&
    isCELNegatedIdentifier(expr.left) &&
    expr.left.value.value === alias
  ) {
    return {
      type: 'Member',
      left: {
        type: 'Negation',
        negations: expr.left.negations,
        value: { type: 'Identifier', value: '' },
      },
      right: expr.right,
      list: expr.list,
    } as CELMember;
  }

  return null;
};

const transformAliasRecursive = (
  expr: CELExpression,
  alias: string,
  isPrimitive: boolean,
): CELExpression => {
  if (isCELMember(expr) && expr.left && expr.right) {
    const transformedLeft = transformAliasInExpressionInternal(
      expr.left,
      alias,
      isPrimitive,
    );

    if (transformedLeft !== expr.left) {
      return {
        type: 'Member',
        left: transformedLeft as CELPrimary | CELMember | CELNegation,
        right: expr.right,
        list: expr.list,
        value: expr.value,
      } as CELMember;
    }
  }

  if (isCELRelation(expr)) {
    return {
      type: 'Relation',
      left: transformAliasInExpressionInternal(expr.left, alias, isPrimitive),
      right: transformAliasInExpressionInternal(expr.right, alias, isPrimitive),
      operator: expr.operator,
    } as CELRelation;
  }

  if (isCELConditionalAnd(expr)) {
    return {
      type: 'ConditionalAnd',
      left: transformAliasInExpressionInternal(expr.left, alias, isPrimitive),
      right: transformAliasInExpressionInternal(expr.right, alias, isPrimitive),
    } as CELConditionalAnd;
  }

  if (isCELConditionalOr(expr)) {
    return {
      type: 'ConditionalOr',
      left: transformAliasInExpressionInternal(expr.left, alias, isPrimitive),
      right: transformAliasInExpressionInternal(expr.right, alias, isPrimitive),
    } as CELConditionalOr;
  }

  if (isCELExpressionGroup(expr)) {
    return {
      type: 'ExpressionGroup',
      value: transformAliasInExpressionInternal(expr.value, alias, isPrimitive),
    } as CELExpressionGroup;
  }

  if (isCELNegation(expr)) {
    return {
      type: 'Negation',
      negations: expr.negations,
      value: transformAliasInExpressionInternal(
        expr.value,
        alias,
        isPrimitive,
      ) as CELPrimary,
    } as CELNegation;
  }

  return expr;
};

const transformAliasInExpressionInternal = (
  expr: CELExpression,
  alias: string | null,
  isPrimitive: boolean,
): CELExpression => {
  // istanbul ignore next
  if (!alias) return expr;

  return (
    transformAliasIdentifier(expr, alias) ??
    transformAliasLikeMember(expr, alias, isPrimitive) ??
    transformAliasRecursive(expr, alias, isPrimitive)
  );
};

export const transformAliasInExpression = (
  expr: CELExpression,
  alias: string | null,
): CELExpression => {
  // istanbul ignore next
  if (!alias) return expr;

  const isPrimitive = isPrimitiveArrayUsage(expr, alias);
  return transformAliasInExpressionInternal(expr, alias, isPrimitive);
};
