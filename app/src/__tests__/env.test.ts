import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  DEFAULT_LOCAL_API_URL,
  resolveApiUrl,
  default as env,
} from '../env';

describe('env', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should export MODE from import.meta.env.MODE', () => {
    expect(env).toHaveProperty('MODE');
    expect(typeof env.MODE).toBe('string');
  });

  it('should export API_URL from import.meta.env.VITE_API_URL', () => {
    expect(env).toHaveProperty('API_URL');
    expect(env.API_URL).not.toBe('');
  });

  it('should export CLERK_PUBLISHABLE_KEY from import.meta.env.VITE_CLERK_PUBLISHABLE_KEY', () => {
    expect(env).toHaveProperty('CLERK_PUBLISHABLE_KEY');
  });

  it('should have all required environment variables', () => {
    const requiredKeys = ['MODE', 'API_URL', 'CLERK_PUBLISHABLE_KEY'];
    const envKeys = Object.keys(env);

    requiredKeys.forEach((key) => {
      expect(envKeys).toContain(key);
    });
  });

  it('should export exactly 5 environment variables', () => {
    expect(Object.keys(env)).toHaveLength(5);
  });

  it('never reports an unsubstituted placeholder as a platform flag source', () => {
    // A self-hosted build sets neither of these, and the entrypoint leaves the
    // envsubst placeholder in place when it has nothing to substitute. Reading
    // that literal as a URL would send every flag evaluation to a host named
    // `${VITE_KAITEN_PLATFORM_API_URL}`; it has to read as "no platform source"
    // instead.
    //
    // Asserted as "a string that is not a placeholder" rather than "empty",
    // because pointing a local app at a stack through app/.env.local is a
    // supported thing to do and must not fail the suite.
    for (const value of [env.PLATFORM_API_URL, env.PLATFORM_FLAGS_TOKEN]) {
      expect(typeof value).toBe('string');
      expect(value).not.toContain('VITE_');
    }
  });

  it('should be an object', () => {
    expect(typeof env).toBe('object');
    expect(env).not.toBeNull();
  });

  it('uses the runtime URL before the build-time URL', () => {
    expect(
      resolveApiUrl(
        'https://runtime.example/api/',
        'https://build.example/api',
        'production',
      ),
    ).toBe('https://runtime.example/api');
  });

  it('uses the local API outside production when no URL is configured', () => {
    expect(resolveApiUrl('${VITE_API_URL}', '', 'test')).toBe(
      DEFAULT_LOCAL_API_URL,
    );
  });

  it('fails fast in production when no API URL is configured', () => {
    expect(() => resolveApiUrl('${VITE_API_URL}', '', 'production')).toThrow(
      'VITE_API_URL is required in production',
    );
  });

  it('should have MODE set to "test" in test environment', () => {
    expect(env.MODE).toBe('test');
  });
});
