import Cookies from 'js-cookie';
import { getStoredDevToken } from './local-auth';

type ClerkSessionLike = {
  getToken: () => Promise<string | null>;
};

type ClerkLike = {
  session?: ClerkSessionLike | null;
};

type ClerkWindow = Window & {
  Clerk?: ClerkLike;
};

const getClerk = (): ClerkLike | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return (window as ClerkWindow).Clerk;
};

export async function getAuthToken() {
  if (import.meta.env.VITE_LOCAL_AUTH === 'true') {
    return getStoredDevToken() ?? undefined;
  }

  const clerkToken = await getClerk()?.session?.getToken?.();

  if (clerkToken) {
    return clerkToken;
  }

  return Cookies.get('__session');
}
