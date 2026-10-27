import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { subscribeAiFlagUnavailable } from '../ai-feature-flag-events';
const state = vi.hoisted(() => ({ value: true, errorCode: undefined as string | undefined, reason: 'TARGETING_MATCH', handlers: new Map<string, () => void>() }));
vi.mock('../feature-flags', () => ({ AI_CREDITS_FLAG: 'ai-credits' }));
vi.mock('@openfeature/web-sdk', () => ({ ProviderEvents: { Error: 'error', Stale: 'stale', ConfigurationChanged: 'changed', Ready: 'ready' }, OpenFeature: { getClient: () => ({ providerStatus: 'READY', getBooleanDetails: () => ({ value: state.value, errorCode: state.errorCode, reason: state.reason }), addHandler: (event: string, handler: () => void) => state.handlers.set(event, handler), removeHandler: (event: string) => state.handlers.delete(event) }) } }));
beforeEach(() => { state.value = true; state.errorCode = undefined; state.reason = 'TARGETING_MATCH'; state.handlers.clear(); });
it('does not discard editors on a successful true refresh, but immediately revokes a new false', () => {
  const revoke = vi.fn(); const dispose = subscribeAiFlagUnavailable(revoke);
  state.handlers.get('changed')!(); expect(revoke).not.toHaveBeenCalled();
  state.value = false; state.handlers.get('changed')!(); expect(revoke).toHaveBeenCalledOnce();
  dispose(); expect(state.handlers.size).toBe(0);
});
it('revokes stale/error evaluations and a stale provider even if their cached value was true', () => {
  const revoke = vi.fn(); const dispose = subscribeAiFlagUnavailable(revoke);
  state.reason = 'STALE'; state.handlers.get('changed')!();
  state.handlers.get('stale')!(); state.handlers.get('error')!(); expect(revoke).toHaveBeenCalledTimes(3);
  dispose();
});

it('revokes a false returned by newly initialized provider readiness, not only configuration changes', () => {
  const revoke = vi.fn(); const dispose = subscribeAiFlagUnavailable(revoke);
  state.value = false; state.handlers.get('ready')!(); expect(revoke).toHaveBeenCalledOnce(); dispose();
});
