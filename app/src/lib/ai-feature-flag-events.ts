import { OpenFeature, ProviderEvents } from '@openfeature/web-sdk';
import { AI_CREDITS_FLAG } from './feature-flags';

/** Immediate AI-only revocation for provider failure or a newly evaluated false. */
export function subscribeAiFlagUnavailable(onUnavailable: () => void) {
  const client = OpenFeature.getClient('kaiten-ai-rollout');
  const onChanged = () => {
    const details = client.getBooleanDetails(AI_CREDITS_FLAG, false);
    if (
      client.providerStatus === 'READY' &&
      (details.value !== true ||
        details.errorCode ||
        !['STATIC', 'DEFAULT', 'TARGETING_MATCH', 'SPLIT'].includes(details.reason ?? ''))
    )
      onUnavailable();
  };
  client.addHandler(ProviderEvents.Error, onUnavailable);
  client.addHandler(ProviderEvents.Stale, onUnavailable);
  client.addHandler(ProviderEvents.ConfigurationChanged, onChanged);
  client.addHandler(ProviderEvents.Ready, onChanged);
  return () => {
    client.removeHandler(ProviderEvents.Error, onUnavailable);
    client.removeHandler(ProviderEvents.Stale, onUnavailable);
    client.removeHandler(ProviderEvents.ConfigurationChanged, onChanged);
    client.removeHandler(ProviderEvents.Ready, onChanged);
  };
}
