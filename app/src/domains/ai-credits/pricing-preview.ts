import type { AiUsage, ConversionRates, VendorCosts } from '@/api-client';

// Exact decimal arithmetic for a non-authoritative form preview. The server
// remains the only pricing authority; ten-decimal rates never pass through float.
const SCALE = 1_000_000_000_000n;
function decimal(value?: string | null): bigint {
  if (!value || !/^\d+(\.\d{1,12})?$/.test(value)) return 0n;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(12, '0'));
}
function format(value: bigint, precision: number): string {
  const divisor = 10n ** BigInt(12 - precision);
  const rounded = (value + divisor / 2n) / divisor;
  const unit = 10n ** BigInt(precision);
  return `${rounded / unit}.${(rounded % unit).toString().padStart(precision, '0')}`;
}
export function previewCredits(
  rates: ConversionRates,
  usage: AiUsage,
  minimum = '0',
  maximum?: string | null,
): string {
  const amount =
    decimal(rates.perRequest) +
    decimal(rates.perInputToken) * BigInt(usage.inputTokens ?? 0) +
    decimal(rates.perCachedInputToken ?? rates.perInputToken) *
      BigInt(usage.cacheReadInputTokens ?? 0) +
    decimal(rates.perCacheWriteToken ?? rates.perInputToken) *
      BigInt(usage.cacheWriteInputTokens ?? 0) +
    decimal(rates.perOutputToken) * BigInt(usage.outputTokens ?? 0) +
    (decimal(rates.perUnit) * decimal(usage.units)) / SCALE +
    (decimal(rates.perSecond) * BigInt(usage.durationMs ?? 0)) / 1000n;
  const floored = amount < decimal(minimum) ? decimal(minimum) : amount;
  return format(
    maximum != null && floored > decimal(maximum) ? decimal(maximum) : floored,
    6,
  );
}
export function previewVendorCost(costs: VendorCosts, usage: AiUsage): string {
  return previewCredits(costs, usage);
}
export const TYPICAL_USAGE: AiUsage = {
  inputTokens: 1000,
  cacheReadInputTokens: 200,
  cacheWriteInputTokens: 100,
  outputTokens: 500,
  units: '1',
  durationMs: 1000,
};
export const RATE_KEYS = [
  'perRequest',
  'perInputToken',
  'perCachedInputToken',
  'perCacheWriteToken',
  'perOutputToken',
  'perUnit',
  'perSecond',
] as const;
export const PRESETS = [
  'PER_REQUEST',
  'PER_INPUT_TOKEN',
  'PER_OUTPUT_TOKEN',
  'PER_TOTAL_TOKEN',
  'PER_UNIT',
  'PER_SECOND',
  'COMPOSITE',
] as const;
export function presetRates(preset: string): ConversionRates {
  const cleared: ConversionRates = Object.fromEntries(
    RATE_KEYS.map((key) => [key, null]),
  );
  const keys =
    preset === 'PER_TOTAL_TOKEN'
      ? [
          'perInputToken',
          'perCachedInputToken',
          'perCacheWriteToken',
          'perOutputToken',
        ]
      : preset === 'PER_REQUEST'
        ? ['perRequest']
        : preset === 'PER_INPUT_TOKEN'
          ? ['perInputToken']
          : preset === 'PER_OUTPUT_TOKEN'
            ? ['perOutputToken']
            : preset === 'PER_UNIT'
              ? ['perUnit']
              : preset === 'PER_SECOND'
                ? ['perSecond']
                : RATE_KEYS;
  return { ...cleared, ...Object.fromEntries(keys.map((key) => [key, '1'])) };
}

export function maximumBelowMinimum(minimum: string, maximum: string): boolean {
  return decimal(maximum) < decimal(minimum);
}
