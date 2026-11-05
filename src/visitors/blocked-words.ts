/**
 * Slurs a visitor comment is refused for outright (whole words, any case, with a plural "s"). Only widely recognised
 * slurs, not general swearing: the user reads every comment before it's published, so this just keeps the worst out of
 * their inbox. Words that fans quote from songs in the catalog are left to the user's review.
 */
export const BLOCKED_WORDS: readonly string[] = [
  "retard",
  "retarded",
  "nigger",
  "sandnigger",
  "faggot",
  "fag",
  "kike",
  "kyke",
  "spic",
  "chink",
  "gook",
  "zipperhead",
  "wetback",
  "beaner",
  "raghead",
  "towelhead",
  "paki",
  "coon",
  "golliwog",
  "tranny",
  "shemale",
];

const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${BLOCKED_WORDS.join("|")})s?(?![\\p{L}\\p{N}])`, "iu");

export const hasBlockedWord = (s: string): boolean => pattern.test(s);
