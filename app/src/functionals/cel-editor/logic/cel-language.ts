import type { languages } from 'monaco-editor';
import type { CelValueType } from '../types/cel-context.types';

/**
 * The vocabulary below is what the server's CEL environment actually accepts,
 * checked against it rather than copied from CEL's documentation.
 *
 * That distinction cost something: this list used to offer `toLowerCase`,
 * `toUpperCase`, `trim`, `split` and `substring`, which belong to cel-go's
 * strings extension. The evaluator does not enable it (see celEnv), so every
 * one of them was a suggestion the editor made and the save refused.
 */

/**
 * Words CEL reserves. They cannot be identifiers and cannot be called, so they
 * are highlighted — writing one is a mistake worth seeing — and deliberately
 * never suggested. They used to be offered as completions, which proposed
 * `while` and `import` inside a boolean expression.
 */
export const CEL_RESERVED_WORDS = [
  'as',
  'break',
  'const',
  'continue',
  'else',
  'for',
  'function',
  'if',
  'import',
  'let',
  'loop',
  'namespace',
  'package',
  'return',
  'var',
  'void',
  'while',
];

/** Values that are written as words. */
export const CEL_LITERALS = ['true', 'false', 'null'];

/** Operators that are written as words. */
export const CEL_OPERATOR_KEYWORDS = ['in'];

/** Macros called on their own, not on a value. */
export const CEL_GLOBAL_MACROS = ['has'];

/** Macros called on a collection, each taking an iteration variable. */
export const CEL_MEMBER_MACROS = [
  'all',
  'exists',
  'exists_one',
  'map',
  'filter',
];

/** Functions called on their own, not on a value. */
export const CEL_GLOBAL_FUNCTIONS = [
  'size',
  'int',
  'uint',
  'double',
  'string',
  'bytes',
  'type',
  'dyn',
  'duration',
  'timestamp',
];

const CEL_STRING_FUNCTIONS = [
  'startsWith',
  'endsWith',
  'contains',
  'matches',
  'size',
];

const CEL_TIMESTAMP_FUNCTIONS = [
  'getDate',
  'getDayOfMonth',
  'getDayOfWeek',
  'getFullYear',
  'getHours',
  'getMilliseconds',
  'getMinutes',
  'getMonth',
  'getSeconds',
];

const CEL_COLLECTION_FUNCTIONS = ['size'];

/**
 * The functions worth offering on a value of the given type.
 *
 * A number and a boolean get none: CEL has member functions they would accept
 * in principle, but nothing an author writes in a targeting rule. `dyn` gets
 * everything, because a value nobody declared a shape for could be any of
 * them, and refusing to suggest is worse than suggesting too much.
 */
export function memberFunctionsFor(type: CelValueType): string[] {
  switch (type) {
    case 'string':
      return CEL_STRING_FUNCTIONS;
    case 'object':
    case 'map':
      return CEL_COLLECTION_FUNCTIONS;
    case 'dyn':
      return [
        ...new Set([
          ...CEL_STRING_FUNCTIONS,
          ...CEL_TIMESTAMP_FUNCTIONS,
          ...CEL_COLLECTION_FUNCTIONS,
        ]),
      ];
    default:
      return [];
  }
}

/**
 * Whether a value of this type can be iterated, which is what the member
 * macros need. An object is a map at evaluation, so both answer yes.
 */
export function isIterable(type: CelValueType): boolean {
  return type === 'map' || type === 'object' || type === 'dyn';
}

/** Callables that take nothing. */
const ZERO_ARGUMENT = new Set(['size', ...CEL_TIMESTAMP_FUNCTIONS]);

/** Callables that take a value and a predicate over it. */
const ITERATING = new Set(CEL_MEMBER_MACROS);

/** Callables whose one argument is text. */
const TEXT_ARGUMENT = new Set([
  'startsWith',
  'endsWith',
  'contains',
  'matches',
]);

/**
 * What to write after the name when a callable is accepted, as a snippet.
 *
 * The point is that accepting a suggestion leaves the caret where the next
 * thing to type goes, rather than after a name the author still has to open
 * brackets on. `${n:...}` are the tab stops.
 */
export function callSnippet(name: string): string {
  if (ZERO_ARGUMENT.has(name)) return '()';
  if (ITERATING.has(name)) return '(${1:item}, ${2:condition})';
  if (TEXT_ARGUMENT.has(name)) return "(${1:'value'})";
  if (name === 'has') return '(${1:field})';

  return '(${1})';
}

/** Every word the tokenizer highlights as a keyword. */
const HIGHLIGHTED_KEYWORDS = [
  ...CEL_LITERALS,
  ...CEL_OPERATOR_KEYWORDS,
  ...CEL_RESERVED_WORDS,
];

const HIGHLIGHTED_FUNCTIONS = [
  ...new Set([
    ...CEL_GLOBAL_FUNCTIONS,
    ...CEL_STRING_FUNCTIONS,
    ...CEL_TIMESTAMP_FUNCTIONS,
  ]),
];

export const celLanguageDef: languages.IMonarchLanguage = {
  keywords: HIGHLIGHTED_KEYWORDS,

  macros: [...CEL_GLOBAL_MACROS, ...CEL_MEMBER_MACROS],

  functions: HIGHLIGHTED_FUNCTIONS,

  operators: [
    '=',
    '>',
    '<',
    '!',
    '~',
    '?',
    ':',
    '==',
    '<=',
    '>=',
    '!=',
    '&&',
    '||',
    '+',
    '-',
    '*',
    '/',
    '%',
    '^',
  ],

  symbols: /[=><!~?:&|+\-*/^%]+/,

  tokenizer: {
    root: [
      // Identifiers and functions
      [
        /[a-zA-Z_]\w*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@macros': 'type.identifier',
            '@functions': 'type.identifier',
            '@default': 'identifier',
          },
        },
      ],

      // Whitespace
      { include: '@whitespace' },

      // Strings
      [/r"/, { token: 'string.quote', next: '@rawString' }],
      [/"/, { token: 'string.quote', next: '@string' }],
      [/'/, { token: 'string.quote', next: '@stringSingle' }],

      // Numbers
      [/\d+[hm]/, 'number'], // Duration
      [/\d+\.\d+([eE][-+]?\d+)?/, 'number.float'],
      [/\d+/, 'number'],

      // Delimiters
      [/[{}()[\]]/, '@brackets'],
      [/[<>](?!@symbols)/, '@brackets'],

      // Operators
      [
        /@symbols/,
        {
          cases: {
            '@operators': 'delimiter',
            '@default': '',
          },
        },
      ],
    ],

    whitespace: [
      [/\s+/, 'white'],
      [/(\/\/).*$/, 'comment'],
    ],

    string: [
      [/"/, { token: 'string.quote', next: '@pop' }],
      [/\\./, 'constant.character.escape'],
      [/./, 'string'],
    ],

    rawString: [
      [/"/, { token: 'string.quote', next: '@pop' }],
      [/./, 'string'],
    ],

    stringSingle: [
      [/'/, { token: 'string.quote', next: '@pop' }],
      [/\\./, 'constant.character.escape'],
      [/./, 'string'],
    ],
  },
};
