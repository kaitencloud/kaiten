import { describe, expect, it } from 'vite-plus/test';
import { decodeGrantedScopes, hasScope } from '../granted-scopes';

const encode = (value: unknown) =>
  btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const jwt = (claims: unknown) =>
  `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.signature`;

describe('decodeGrantedScopes', () => {
  it('reads the scopes claim of a token', () => {
    expect(
      decodeGrantedScopes(jwt({ scopes: ['read:billing', 'write:licenses'] })),
    ).toEqual(['read:billing', 'write:licenses']);
  });

  it('reads the wildcards the local dev tokens carry', () => {
    expect(decodeGrantedScopes(jwt({ scopes: ['read:*', 'write:*'] }))).toEqual(
      ['read:*', 'write:*'],
    );
  });

  it('reads a claim written as one string', () => {
    expect(
      decodeGrantedScopes(jwt({ scopes: 'read:billing write:billing,read:customers' })),
    ).toEqual(['read:billing', 'write:billing', 'read:customers']);
  });

  it('keeps only what reads as a scope', () => {
    expect(
      decodeGrantedScopes(jwt({ scopes: ['read:billing', 'openid', 42, ''] })),
    ).toEqual(['read:billing']);
  });

  it('reads a payload with characters beyond ASCII', () => {
    expect(
      decodeGrantedScopes(jwt({ name: 'Zoë', scopes: ['read:billing'] })),
    ).toEqual(['read:billing']);
  });

  it.each<[string, string | null | undefined]>([
    ['no token', undefined],
    ['an empty token', ''],
    ['a token that is not a JWT', 'not-a-jwt'],
    ['a payload that is not JSON', 'a.b.c'],
    ['a token with no scopes claim', jwt({ sub: 'user_1' })],
    ['a token whose claim holds no scope', jwt({ scopes: ['openid'] })],
  ])('leaves the scopes unknown for %s', (_, token) => {
    expect(decodeGrantedScopes(token)).toBeNull();
  });
});

describe('hasScope', () => {
  it('matches the scope itself', () => {
    expect(hasScope(['write:billing'], 'write:billing')).toBe(true);
    expect(hasScope(['read:billing'], 'write:billing')).toBe(false);
  });

  it('lets write imply read, but not the other way round', () => {
    expect(hasScope(['write:billing'], 'read:billing')).toBe(true);
    expect(hasScope(['write:licenses'], 'read:billing')).toBe(false);
  });

  it('lets the wildcards cover every module, as the API does', () => {
    expect(hasScope(['write:*'], 'write:billing')).toBe(true);
    expect(hasScope(['write:*'], 'read:billing')).toBe(true);
    expect(hasScope(['read:*'], 'read:billing')).toBe(true);
    expect(hasScope(['read:*'], 'write:billing')).toBe(false);
  });

  it('offers everything while the scopes are unknown, and the API decides', () => {
    expect(hasScope(null, 'write:billing')).toBe(true);
  });

  it('refuses everything to a token with no scope at all', () => {
    expect(hasScope([], 'read:billing')).toBe(false);
  });
});
