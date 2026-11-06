// A deliberately short blocklist for dare text. It is a speed bump, not a moderation system:
// it catches the obvious "this could get someone hurt or arrested" dares and nothing more.
// Categories: weapons, hard drugs, self-harm, drunk/impaired driving, violence, theft/vandalism.
// Matching is case-insensitive on word boundaries and phrase-based where a single word would be
// too broad, so "gunk", "crack an egg" or "kill it at karaoke" are fine.

const BLOCKED_PATTERNS: RegExp[] = [
  // weapons
  /\b(guns?|firearms?|pistols?|rifles?|shotguns?|knife|knives|stab\w*|shoot (someone|somebody|a person)|bombs?|explosives?)\b/i,
  // drugs
  /\b(cocaine|heroin|meth|fentanyl|mdma|ecstasy|lsd|shrooms|ketamine|crack cocaine|overdose)\b/i,
  // self-harm
  /\b(kill (yourself|urself|myself)|suicide|self[- ]?harm|cut (yourself|urself)|hang (yourself|urself)|starve (yourself|urself))\b/i,
  // impaired driving and dangerous driving
  /\b(drunk driv\w*|drive drunk|driving drunk|drink and drive|drive high|street rac\w*|run a red light)\b/i,
  // violence against people or animals
  /\b(punch (a|some) (stranger|person|cop)|assault|fight a stranger|kill (someone|somebody|a person|an animal)|murder|poison|hurt (a|an|some) (animal|dog|cat))\b/i,
  // theft, vandalism, arson
  /\b(steal (from|something|someone)|shoplift\w*|rob (a|someone|somebody|the)|break into|vandali[sz]\w*|graffiti|set (a )?fire|arson|trespass\w*)\b/i,
];

export const UNSAFE_DARE_MESSAGE = "keep it safe and legal";

/** True if the text hits the blocklist. */
export function isUnsafeDare(text: string): boolean {
  const normalized = text.normalize("NFKC").replace(/\s+/g, " ");
  return BLOCKED_PATTERNS.some((re) => re.test(normalized));
}
