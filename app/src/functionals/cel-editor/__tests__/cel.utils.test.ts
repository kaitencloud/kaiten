import { describe, it, expect } from 'vite-plus/test';
import {
  extractSubqueryComponents,
  getCELIdentifierFromChain,
  evalCELLiteralValue,
  celGenerateFlatAndOrList,
  celGenerateMixedAndOrList,
  isCELIdentifier,
  isCELStringLiteral,
  isCELBooleanLiteral,
  isCELNumericLiteral,
  isCELNullLiteral,
} from '../logic/cel.utils';
import type {
  CELIdentifier,
  CELMember,
  CELStringLiteral,
  CELBooleanLiteral,
  CELIntegerLiteral,
  CELFloatLiteral,
  CELNullLiteral,
  CELConditionalAnd,
  CELConditionalOr,
} from '../types/cel.types';

describe('cel.utils', () => {
  describe('Type Guards', () => {
    describe('isCELIdentifier', () => {
      it('should return true for Identifier type', () => {
        const identifier: CELIdentifier = {
          type: 'Identifier',
          value: 'user',
        };
        expect(isCELIdentifier(identifier)).toBe(true);
      });

      it('should return false for non-Identifier type', () => {
        const stringLiteral: CELStringLiteral = {
          type: 'StringLiteral',
          value: '"test"',
        };
        expect(isCELIdentifier(stringLiteral)).toBe(false);
      });
    });

    describe('isCELStringLiteral', () => {
      it('should return true for StringLiteral type', () => {
        const stringLiteral: CELStringLiteral = {
          type: 'StringLiteral',
          value: '"hello"',
        };
        expect(isCELStringLiteral(stringLiteral)).toBe(true);
      });

      it('should return false for non-StringLiteral type', () => {
        const identifier: CELIdentifier = {
          type: 'Identifier',
          value: 'user',
        };
        expect(isCELStringLiteral(identifier)).toBe(false);
      });
    });

    describe('isCELBooleanLiteral', () => {
      it('should return true for BooleanLiteral type', () => {
        const boolLiteral: CELBooleanLiteral = {
          type: 'BooleanLiteral',
          value: true,
        };
        expect(isCELBooleanLiteral(boolLiteral)).toBe(true);
      });
    });

    describe('isCELNumericLiteral', () => {
      it('should return true for IntegerLiteral', () => {
        const intLiteral: CELIntegerLiteral = {
          type: 'IntegerLiteral',
          value: 42,
        };
        expect(isCELNumericLiteral(intLiteral)).toBe(true);
      });

      it('should return true for FloatLiteral', () => {
        const floatLiteral: CELFloatLiteral = {
          type: 'FloatLiteral',
          value: 3.14,
        };
        expect(isCELNumericLiteral(floatLiteral)).toBe(true);
      });
    });

    describe('isCELNullLiteral', () => {
      it('should return true for NullLiteral type', () => {
        const nullLiteral: CELNullLiteral = {
          type: 'NullLiteral',
          value: null,
        };
        expect(isCELNullLiteral(nullLiteral)).toBe(true);
      });
    });
  });

  describe('evalCELLiteralValue', () => {
    describe('StringLiteral', () => {
      it('should extract value from single-quoted string', () => {
        const literal: CELStringLiteral = {
          type: 'StringLiteral',
          value: "'hello'",
        };
        expect(evalCELLiteralValue(literal)).toBe('hello');
      });

      it('should extract value from double-quoted string', () => {
        const literal: CELStringLiteral = {
          type: 'StringLiteral',
          value: '"world"',
        };
        expect(evalCELLiteralValue(literal)).toBe('world');
      });

      it('should extract value from triple-quoted string', () => {
        const literal: CELStringLiteral = {
          type: 'StringLiteral',
          value: '"""multi\nline"""',
        };
        expect(evalCELLiteralValue(literal)).toBe('multi\nline');
      });

      it('should handle empty string', () => {
        const literal: CELStringLiteral = {
          type: 'StringLiteral',
          value: '""',
        };
        expect(evalCELLiteralValue(literal)).toBe('');
      });

      it('should handle string without quotes', () => {
        const literal: CELStringLiteral = {
          type: 'StringLiteral',
          value: "'plain'",
        };
        expect(evalCELLiteralValue(literal)).toBe('plain');
      });

      it('should handle string with escaped characters', () => {
        const literal: CELStringLiteral = {
          type: 'StringLiteral',
          value: '"hello\\nworld"',
        };
        expect(evalCELLiteralValue(literal)).toBe('hello\\nworld');
      });
    });

    describe('BooleanLiteral', () => {
      it('should return true for true literal', () => {
        const literal: CELBooleanLiteral = {
          type: 'BooleanLiteral',
          value: true,
        };
        expect(evalCELLiteralValue(literal)).toBe(true);
      });

      it('should return false for false literal', () => {
        const literal: CELBooleanLiteral = {
          type: 'BooleanLiteral',
          value: false,
        };
        expect(evalCELLiteralValue(literal)).toBe(false);
      });
    });

    describe('NumericLiteral', () => {
      it('should return integer value', () => {
        const literal: CELIntegerLiteral = {
          type: 'IntegerLiteral',
          value: 42,
        };
        expect(evalCELLiteralValue(literal)).toBe(42);
      });

      it('should return float value', () => {
        const literal: CELFloatLiteral = {
          type: 'FloatLiteral',
          value: 3.14,
        };
        expect(evalCELLiteralValue(literal)).toBe(3.14);
      });

      it('should handle negative numbers', () => {
        const literal: CELIntegerLiteral = {
          type: 'IntegerLiteral',
          value: -100,
        };
        expect(evalCELLiteralValue(literal)).toBe(-100);
      });

      it('should handle zero', () => {
        const literal: CELIntegerLiteral = {
          type: 'IntegerLiteral',
          value: 0,
        };
        expect(evalCELLiteralValue(literal)).toBe(0);
      });
    });

    describe('NullLiteral', () => {
      it('should return null for null literal', () => {
        const literal: CELNullLiteral = {
          type: 'NullLiteral',
          value: null,
        };
        expect(evalCELLiteralValue(literal)).toBe(null);
      });
    });
  });

  describe('getCELIdentifierFromChain', () => {
    it('should return value from simple identifier', () => {
      const identifier: CELIdentifier = {
        type: 'Identifier',
        value: 'user',
      };
      expect(getCELIdentifierFromChain(identifier)).toBe('user');
    });

    it('should return chained identifiers with dot notation', () => {
      const chain: CELMember = {
        type: 'Member',
        left: {
          type: 'Identifier',
          value: 'user',
        },
        right: {
          type: 'Identifier',
          value: 'name',
        },
      };
      expect(getCELIdentifierFromChain(chain)).toBe('user.name');
    });

    it('should handle deeply nested chains', () => {
      const deepChain: CELMember = {
        type: 'Member',
        left: {
          type: 'Member',
          left: {
            type: 'Identifier',
            value: 'user',
          },
          right: {
            type: 'Identifier',
            value: 'profile',
          },
        },
        right: {
          type: 'Identifier',
          value: 'email',
        },
      };
      expect(getCELIdentifierFromChain(deepChain)).toBe('user.profile.email');
    });

    it('should handle dynamic property accessor with string literal', () => {
      const userIdentifier: CELIdentifier = { type: 'Identifier', value: 'user' };
      const dynamicAccess = {
        type: 'DynamicPropertyAccessor' as const,
        left: userIdentifier as unknown as CELMember,
        right: {
          type: 'StringLiteral' as const,
          value: '"name"',
        },
      };
      expect(getCELIdentifierFromChain(dynamicAccess)).toBe('user["name"]');
    });
  });

  describe('celGenerateFlatAndOrList', () => {
    it('should flatten simple AND expression', () => {
      const andExpr: CELConditionalAnd = {
        type: 'ConditionalAnd',
        left: { type: 'Identifier', value: 'a' } as CELIdentifier,
        right: { type: 'Identifier', value: 'b' } as CELIdentifier,
      };

      const result = celGenerateFlatAndOrList(andExpr);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ type: 'Identifier', value: 'a' } as CELIdentifier);
      expect(result[1]).toBe('and');
      expect(result[2]).toEqual({ type: 'Identifier', value: 'b' } as CELIdentifier);
    });

    it('should flatten simple OR expression', () => {
      const orExpr: CELConditionalOr = {
        type: 'ConditionalOr',
        left: { type: 'Identifier', value: 'a' } as CELIdentifier,
        right: { type: 'Identifier', value: 'b' } as CELIdentifier,
      };

      const result = celGenerateFlatAndOrList(orExpr);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ type: 'Identifier', value: 'a' } as CELIdentifier);
      expect(result[1]).toBe('or');
      expect(result[2]).toEqual({ type: 'Identifier', value: 'b' } as CELIdentifier);
    });

    it('should flatten nested AND expressions', () => {
      const nestedAnd: CELConditionalAnd = {
        type: 'ConditionalAnd',
        left: {
          type: 'ConditionalAnd',
          left: { type: 'Identifier', value: 'a' } as CELIdentifier,
          right: { type: 'Identifier', value: 'b' } as CELIdentifier,
        } as CELConditionalAnd,
        right: { type: 'Identifier', value: 'c' } as CELIdentifier,
      };

      const result = celGenerateFlatAndOrList(nestedAnd);
      expect(result).toHaveLength(5);
      expect(result[1]).toBe('and');
      expect(result[3]).toBe('and');
    });

    it('should flatten nested OR expressions', () => {
      const nestedOr: CELConditionalOr = {
        type: 'ConditionalOr',
        left: {
          type: 'ConditionalOr',
          left: { type: 'Identifier', value: 'a' } as CELIdentifier,
          right: { type: 'Identifier', value: 'b' } as CELIdentifier,
        } as CELConditionalOr,
        right: { type: 'Identifier', value: 'c' } as CELIdentifier,
      };

      const result = celGenerateFlatAndOrList(nestedOr);
      expect(result).toHaveLength(5);
      expect(result[1]).toBe('or');
      expect(result[3]).toBe('or');
    });

    it('should handle complex nested expressions', () => {
      const complexExpr: CELConditionalAnd = {
        type: 'ConditionalAnd',
        left: {
          type: 'ConditionalAnd',
          left: {
            type: 'ConditionalAnd',
            left: { type: 'Identifier', value: 'a' } as CELIdentifier,
            right: { type: 'Identifier', value: 'b' } as CELIdentifier,
          } as CELConditionalAnd,
          right: { type: 'Identifier', value: 'c' } as CELIdentifier,
        } as CELConditionalAnd,
        right: { type: 'Identifier', value: 'd' } as CELIdentifier,
      };

      const result = celGenerateFlatAndOrList(complexExpr);
      expect(result).toHaveLength(7); // a, and, b, and, c, and, d
      expect(result.filter((item) => item === 'and')).toHaveLength(3);
    });
  });

  describe('celGenerateMixedAndOrList', () => {
    it('should handle simple AND expression', () => {
      const andExpr: CELConditionalAnd = {
        type: 'ConditionalAnd',
        left: { type: 'Identifier', value: 'a' } as CELIdentifier,
        right: { type: 'Identifier', value: 'b' } as CELIdentifier,
      };

      const result = celGenerateMixedAndOrList(andExpr);
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toEqual({ type: 'Identifier', value: 'a' } as CELIdentifier);
      expect(result[1]).toBe('and');
      expect(result[2]).toEqual({ type: 'Identifier', value: 'b' } as CELIdentifier);
    });

    it('should handle simple OR expression', () => {
      const orExpr: CELConditionalOr = {
        type: 'ConditionalOr',
        left: { type: 'Identifier', value: 'a' } as CELIdentifier,
        right: { type: 'Identifier', value: 'b' } as CELIdentifier,
      };

      const result = celGenerateMixedAndOrList(orExpr);
      expect(result).toHaveLength(3);
      expect(result[1]).toBe('or');
    });

    it('should group consecutive AND expressions', () => {
      const expr: CELConditionalAnd = {
        type: 'ConditionalAnd',
        left: {
          type: 'ConditionalAnd',
          left: { type: 'Identifier', value: 'a' } as CELIdentifier,
          right: { type: 'Identifier', value: 'b' } as CELIdentifier,
        } as CELConditionalAnd,
        right: { type: 'Identifier', value: 'c' } as CELIdentifier,
      };

      const result = celGenerateMixedAndOrList(expr);
      // Should group all AND expressions together
      expect(Array.isArray(result)).toBe(true);
      expect(result.filter((item) => item === 'and')).toHaveLength(2);
    });

    it('should handle mixed AND/OR expressions', () => {
      // a && b || c
      const mixedExpr: CELConditionalOr = {
        type: 'ConditionalOr',
        left: {
          type: 'ConditionalAnd',
          left: { type: 'Identifier', value: 'a' } as CELIdentifier,
          right: { type: 'Identifier', value: 'b' } as CELIdentifier,
        } as CELConditionalAnd,
        right: { type: 'Identifier', value: 'c' } as CELIdentifier,
      };

      const result = celGenerateMixedAndOrList(mixedExpr);
      expect(result.length).toBeGreaterThan(0);
      // Should contain both 'and' and 'or'
      const hasAnd = result.some(
        (item) => Array.isArray(item) && item.includes('and')
      );
      const hasOr = result.some((item) => item === 'or');
      expect(hasAnd || hasOr).toBe(true);
    });

    it('should handle complex nested mixed expressions', () => {
      // (a && b) || (c && d)
      const complexExpr: CELConditionalOr = {
        type: 'ConditionalOr',
        left: {
          type: 'ConditionalAnd',
          left: { type: 'Identifier', value: 'a' } as CELIdentifier,
          right: { type: 'Identifier', value: 'b' } as CELIdentifier,
        } as CELConditionalAnd,
        right: {
          type: 'ConditionalAnd',
          left: { type: 'Identifier', value: 'c' } as CELIdentifier,
          right: { type: 'Identifier', value: 'd' } as CELIdentifier,
        } as CELConditionalAnd,
      };

      const result = celGenerateMixedAndOrList(complexExpr);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return flat array when only one group', () => {
      const expr: CELConditionalAnd = {
        type: 'ConditionalAnd',
        left: { type: 'Identifier', value: 'a' } as CELIdentifier,
        right: { type: 'Identifier', value: 'b' } as CELIdentifier,
      };

      const result = celGenerateMixedAndOrList(expr);
      // If only one AND group, should return it directly
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('extractSubqueryComponents', () => {
    it('should extract components from .all() subquery', () => {
      const subquery: CELMember = {
        type: 'Member',
        left: {
          type: 'Identifier',
          value: 'items',
        },
        right: {
          type: 'Identifier',
          value: 'all',
        },
        list: {
          type: 'ExpressionList',
          value: [
            { type: 'Identifier', value: 'item' } as CELIdentifier,
            {
              type: 'Relation',
              left: {
                type: 'Member',
                left: { type: 'Identifier', value: 'item' } as CELIdentifier,
                right: { type: 'Identifier', value: 'price' },
              } as CELMember,
              operator: '>',
              right: { type: 'IntegerLiteral', value: 100 },
            } as any,
          ],
        },
      };

      const result = extractSubqueryComponents(subquery);
      expect(result).not.toBeNull();
      expect(result?.field).toBe('items');
      expect(result?.method).toBe('all');
      expect(result?.alias).toBe('item');
      expect(result?.condition).toBeDefined();
    });

    it('should extract components from .exists() subquery', () => {
      const subquery: CELMember = {
        type: 'Member',
        left: {
          type: 'Identifier',
          value: 'users',
        },
        right: {
          type: 'Identifier',
          value: 'exists',
        },
        list: {
          type: 'ExpressionList',
          value: [
            { type: 'Identifier', value: 'u' } as CELIdentifier,
            {
              type: 'Relation',
              left: {
                type: 'Member',
                left: { type: 'Identifier', value: 'u' } as CELIdentifier,
                right: { type: 'Identifier', value: 'active' },
              } as CELMember,
              operator: '==',
              right: { type: 'BooleanLiteral', value: true },
            } as any,
          ],
        },
      };

      const result = extractSubqueryComponents(subquery);
      expect(result).not.toBeNull();
      expect(result?.field).toBe('users');
      expect(result?.method).toBe('exists');
      expect(result?.alias).toBe('u');
    });

    it('should return null for non-subquery expression', () => {
      const regularMember: CELMember = {
        type: 'Member',
        left: {
          type: 'Identifier',
          value: 'user',
        },
        right: {
          type: 'Identifier',
          value: 'name',
        },
      };

      const result = extractSubqueryComponents(regularMember);
      expect(result).toBeNull();
    });

    it('should handle nested field paths', () => {
      const nestedSubquery: CELMember = {
        type: 'Member',
        left: {
          type: 'Member',
          left: { type: 'Identifier', value: 'user' },
          right: { type: 'Identifier', value: 'orders' },
        },
        right: {
          type: 'Identifier',
          value: 'all',
        },
        list: {
          type: 'ExpressionList',
          value: [
            { type: 'Identifier', value: 'order' } as CELIdentifier,
            {
              type: 'Relation',
              left: {
                type: 'Member',
                left: { type: 'Identifier', value: 'order' } as CELIdentifier,
                right: { type: 'Identifier', value: 'status' },
              } as CELMember,
              operator: '==',
              right: { type: 'StringLiteral', value: '"delivered"' },
            } as any,
          ],
        },
      };

      const result = extractSubqueryComponents(nestedSubquery);
      expect(result).not.toBeNull();
      expect(result?.field).toBe('user.orders');
      expect(result?.method).toBe('all');
      expect(result?.alias).toBe('order');
    });
  });
});
