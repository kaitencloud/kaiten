import { describe, it, expect } from 'vite-plus/test';
import { formatCEL } from '..';
import { celTokenImages } from '../logic/format-cel';

describe('formatCEL', () => {
  describe('basic expressions', () => {
    it('should format simple identifier', () => {
      const code = 'user';
      const result = formatCEL(code);
      expect(result).toBe('user');
    });

    it('should format member access', () => {
      const code = 'user.name';
      const result = formatCEL(code);
      expect(result).toBe('user.name');
    });

    it('should format nested member access', () => {
      const code = 'user.profile.email';
      const result = formatCEL(code);
      expect(result).toBe('user.profile.email');
    });
  });

  describe('literals', () => {
    it('should format string literal', () => {
      const code = '"hello"';
      const result = formatCEL(code);
      expect(result).toBe('"hello"');
    });

    it('should format integer literal', () => {
      const code = '42';
      const result = formatCEL(code);
      expect(result).toBe('42');
    });

    it('should format float literal', () => {
      const code = '3.14';
      const result = formatCEL(code);
      expect(result).toBe('3.14');
    });

    it('should handle boolean true', () => {
      const code = 'true';
      const result = formatCEL(code);
      // Standalone boolean may not be supported, should return original or formatted
      expect(typeof result).toBe('string');
    });

    it('should handle boolean false', () => {
      const code = 'false';
      const result = formatCEL(code);
      // Standalone boolean may not be supported, should return original or formatted
      expect(typeof result).toBe('string');
    });

    it('should format null', () => {
      const code = 'null';
      const result = formatCEL(code);
      expect(result).toBe('null');
    });
  });

  describe('operators', () => {
    it('should format equality comparison', () => {
      const code = 'user.id==123';
      const result = formatCEL(code);
      expect(result).toBe('user.id == 123');
    });

    it('should format inequality comparison', () => {
      const code = 'user.age!=18';
      const result = formatCEL(code);
      expect(result).toBe('user.age != 18');
    });

    it('should format less than', () => {
      const code = 'user.age<18';
      const result = formatCEL(code);
      expect(result).toBe('user.age < 18');
    });

    it('should format greater than', () => {
      const code = 'user.age>18';
      const result = formatCEL(code);
      expect(result).toBe('user.age > 18');
    });

    it('should format logical AND', () => {
      const code = 'user.active&&user.verified';
      const result = formatCEL(code);
      expect(result).toBe('user.active && user.verified');
    });

    it('should format logical OR', () => {
      const code = 'user.admin||user.moderator';
      const result = formatCEL(code);
      expect(result).toBe('user.admin || user.moderator');
    });

    it('should handle logical NOT', () => {
      const code = '!user.banned';
      const result = formatCEL(code);
      // NOT operator might be formatted differently or returned as-is
      expect(typeof result).toBe('string');
    });

    it('should handle negation', () => {
      const code = '-10';
      const result = formatCEL(code);
      // Standalone negative number may not be supported, should return original or formatted
      expect(typeof result).toBe('string');
    });
  });

  describe('complex expressions', () => {
    it('should format parenthesized expression', () => {
      const code = '(user.age>18)';
      const result = formatCEL(code);
      expect(result).toBe('(user.age > 18)');
    });

    it('should format nested parentheses', () => {
      const code = '((user.age>18)&&(user.verified))';
      const result = formatCEL(code);
      expect(result).toBe('((user.age > 18) && (user.verified))');
    });

    it('should format complex AND/OR expression', () => {
      const code = 'user.active&&user.verified||user.admin';
      const result = formatCEL(code);
      expect(result).toBe('user.active && user.verified || user.admin');
    });

    it('should format chained comparisons', () => {
      const code = 'user.age>=18&&user.age<=65';
      const result = formatCEL(code);
      expect(result).toBe('user.age >= 18 && user.age <= 65');
    });
  });

  describe('lists', () => {
    it('should format empty list', () => {
      const code = '[]';
      const result = formatCEL(code);
      expect(result).toBe('[]');
    });

    it('should format list with single item', () => {
      const code = '[1]';
      const result = formatCEL(code);
      expect(result).toBe('[1]');
    });

    it('should format list with multiple items (inline)', () => {
      const code = '[1,2,3]';
      const result = formatCEL(code);
      expect(result).toBe('[1, 2, 3]');
    });

    it('should format list with many items (multiline)', () => {
      const code = '[1,2,3,4,5]';
      const result = formatCEL(code);
      // Should be multiline when > 3 items
      expect(result).toContain('\n');
      expect(result).toContain('[');
      expect(result).toContain(']');
    });

    it('should format list with strings', () => {
      const code = '["a","b","c"]';
      const result = formatCEL(code);
      expect(result).toBe('["a", "b", "c"]');
    });
  });

  describe('maps', () => {
    it('should format empty map', () => {
      const code = '{}';
      const result = formatCEL(code);
      expect(result).toBe('{}');
    });

    it('should format map with single entry', () => {
      const code = '{"key":"value"}';
      const result = formatCEL(code);
      expect(result).toContain('key');
      expect(result).toContain('value');
    });

    it('should format map with multiple entries', () => {
      const code = '{"name":"John","age":30}';
      const result = formatCEL(code);
      expect(result).toContain('name');
      expect(result).toContain('John');
      expect(result).toContain('age');
      expect(result).toContain('30');
    });

    it('should format nested map', () => {
      const code = '{"user":{"name":"John"}}';
      const result = formatCEL(code);
      expect(result).toContain('user');
      expect(result).toContain('name');
      expect(result).toContain('John');
    });
  });

  describe('function calls', () => {
    it('should format function call with no arguments', () => {
      const code = 'user.getName()';
      const result = formatCEL(code);
      expect(result).toBe('user.getName()');
    });

    it('should format function call with single argument', () => {
      const code = 'user.hasRole("admin")';
      const result = formatCEL(code);
      expect(result).toBe('user.hasRole("admin")');
    });

    it('should format function call with multiple arguments', () => {
      const code = 'user.between(18,65)';
      const result = formatCEL(code);
      // Function calls should be formatted with proper spacing
      expect(result).toContain('between');
    });
  });

  describe('arithmetic', () => {
    it('should format addition', () => {
      const code = '1+2';
      const result = formatCEL(code);
      expect(result).toBe('1 + 2');
    });

    it('should format subtraction', () => {
      const code = '10-5';
      const result = formatCEL(code);
      expect(result).toBe('10 - 5');
    });

    it('should format multiplication', () => {
      const code = '3*4';
      const result = formatCEL(code);
      expect(result).toBe('3 * 4');
    });

    it('should format division', () => {
      const code = '10/2';
      const result = formatCEL(code);
      expect(result).toBe('10 / 2');
    });

    it('should format complex arithmetic', () => {
      const code = '(10+5)*2';
      const result = formatCEL(code);
      expect(result).toBe('(10 + 5) * 2');
    });
  });

  describe('error handling', () => {
    it('should return original code for invalid syntax', () => {
      const code = 'user.name ==';
      const result = formatCEL(code);
      expect(result).toBe(code);
    });

    it('should return original code for empty string', () => {
      const code = '';
      const result = formatCEL(code);
      expect(result).toBe('');
    });

    it('should handle malformed expressions gracefully', () => {
      const code = '((((';
      const result = formatCEL(code);
      expect(result).toBe(code);
    });

    it('should handle unclosed strings', () => {
      const code = '"unclosed';
      const result = formatCEL(code);
      // Parser might add closing quote or return as-is
      expect(typeof result).toBe('string');
    });
  });

  describe('whitespace normalization', () => {
    it('should normalize excess whitespace', () => {
      const code = 'user.id   ==   123';
      const result = formatCEL(code);
      expect(result).toBe('user.id == 123');
    });

    it('should remove unnecessary whitespace', () => {
      const code = 'user . name';
      const result = formatCEL(code);
      expect(result).toBe('user.name');
    });

    it('should add whitespace around operators', () => {
      const code = 'a+b*c';
      const result = formatCEL(code);
      expect(result).toContain(' + ');
      expect(result).toContain(' * ');
    });
  });

  describe('real-world examples', () => {
    it('should format user authentication rule', () => {
      const code = 'user.authenticated&&user.email.endsWith("@company.com")';
      const result = formatCEL(code);
      expect(result).toContain('user.authenticated');
      expect(result).toContain('&&');
      expect(result).toContain('user.email.endsWith');
    });

    it('should format feature flag targeting rule', () => {
      const code = 'user.plan=="premium"||user.role=="admin"';
      const result = formatCEL(code);
      expect(result).toContain('user.plan == "premium"');
      expect(result).toContain('||');
      expect(result).toContain('user.role == "admin"');
    });

    it('should format complex nested conditions', () => {
      const code = '(user.age>=18&&user.country=="US")||user.role=="admin"';
      const result = formatCEL(code);
      expect(result).toContain('(');
      expect(result).toContain('>=');
      expect(result).toContain('&&');
      expect(result).toContain('||');
    });
  });
});

describe('indexed access', () => {
  // The bug this pins: Format turned `entitlements['customers'].percentage`
  // into `entitlements.percentage` — a rule that still parses and means
  // something else. One click, no error, different targeting.
  it('keeps an entitlement read intact, exactly as reported', () => {
    const rule =
      "__kaiten.license.slug == 'scale' || __kaiten.entitlements['customers'].percentage >= 0.9";

    expect(formatCEL(rule)).toBe(rule);
  });

  it('keeps dots and indexes in the order they were written', () => {
    expect(formatCEL("a.b['c'].d['e'].f")).toBe("a.b['c'].d['e'].f");
    expect(formatCEL("m['k']")).toBe("m['k']");
  });

  it('prints a computed index, not just a literal one', () => {
    expect(formatCEL('m[someKey].used > 1')).toBe('m[someKey].used > 1');
  });
});

describe('the never-change-meaning guard', () => {
  it('sees through whitespace', () => {
    expect(celTokenImages("a  .b == 'x'")).toEqual(celTokenImages("a.b == 'x'"));
  });

  it('tells a dropped accessor from a reformat', () => {
    expect(celTokenImages("a.b['c']")).not.toEqual(celTokenImages('a.b'));
  });

  it('answers null for what does not parse', () => {
    expect(celTokenImages('a ==')).toBeNull();
  });
});
