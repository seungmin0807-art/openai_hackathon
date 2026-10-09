// Keep sentence wording intact; only divide at natural spoken boundaries.
// A short first sentence can start playing while the next is synthesized.
export function speechSegments(text) {
  const clean = String(text ?? '').trim();
  if (!clean) return [];
  return clean.split(/(?<=[.!?。！？])\s+|\n+/u).flatMap(sentence => {
    if (sentence.length <= 48) return [sentence];
    const comma = sentence.indexOf(', ', 15);
    if (comma >= 15 && comma < 48) return [sentence.slice(0, comma + 1), sentence.slice(comma + 2)];
    return [sentence];
  }).filter(Boolean);
}
