/**
 * The write of an API that replaces an object as a whole (a full `PUT`) and has
 * no version check: it takes the whole object, so a form that sends the object it
 * read when it opened also sends back, unasked, every member somebody else has
 * changed since. These two functions keep that from happening.
 *
 * A full PUT re-reads first and sends only what the form changed. That narrows
 * the race to the time between the re-read and the write; it does not remove it:
 * until the API checks a version, the last writer wins.
 */

type Fields = Record<string, unknown>;

/**
 * The options of the read that precedes a write: it goes to the network and not
 * to the HTTP cache either, since a stale answer is what the read is there to avoid.
 * Spread them into the options of the generated GET.
 */
export const FRESH_READ_OPTIONS = { cache: 'no-store' } as const;

const isPlainObject = (value: unknown): value is Fields =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

/**
 * Whether two members of a body say the same thing. Structural, so that a nested
 * object or an array that was rebuilt compares by what it holds. A member that is
 * absent (`undefined`) and one that is `null` are the same: the API ignores a
 * `null` and treats an absent member alike, so neither is a change.
 */
export function isSameField(left: unknown, right: unknown): boolean {
  if (left == null || right == null) {
    return left == null && right == null;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => isSameField(item, right[index]))
    );
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

    return [...keys].every((key) => isSameField(left[key], right[key]));
  }

  return Object.is(left, right);
}

type MergeInput<TBody extends object> = {
  /** What the form sends: the body it would have PUT before this rule. */
  edited: TBody;
  /** The object as the API holds it now, restated as a body. */
  fresh: TBody;
  /** What the form opened with, restated as a body by the same function as `edited`. */
  opened: TBody;
};

/**
 * The body to send: `fresh`, with on top of it each member of `edited` that
 * differs from `opened`, which is to say each member the form changed. A member
 * the form did not change keeps the value it has now, which may be somebody
 * else's. A member the form changed to nothing is taken off the result.
 *
 * `edited` and `opened` must come out of the same function, called on the same
 * object, so that they differ only where the form does.
 */
export function mergeChangedFields<TBody extends object>({
  edited,
  fresh,
  opened,
}: MergeInput<TBody>): TBody {
  const merged: Fields = { ...(fresh as Fields) };
  const editedFields = edited as Fields;
  const openedFields = opened as Fields;
  const keys = new Set([
    ...Object.keys(editedFields),
    ...Object.keys(openedFields),
  ]);

  for (const key of keys) {
    if (isSameField(editedFields[key], openedFields[key])) {
      continue;
    }
    if (editedFields[key] === undefined) {
      delete merged[key];
    } else {
      merged[key] = editedFields[key];
    }
  }

  return merged as TBody;
}

type WriteOnFreshOptions<TObject, TBody extends object, TResult> = {
  /** What the form sends: the body it would have PUT before this rule. */
  edited: TBody;
  /** What the form opened with, restated as a body by the function that built `edited`. */
  opened: TBody;
  /**
   * Reads the object from the API, not from a cache. It rejects when the object is
   * gone, and then nothing is written: a PUT on a deleted object could create it again.
   */
  read: () => Promise<TObject>;
  /** The body that restates an object as it stands, the shape `edited` and `opened` have. */
  restate: (object: TObject) => TBody;
  /** The PUT. */
  write: (body: TBody) => Promise<TResult>;
};

/**
 * Reads the object, applies the form's changes on top of what was read
 * (`mergeChangedFields`) and writes that. The caller updates its caches from the
 * result, as it does for a write that did not re-read.
 *
 * The read's refusal, a 404 for an object deleted meanwhile, is the write's
 * refusal: it reaches the caller as it would have from the PUT.
 */
export async function writeOnFresh<TObject, TBody extends object, TResult>({
  edited,
  opened,
  read,
  restate,
  write,
}: WriteOnFreshOptions<TObject, TBody, TResult>): Promise<TResult> {
  const fresh = restate(await read());

  return write(mergeChangedFields({ edited, fresh, opened }));
}
