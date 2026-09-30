// Letters without a decomposed form, which dropping accents leaves intact.
const SPELLED_OUT_LETTERS: Record<string, string> = {
  æ: 'ae',
  ð: 'd',
  đ: 'd',
  ı: 'i',
  ł: 'l',
  ø: 'o',
  œ: 'oe',
  ß: 'ss',
  þ: 'th',
};

// Keeps to the API's slug alphabet: a-z, 0-9 and single inner hyphens.
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // Drop accents: é → e
    .replace(/[æðđıłøœßþ]/g, (letter) => SPELLED_OUT_LETTERS[letter] ?? '')
    .replace(/['’]/g, '') // Drop apostrophes: l'oréal → loreal
    .replace(/[^a-z0-9]+/g, '-') // Spaces, dots, underscores, symbols → hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}
