export function getCardDescriptionParts(description: string) {
  const normalizedDescription = description.replace(/\s+/g, ' ').trim();
  const firstSentenceMatch = normalizedDescription.match(
    /^(.+?[.!?])\s+([\s\S]+)$/,
  );

  if (!firstSentenceMatch) {
    return [normalizedDescription, null] as const;
  }

  return [firstSentenceMatch[1], firstSentenceMatch[2]] as const;
}
