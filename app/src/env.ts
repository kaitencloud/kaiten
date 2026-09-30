const runtimeEnv = {
  // oxlint-disable-next-line no-template-curly-in-string -- intentional envsubst placeholder replaced at container startup
  VITE_API_URL: '${VITE_API_URL}',
  // oxlint-disable-next-line no-template-curly-in-string -- intentional envsubst placeholder replaced at container startup
  VITE_CLERK_PUBLISHABLE_KEY: '${VITE_CLERK_PUBLISHABLE_KEY}',
  // oxlint-disable-next-line no-template-curly-in-string -- intentional envsubst placeholder replaced at container startup
  VITE_KAITEN_PLATFORM_API_URL: '${VITE_KAITEN_PLATFORM_API_URL}',
  // oxlint-disable-next-line no-template-curly-in-string -- intentional envsubst placeholder replaced at container startup
  VITE_KAITEN_PLATFORM_FLAGS_TOKEN: '${VITE_KAITEN_PLATFORM_FLAGS_TOKEN}',
};

// Only reached by a bare `pnpm dev`: the repo's `task app` derives VITE_API_URL
// from KAITEN_PORT and a second stack on a second port gets its own value. 6060
// is KAITEN_PORT's default in .env.example, so this matches the stack a plain
// `task up` starts. It said 3001 for a while after Envoy moved off that port,
// which is a fallback pointing at a port nothing listens on -- every request a
// connection error rather than a 404, and nothing naming the port as the reason.
//
// Keep this off 6000, and off the browsers' blocked-port list generally. 6000 is
// X11, which Chromium, Firefox and Safari all refuse: the request fails with
// ERR_UNSAFE_PORT inside the browser, before it reaches the network. That is
// worse than the stale-port case above, because there is no server-side symptom
// at all -- Envoy is up and answering curl while every call from the app fails.
// This default was 6000 and produced exactly that.
export const DEFAULT_LOCAL_API_URL = 'http://localhost:6060/api';

function resolveRuntimeValue(
  runtimeValue: string,
  buildValue: string | undefined,
): string {
  const resolvedRuntimeValue = runtimeValue.includes('VITE_')
    ? ''
    : runtimeValue.trim();
  return resolvedRuntimeValue || buildValue?.trim() || '';
}

export function resolveApiUrl(
  runtimeValue: string,
  buildValue: string | undefined,
  mode: string,
): string {
  const apiUrl = resolveRuntimeValue(runtimeValue, buildValue);

  if (apiUrl) {
    return apiUrl.replace(/\/+$/, '');
  }

  if (mode === 'production') {
    throw new Error(
      'VITE_API_URL is required in production (expected a URL ending in /api).',
    );
  }

  return DEFAULT_LOCAL_API_URL;
}

export default {
  MODE: import.meta.env.MODE,
  API_URL: resolveApiUrl(
    runtimeEnv.VITE_API_URL,
    import.meta.env.VITE_API_URL,
    import.meta.env.MODE,
  ),
  CLERK_PUBLISHABLE_KEY: resolveRuntimeValue(
    runtimeEnv.VITE_CLERK_PUBLISHABLE_KEY,
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  ),
  // The Kaiten deployment this app's own platform flags (`demo-sandbox`) are
  // evaluated against, and a `read:feature_flags` token for it. Both are public
  // by design: the token is shipped to every browser, so it must never carry
  // more than that one scope. Unset on self-hosted builds, where every platform
  // flag reads as off.
  PLATFORM_API_URL: resolveRuntimeValue(
    runtimeEnv.VITE_KAITEN_PLATFORM_API_URL,
    import.meta.env.VITE_KAITEN_PLATFORM_API_URL,
  ).replace(/\/+$/, ''),
  PLATFORM_FLAGS_TOKEN: resolveRuntimeValue(
    runtimeEnv.VITE_KAITEN_PLATFORM_FLAGS_TOKEN,
    import.meta.env.VITE_KAITEN_PLATFORM_FLAGS_TOKEN,
  ),
};
