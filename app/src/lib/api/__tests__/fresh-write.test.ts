import { describe, expect, it, vi } from 'vite-plus/test';
import { isSameField, mergeChangedFields, writeOnFresh } from '../fresh-write';

type Body = {
  description: string;
  isDefault: boolean;
  name: string;
  tags?: string[];
  trialDays?: number;
};

const opened: Body = {
  description: 'As opened',
  isDefault: false,
  name: 'Standard',
  trialDays: 7,
};

describe('isSameField', () => {
  it('compares primitives by value', () => {
    expect(isSameField('a', 'a')).toBe(true);
    expect(isSameField('a', 'b')).toBe(false);
    expect(isSameField(0, 0)).toBe(true);
    expect(isSameField(0, '')).toBe(false);
    expect(isSameField(false, 0)).toBe(false);
  });

  it('reads an absent member and a null as the same', () => {
    expect(isSameField(undefined, null)).toBe(true);
    expect(isSameField(undefined, undefined)).toBe(true);
    expect(isSameField(undefined, '')).toBe(false);
    expect(isSameField(null, 0)).toBe(false);
  });

  it('compares arrays and objects by what they hold, not by identity', () => {
    expect(isSameField(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(isSameField(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(isSameField(['a'], ['a', 'b'])).toBe(false);
    expect(isSameField([], {})).toBe(false);
    expect(isSameField({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(isSameField({ a: 1 }, { a: 2 })).toBe(false);
    expect(isSameField({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });
});

describe('mergeChangedFields', () => {
  it('sends what the form changed on top of what the API holds now', () => {
    const fresh: Body = {
      ...opened,
      description: 'Changed elsewhere',
      isDefault: true,
    };
    const edited: Body = { ...opened, trialDays: 14 };

    expect(mergeChangedFields({ edited, fresh, opened })).toEqual({
      description: 'Changed elsewhere',
      isDefault: true,
      name: 'Standard',
      trialDays: 14,
    });
  });

  it('keeps the value of the API for every member the form left alone', () => {
    const fresh: Body = { ...opened, name: 'Renamed elsewhere' };

    expect(mergeChangedFields({ edited: opened, fresh, opened })).toEqual(
      fresh,
    );
  });

  it('lets the form win on a member both changed', () => {
    const fresh: Body = { ...opened, name: 'Elsewhere' };
    const edited: Body = { ...opened, name: 'Here' };

    expect(mergeChangedFields({ edited, fresh, opened }).name).toBe('Here');
  });

  it('applies a change to a value that the object did not hold when it opened', () => {
    const edited: Body = { ...opened, tags: ['a'] };

    expect(
      mergeChangedFields({ edited, fresh: opened, opened }).tags,
    ).toEqual(['a']);
  });

  it('takes a member off the result when the form changed it to nothing', () => {
    const fresh: Body = { ...opened, trialDays: 30 };
    const edited: Body = { ...opened, trialDays: undefined };
    const merged = mergeChangedFields({ edited, fresh, opened });

    expect(merged).not.toHaveProperty('trialDays');
    expect(merged.name).toBe('Standard');
  });

  it('treats a rebuilt array as unchanged when it holds the same', () => {
    const withTags: Body = { ...opened, tags: ['a', 'b'] };
    const fresh: Body = { ...withTags, tags: ['c'] };
    const edited: Body = { ...withTags, tags: ['a', 'b'] };

    expect(
      mergeChangedFields({ edited, fresh, opened: withTags }).tags,
    ).toEqual(['c']);
  });

  it('replaces a nested object or an array whole when the form changed any part of it', () => {
    type WithMetadata = { metadata: Record<string, string>; name: string };
    const openedMetadata: WithMetadata = {
      metadata: { region: 'eu' },
      name: 'Standard',
    };
    // Another tab added a key and renamed; the form changed another key.
    const fresh: WithMetadata = {
      metadata: { region: 'eu', tier: 'gold' },
      name: 'Renamed elsewhere',
    };
    const edited: WithMetadata = {
      metadata: { region: 'us' },
      name: 'Standard',
    };

    expect(
      mergeChangedFields({ edited, fresh, opened: openedMetadata }),
    ).toEqual({ metadata: { region: 'us' }, name: 'Renamed elsewhere' });
  });

  it('does not mutate its inputs', () => {
    const fresh: Body = { ...opened, name: 'Elsewhere' };
    const edited: Body = { ...opened, trialDays: 14 };
    const copies = structuredClone({ edited, fresh, opened });

    mergeChangedFields({ edited, fresh, opened });

    expect({ edited, fresh, opened }).toEqual(copies);
  });
});

describe('writeOnFresh', () => {
  const restate = (object: Body): Body => object;

  it('reads, then writes the merged body, and returns what the write answered', async () => {
    const calls: string[] = [];
    const fresh: Body = { ...opened, description: 'Changed elsewhere' };
    const read = vi.fn(async () => {
      calls.push('read');

      return fresh;
    });
    const write = vi.fn(async (body: Body) => {
      calls.push('write');

      return { saved: body.name };
    });

    const result = await writeOnFresh({
      edited: { ...opened, name: 'Here' },
      opened,
      read,
      restate,
      write,
    });

    expect(calls).toEqual(['read', 'write']);
    expect(write).toHaveBeenCalledExactlyOnceWith({
      ...fresh,
      name: 'Here',
    });
    expect(result).toEqual({ saved: 'Here' });
  });

  it('writes nothing when the read refuses, and passes the refusal on', async () => {
    const gone = new Error('not found');
    const write = vi.fn();

    await expect(
      writeOnFresh({
        edited: opened,
        opened,
        read: () => Promise.reject(gone),
        restate,
        write,
      }),
    ).rejects.toBe(gone);
    expect(write).not.toHaveBeenCalled();
  });

  it('passes on the refusal of the write', async () => {
    const refused = new Error('refused');

    await expect(
      writeOnFresh({
        edited: opened,
        opened,
        read: async () => opened,
        restate,
        write: () => Promise.reject(refused),
      }),
    ).rejects.toBe(refused);
  });
});
