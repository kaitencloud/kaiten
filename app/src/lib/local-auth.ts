export type DevToken = {
  user_id: string;
  user_name: string;
  email: string;
  org_id: string;
  org_name: string;
  /**
   * Auth-provider org id (`org_dogfooding`, `org_tmnt_hq`…). `org_id` above is
   * DERIVED from it, so it moves whenever the derivation does; this is the
   * stable half of the pair and the only one worth matching on.
   *
   * Optional because tokens generated before the seeder emitted it are still
   * valid.
   */
  org_external_id?: string;
  token: string;
};

const STORAGE_KEY = 'kaiten_dev_token';

/**
 * The cookie the local stack's notification stream authenticates with.
 *
 * `EventSource` cannot set an Authorization header, so in a deployed
 * environment that stream's gateway route reads the session cookie the identity
 * provider already set (`__session`, see charts/kaiten). The local stack has no
 * such provider -- the dev token lives in localStorage, which a cookie-reading
 * proxy cannot see -- so selecting a dev token mirrors it into the same cookie
 * name, and the local Envoy validates it exactly as the deployed one does.
 *
 * Local only: nothing outside `VITE_LOCAL_AUTH` writes this.
 */
const SESSION_COOKIE = '__session';

function writeSessionCookie(token: string): void {
  // No Secure: the local stack is http. SameSite=Lax is what a session cookie
  // should be, and the stream is same-origin.
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
}

export function getStoredDevToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function hasStoredDevToken(): boolean {
  return !!getStoredDevToken();
}

/** Persists the selected token. The caller is responsible for any reload. */
export function setDevToken(entry: DevToken): void {
  localStorage.setItem(STORAGE_KEY, entry.token);
  writeSessionCookie(entry.token);
}

/**
 * Re-writes the session cookie from the stored dev token, for a tab that was
 * opened after the token was chosen (the cookie is not persisted by anything
 * else, and a reload must not silently lose the stream).
 */
export function syncSessionCookie(): void {
  const token = getStoredDevToken();
  if (token) {
    writeSessionCookie(token);
  }
}
