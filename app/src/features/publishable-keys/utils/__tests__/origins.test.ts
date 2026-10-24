import { describe, expect, it } from 'vite-plus/test';
import { zPublishableKeyDraft } from '@/api-client/zod.gen';
import {
  MAX_ORIGINS,
  normalizeOrigin,
  originsToText,
  parseOrigins,
} from '../origins';

describe('normalizeOrigin', () => {
  it.each([
    ['https://shop.acme.test', 'https://shop.acme.test'],
    ['https://Shop.Acme.test', 'https://shop.acme.test'],
    ['https://shop.acme.test:8443', 'https://shop.acme.test:8443'],
    ['http://localhost', 'http://localhost'],
    ['http://localhost:5173', 'http://localhost:5173'],
    ['http://127.0.0.1:3000', 'http://127.0.0.1:3000'],
    ['http://[::1]:3000', 'http://[::1]:3000'],
    ['  https://shop.acme.test  ', 'https://shop.acme.test'],
  ])('reads %s as the origin %s', (text, origin) => {
    expect(normalizeOrigin(text)).toBe(origin);
  });

  it.each([
    ['http://shop.acme.test', 'http for a host that is not this machine'],
    ['https://shop.acme.test/', 'a path, even a lone slash'],
    ['https://shop.acme.test/pricing', 'a path'],
    ['https://shop.acme.test?plan=pro', 'a query'],
    ['https://shop.acme.test#top', 'a fragment'],
    ['https://user@shop.acme.test', 'a user'],
    ['shop.acme.test', 'no scheme'],
    ['ftp://shop.acme.test', 'another scheme'],
    ['https://', 'no host'],
    ['https://shop acme.test', 'a space in the host'],
    ['https://shop.acme.test:port', 'a port that is no number'],
    ['', 'nothing'],
  ])('refuses %s: %s', (text) => {
    expect(normalizeOrigin(text)).toBeUndefined();
  });
});

describe('parseOrigins', () => {
  it('reads one origin to a line, a space or a comma, each kept once in the order typed', () => {
    expect(
      parseOrigins(
        'https://b.acme.test\nhttps://a.acme.test, http://localhost:5173 https://B.acme.test\n\n',
      ),
    ).toEqual({
      origins: [
        'https://b.acme.test',
        'https://a.acme.test',
        'http://localhost:5173',
      ],
      rejected: [],
    });
  });

  it('names what is no origin, as it was typed, and keeps the rest', () => {
    expect(
      parseOrigins(
        'http://shop.acme.test\nhttps://shop.acme.test/\nhttp://localhost:5173\nhttps://shop.acme.test',
      ),
    ).toEqual({
      origins: ['http://localhost:5173', 'https://shop.acme.test'],
      rejected: ['http://shop.acme.test', 'https://shop.acme.test/'],
    });
  });

  it('reads an empty field as no origin at all', () => {
    expect(parseOrigins('  \n ')).toEqual({ origins: [], rejected: [] });
  });
});

describe('originsToText', () => {
  it('puts the origins of a key one to a line, and reads back as they were', () => {
    const origins = ['https://a.acme.test', 'http://localhost:5173'];

    expect(originsToText(origins)).toBe(
      'https://a.acme.test\nhttp://localhost:5173',
    );
    expect(parseOrigins(originsToText(origins)).origins).toEqual(origins);
  });
});

describe('the bounds of the contract', () => {
  it('holds a key to the most origins the API takes', () => {
    const at = (count: number) => ({
      allowedOrigins: Array.from({ length: count }, () => 'https://a.acme.test'),
      label: 'pricing',
    });

    expect(zPublishableKeyDraft.safeParse(at(MAX_ORIGINS)).success).toBe(true);
    expect(zPublishableKeyDraft.safeParse(at(MAX_ORIGINS + 1)).success).toBe(
      false,
    );
  });
});
