const SENTENCE_START_REPLACEMENTS: Array<[RegExp, string]> = [
  [/^\s*i\s+(noticed|think|found|see|saw|believe|recommend)\s+(that\s+)?/i, ""],
  [/^\s*i['’]m\s+(seeing|noticing)\s+(that\s+)?/i, ""],
  [/^\s*we\s+(noticed|think|found|see|saw|believe|recommend)\s+(that\s+)?/i, ""],
  [/^\s*let['’]?s\s+/i, ""],
  [/^\s*you\s+(should|could|might|may|need to|had|have)\s+/i, ""],
  [/^\s*your\s+/i, "the "],
  [/^\s*don['’]?t\s+forget\s+(about\s+)?/i, ""],
];

const MARKETING_WORDS: Array<[RegExp, string]> = [
  [/\bpowerful\b/gi, "notable"],
  [/\bseamless\b/gi, "smooth"],
  [/\bhuge\b/gi, "large"],
  [/\bcritical\b/gi, "important"],
  [/\bgame[- ]changing\b/gi, "notable"],
  [/\bexciting\b/gi, "notable"],
];

function lowerInitial(text: string): string {
  return text.replace(/^([A-Z])/, (match) => match.toLowerCase());
}

function cleanSentence(sentence: string): string {
  let cleaned = sentence.trim();
  for (const [pattern, replacement] of SENTENCE_START_REPLACEMENTS) {
    if (pattern.test(cleaned)) {
      cleaned = cleaned.replace(pattern, replacement).trim();
      cleaned = lowerInitial(cleaned);
      break;
    }
  }

  for (const [pattern, replacement] of MARKETING_WORDS) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  return cleaned.replace(/!+/g, ".").replace(/\s+/g, " ").trim();
}

/**
 * Deterministic post-filter for short AI-authored labels/callouts.
 *
 * It is intentionally conservative: this is not a rewrite model. It removes
 * first-person openings and obvious marketing language so UI surfaces keep the
 * invisible, observational highli voice even when a model drifts.
 */
export function toneFilterText(text: string): string {
  if (!text.trim()) return text;

  return text
    .split(/(?<=[.!?])\s+/)
    .map(cleanSentence)
    .filter(Boolean)
    .join(" ");
}

export function startsWithFirstPerson(text: string): boolean {
  return /^(i|i['’]m|we|we['’]re|let['’]?s)\b/i.test(text.trim());
}
