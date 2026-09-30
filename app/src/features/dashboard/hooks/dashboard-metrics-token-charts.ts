import type { DashboardCollections } from './dashboard-metrics.collections';
import {
  classifyTokenState,
  TOKEN_STATE_FILLS,
  type TokenStateKey,
} from './dashboard-metrics.helpers';

export function buildTokenSecurityPosture(
  tokens: DashboardCollections['tokens'],
  now: Date,
) {
  const tokenStateMap = new Map<TokenStateKey, number>();
  let tokensExpiringSoon = 0;
  let tokensActive = 0;

  for (const token of tokens) {
    const stateKey = classifyTokenState(token, now);

    tokenStateMap.set(stateKey, (tokenStateMap.get(stateKey) ?? 0) + 1);

    if (stateKey === 'expiringSoon') {
      tokensExpiringSoon += 1;
    }

    // A revoked token is history, not capacity: the headline count leaves it out.
    if (stateKey !== 'revoked') {
      tokensActive += 1;
    }
  }

  return {
    tokenSecurityPosture: Array.from(tokenStateMap.entries()).map(
      ([stateKey, count]) => ({
        fill: TOKEN_STATE_FILLS[stateKey],
        stateKey,
        tokens: count,
      }),
    ),
    tokensActive,
    tokensExpiringSoon,
  };
}
