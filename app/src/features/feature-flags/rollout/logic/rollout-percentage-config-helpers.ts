const DISTRIBUTION_TOTAL = 100;

function getDistributionSum(distribution: Record<string, number>) {
  return Object.values(distribution).reduce((sum, value) => sum + value, 0);
}

function normalizeToWholePercentages(values: number[]) {
  const floored = values.map((value) => Math.floor(value));
  const remainder =
    DISTRIBUTION_TOTAL - floored.reduce((sum, value) => sum + value, 0);
  const decimalsWithIndex = values
    .map((value, index) => ({
      decimal: value - Math.floor(value),
      index,
    }))
    .sort((left, right) => right.decimal - left.decimal);

  const normalized = [...floored];
  for (let index = 0; index < remainder; index += 1) {
    const target = decimalsWithIndex[index];
    if (!target) {
      break;
    }

    normalized[target.index] += 1;
  }

  return normalized;
}

export function redistributeDistribution(
  distribution: Record<string, number>,
  changedKey: string,
  newValue: number,
) {
  const nextDistribution = {
    ...distribution,
    [changedKey]: newValue,
  };
  const total = getDistributionSum(nextDistribution);

  if (total === DISTRIBUTION_TOTAL) {
    return nextDistribution;
  }

  const keys = Object.keys(nextDistribution);
  const normalizedValues = normalizeToWholePercentages(
    keys.map((key) => (nextDistribution[key] / total) * DISTRIBUTION_TOTAL),
  );

  return Object.fromEntries(
    keys.map((key, index) => [key, normalizedValues[index] ?? 0]),
  );
}

export function addVariantToDistribution(
  distribution: Record<string, number>,
  variantName: string,
) {
  if (distribution[variantName]) {
    return distribution;
  }

  const existingKeys = Object.keys(distribution);
  const nextCount = existingKeys.length + 1;
  const perVariant = Math.floor(DISTRIBUTION_TOTAL / nextCount);
  const nextDistribution: Record<string, number> = {};
  let allocated = 0;

  for (const key of existingKeys) {
    nextDistribution[key] = perVariant;
    allocated += perVariant;
  }

  nextDistribution[variantName] = DISTRIBUTION_TOTAL - allocated;

  return nextDistribution;
}

export function removeVariantFromDistribution(
  distribution: Record<string, number>,
  variantName: string,
) {
  const nextDistribution = { ...distribution };
  delete nextDistribution[variantName];

  const remainingKeys = Object.keys(nextDistribution);
  if (remainingKeys.length === 0) {
    return nextDistribution;
  }

  const currentTotal = getDistributionSum(nextDistribution);
  if (currentTotal > 0) {
    for (const key of remainingKeys) {
      nextDistribution[key] = Math.floor(
        (nextDistribution[key] / currentTotal) * DISTRIBUTION_TOTAL,
      );
    }

    const adjustedTotal = getDistributionSum(nextDistribution);
    if (adjustedTotal < DISTRIBUTION_TOTAL) {
      nextDistribution[remainingKeys[0]] += DISTRIBUTION_TOTAL - adjustedTotal;
    }

    return nextDistribution;
  }

  const perVariant = Math.floor(DISTRIBUTION_TOTAL / remainingKeys.length);
  for (const key of remainingKeys) {
    nextDistribution[key] = perVariant;
  }

  const adjustedTotal = perVariant * remainingKeys.length;
  if (adjustedTotal < DISTRIBUTION_TOTAL) {
    nextDistribution[remainingKeys[0]] += DISTRIBUTION_TOTAL - adjustedTotal;
  }

  return nextDistribution;
}

export function equalizeDistribution(distribution: Record<string, number>) {
  const keys = Object.keys(distribution);
  if (keys.length === 0) {
    return distribution;
  }

  const perVariant = Math.floor(DISTRIBUTION_TOTAL / keys.length);
  const nextDistribution: Record<string, number> = {};
  let allocated = 0;

  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      nextDistribution[key] = DISTRIBUTION_TOTAL - allocated;
      return;
    }

    nextDistribution[key] = perVariant;
    allocated += perVariant;
  });

  return nextDistribution;
}
