/**
 * The codec of the values a form recovery stores. JSON turns `NaN` into
 * `null`, drops `undefined` and writes a `Date` as a string, and a form holds
 * all three (an empty number field is `NaN`, a date picker holds a `Date`).
 * Each is written as a tagged object and read back as itself.
 */

/** A value that cannot be stored: a file, a function, a cycle. */
export class FormRecoverySerializationError extends Error {
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`Cannot store the value at "${path}": ${reason}`);
    this.name = 'FormRecoverySerializationError';
    this.path = path;
  }
}

const TAG_NUMBER = '$num';
const TAG_UNDEFINED = '$undef';
const TAG_DATE = '$date';
const TAG_DAY = '$day';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/** The local calendar day of a date set at local midnight, else null. */
function localMidnightDay(date: Date): string | null {
  if (
    date.getHours() !== 0 ||
    date.getMinutes() !== 0 ||
    date.getSeconds() !== 0 ||
    date.getMilliseconds() !== 0
  ) {
    return null;
  }
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function encodeDate(date: Date): Json {
  if (Number.isNaN(date.getTime())) {
    return { [TAG_DATE]: null };
  }
  const day = localMidnightDay(date);
  return day === null
    ? { [TAG_DATE]: date.toISOString() }
    : { [TAG_DATE]: date.toISOString(), [TAG_DAY]: day };
}

function encodeNumber(value: number): Json {
  if (Number.isFinite(value)) {
    return value;
  }
  if (Number.isNaN(value)) {
    return { [TAG_NUMBER]: 'NaN' };
  }
  return { [TAG_NUMBER]: value > 0 ? 'Infinity' : '-Infinity' };
}

function isBinary(value: unknown): boolean {
  return (
    (typeof Blob !== 'undefined' && value instanceof Blob) ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  );
}

function encodeNode(value: unknown, path: string, seen: Set<object>): Json {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      return encodeNumber(value);
    case 'undefined':
      return { [TAG_UNDEFINED]: 1 };
    case 'function':
    case 'symbol':
    case 'bigint':
      throw new FormRecoverySerializationError(path, `a ${typeof value}`);
    default:
      break;
  }

  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return encodeDate(value);
  }
  if (isBinary(value)) {
    throw new FormRecoverySerializationError(path, 'a file or binary value');
  }
  if (seen.has(value as object)) {
    throw new FormRecoverySerializationError(path, 'a circular reference');
  }
  seen.add(value as object);

  try {
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        encodeNode(item, `${path}[${index}]`, seen),
      );
    }
    if (isPlainObject(value)) {
      const encoded: { [key: string]: Json } = {};
      for (const [key, item] of Object.entries(value)) {
        encoded[key] = encodeNode(
          item,
          path === '' ? key : `${path}.${key}`,
          seen,
        );
      }
      return encoded;
    }
  } finally {
    seen.delete(value as object);
  }

  throw new FormRecoverySerializationError(path, 'an object of a class');
}

/** Throws a {@link FormRecoverySerializationError} for what cannot be stored. */
export function encodePayload(value: unknown): string {
  return JSON.stringify(encodeNode(value, '', new Set()));
}

function localDay(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) {
    return null;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function decodeTagged(node: Record<string, unknown>): {
  value: unknown;
} | null {
  const keys = Object.keys(node);

  if (keys.length === 1 && keys[0] === TAG_NUMBER) {
    const tag = node[TAG_NUMBER];
    if (tag === 'NaN') return { value: Number.NaN };
    if (tag === 'Infinity') return { value: Number.POSITIVE_INFINITY };
    if (tag === '-Infinity') return { value: Number.NEGATIVE_INFINITY };
    return null;
  }

  if (keys.length === 1 && keys[0] === TAG_UNDEFINED) {
    return { value: undefined };
  }

  if (
    keys.includes(TAG_DATE) &&
    keys.every((key) => key === TAG_DATE || key === TAG_DAY)
  ) {
    const instant = node[TAG_DATE];
    const day = node[TAG_DAY];
    if (typeof day === 'string') {
      const local = localDay(day);
      if (local) {
        return { value: local };
      }
    }
    return {
      value: typeof instant === 'string' ? new Date(instant) : new Date(NaN),
    };
  }

  return null;
}

function decodeNode(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(decodeNode);
  }
  if (typeof node === 'object' && node !== null) {
    const record = node as Record<string, unknown>;
    const tagged = decodeTagged(record);
    if (tagged) {
      return tagged.value;
    }
    const decoded: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) {
      decoded[key] = decodeNode(item);
    }
    return decoded;
  }
  return node;
}

/** Throws on text that is not JSON, like `JSON.parse`. */
export function decodePayload(text: string): unknown {
  return decodeNode(JSON.parse(text));
}
