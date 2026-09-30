import type {
  CELAddition,
  CELBooleanLiteral,
  CELBytesLiteral,
  CELConditionalAnd,
  CELConditionalExpr,
  CELConditionalOr,
  CELDivision,
  CELDynamicPropertyAccessor,
  CELExpression,
  CELExpressionGroup,
  CELExpressionList,
  CELFieldInit,
  CELFieldInits,
  CELFieldsObject,
  CELFloatLiteral,
  CELFunctionCall,
  CELIdentifier,
  CELIntegerLiteral,
  CELLikeExpression,
  CELList,
  CELLiteral,
  CELMap,
  CELMapInit,
  CELMapInits,
  CELMember,
  CELMemberIdentifierChain,
  CELMemberNegatedIdentifier,
  CELMemberNegatedIdentifierChain,
  CELModulo,
  CELMultiplication,
  CELNegatedLikeExpression,
  CELNegatedSubqueryExpression,
  CELNegation,
  CELNegative,
  CELNullLiteral,
  CELNumericLiteral,
  CELProperty,
  CELRelation,
  CELStringLiteral,
  CELSubqueryExpression,
  CELSubtraction,
  CELUnsignedIntegerLiteral,
} from '../types/cel.types';

export const isCELExpressionGroup = (
  expr: CELExpression,
): expr is CELExpressionGroup => expr.type === 'ExpressionGroup';

export const isCELConditionalAnd = (
  expr: CELExpression,
): expr is CELConditionalAnd => expr.type === 'ConditionalAnd';

export const isCELConditionalOr = (
  expr: CELExpression,
): expr is CELConditionalOr => expr.type === 'ConditionalOr';

export const isCELStringLiteral = (
  expr: CELExpression,
): expr is CELStringLiteral => expr.type === 'StringLiteral';

export const isCELLiteral = (expr: CELExpression): expr is CELLiteral =>
  isCELNumericLiteral(expr) ||
  isCELStringLiteral(expr) ||
  isCELBooleanLiteral(expr) ||
  isCELNullLiteral(expr) ||
  isCELBytesLiteral(expr);

export const isCELNumericLiteral = (
  expr: CELExpression,
): expr is CELNumericLiteral =>
  isCELFloatLiteral(expr) ||
  isCELIntegerLiteral(expr) ||
  isCELUnsignedIntegerLiteral(expr);

export const isCELRelation = (expr: CELExpression): expr is CELRelation =>
  expr.type === 'Relation';

export const isCELList = (expr: CELExpression): expr is CELList =>
  expr.type === 'List';

export const isCELMap = (expr: CELExpression): expr is CELMap =>
  expr.type === 'Map';

export const isCELIdentifier = (expr: CELExpression): expr is CELIdentifier =>
  expr.type === 'Identifier';

export const isCELNegation = (expr: CELExpression): expr is CELNegation =>
  expr.type === 'Negation';

export const isCELMember = (expr: CELExpression): expr is CELMember =>
  expr.type === 'Member';

// istanbul ignore next
export const isCELAddition = (expr: CELExpression): expr is CELAddition =>
  expr.type === 'Addition';

export const isCELBooleanLiteral = (
  expr: CELExpression,
): expr is CELBooleanLiteral => expr.type === 'BooleanLiteral';

export const isCELBytesLiteral = (
  expr: CELExpression,
): expr is CELBytesLiteral => expr.type === 'BytesLiteral';

// istanbul ignore next
export const isCELConditionalExpr = (
  expr: CELExpression,
): expr is CELConditionalExpr => expr.type === 'ConditionalExpr';

// istanbul ignore next
export const isCELDivision = (expr: CELExpression): expr is CELDivision =>
  expr.type === 'Division';

// istanbul ignore next
export const isCELDynamicPropertyAccessor = (
  expr: CELExpression,
): expr is CELDynamicPropertyAccessor =>
  expr.type === 'DynamicPropertyAccessor';

// istanbul ignore next
export const isCELExpressionList = (
  expr: CELExpression,
): expr is CELExpressionList => expr.type === 'ExpressionList';

// istanbul ignore next
export const isCELFieldInit = (expr: CELExpression): expr is CELFieldInit =>
  expr.type === 'FieldInit';

// istanbul ignore next
export const isCELFieldInits = (expr: CELExpression): expr is CELFieldInits =>
  expr.type === 'FieldInits';

// istanbul ignore next
export const isCELFieldsObject = (
  expr: CELExpression,
): expr is CELFieldsObject => expr.type === 'FieldsObject';

export const isCELFloatLiteral = (
  expr: CELExpression,
): expr is CELFloatLiteral => expr.type === 'FloatLiteral';

// istanbul ignore next
export const isCELFunctionCall = (
  expr: CELExpression,
): expr is CELFunctionCall => expr.type === 'FunctionCall';

export const isCELIntegerLiteral = (
  expr: CELExpression,
): expr is CELIntegerLiteral => expr.type === 'IntegerLiteral';

// istanbul ignore next
export const isCELMapInit = (expr: CELExpression): expr is CELMapInit =>
  expr.type === 'MapInit';

// istanbul ignore next
export const isCELMapInits = (expr: CELExpression): expr is CELMapInits =>
  expr.type === 'MapInits';

// istanbul ignore next
export const isCELModulo = (expr: CELExpression): expr is CELModulo =>
  expr.type === 'Modulo';

// istanbul ignore next
export const isCELMultiplication = (
  expr: CELExpression,
): expr is CELMultiplication => expr.type === 'Multiplication';

// istanbul ignore next
export const isCELNegative = (expr: CELExpression): expr is CELNegative =>
  expr.type === 'Negative';

export const isCELNullLiteral = (expr: CELExpression): expr is CELNullLiteral =>
  expr.type === 'NullLiteral';

// istanbul ignore next
export const isCELProperty = (expr: CELExpression): expr is CELProperty =>
  expr.type === 'Property';

// istanbul ignore next
export const isCELSubtraction = (expr: CELExpression): expr is CELSubtraction =>
  expr.type === 'Subtraction';

export const isCELUnsignedIntegerLiteral = (
  expr: CELExpression,
): expr is CELUnsignedIntegerLiteral => expr.type === 'UnsignedIntegerLiteral';

export const isCELIdentifierOrChain = (
  expr: CELExpression,
): expr is
  | CELMemberIdentifierChain
  | CELIdentifier
  | CELDynamicPropertyAccessor =>
  isCELIdentifier(expr) ||
  isCELDynamicPropertyAccessor(expr) ||
  (isCELMember(expr) &&
    !!expr.left &&
    !!expr.right &&
    !expr.list &&
    !expr.value &&
    isCELIdentifierOrChain(expr.left) &&
    isCELIdentifier(expr.right));

export const isCELNegatedIdentifier = (
  expr: CELExpression,
): expr is CELMemberNegatedIdentifier =>
  isCELNegation(expr) && isCELIdentifier(expr.value);

export const isCELNegatedIdentifierOrChain = (
  expr: CELExpression,
): expr is CELMemberNegatedIdentifierChain | CELMemberNegatedIdentifier =>
  isCELNegatedIdentifier(expr) ||
  (isCELMember(expr) &&
    !!expr.left &&
    !!expr.right &&
    !expr.list &&
    !expr.value &&
    isCELIdentifierOrChain(expr.right) &&
    isCELNegatedIdentifier(expr.left));

export const isCELLikeExpression = (
  expr: CELExpression,
): expr is CELLikeExpression =>
  isCELMember(expr) &&
  !!expr.left &&
  !!expr.right &&
  !!expr.list &&
  isCELIdentifierOrChain(expr.left) &&
  isCELIdentifier(expr.right) &&
  (expr.right.value === 'contains' ||
    expr.right.value === 'startsWith' ||
    expr.right.value === 'endsWith') &&
  expr.list.value.length === 1 &&
  (isCELStringLiteral(expr.list.value[0]) ||
    isCELIdentifier(expr.list.value[0]));

export const isCELNegatedLikeExpression = (
  expr: CELExpression,
): expr is CELNegatedLikeExpression =>
  isCELMember(expr) &&
  !!expr.left &&
  !!expr.right &&
  !!expr.list &&
  isCELNegatedIdentifierOrChain(expr.left) &&
  isCELIdentifier(expr.right) &&
  (expr.right.value === 'contains' ||
    expr.right.value === 'startsWith' ||
    expr.right.value === 'endsWith') &&
  expr.list.value.length === 1 &&
  (isCELStringLiteral(expr.list.value[0]) ||
    isCELIdentifier(expr.list.value[0]));

export const isCELSubqueryExpression = (
  expr: CELExpression,
): expr is CELSubqueryExpression =>
  isCELMember(expr) &&
  !!expr.left &&
  !!expr.right &&
  !!expr.list &&
  isCELIdentifierOrChain(expr.left) &&
  isCELIdentifier(expr.right) &&
  (expr.right.value === 'all' || expr.right.value === 'exists') &&
  expr.list.value.length >= 2;

export const isCELNegatedSubqueryExpression = (
  expr: CELExpression,
): expr is CELNegatedSubqueryExpression =>
  isCELMember(expr) &&
  !!expr.left &&
  !!expr.right &&
  !!expr.list &&
  isCELNegatedIdentifierOrChain(expr.left) &&
  isCELIdentifier(expr.right) &&
  (expr.right.value === 'all' || expr.right.value === 'exists') &&
  expr.list.value.length >= 2;
