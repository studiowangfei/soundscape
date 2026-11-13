/** A web address found in a visitor's comment: as they wrote it, and where it goes. */
export type LinkPart = { text: string; href: string };

// A host name's label: letters, digits and inner hyphens (a pasted address's host may be any non-ASCII letters too).
const LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
// Endings people type without https:// or www. (youtube.com, last.fm, bit.ly); "node.js" or "Mr.Blue" aren't one.
const TLD = "com|org|net|io|co|fm|ly|be|tv|uk|app|dev|info|edu|gov";
// What may follow a bare host: a port, then a path, query or fragment up to the next space.
const REST = `(?::\\d+)?(?:[/?#][^\\s<>"]*)?`;
// An address starts a word (not inside an email, after another scheme's ://, or mid-word): group 1 is the character
// before it, group 2 the address. Written without lookbehind, which older Safari can't parse.
const ADDRESS = new RegExp(
  `(^|[^\\w@./:-])(` +
    `https?://[a-z0-9\\u00a1-\\uffff][^\\s/?#<>"]*(?:[/?#][^\\s<>"]*)?` +
    `|www\\.(?:${LABEL}\\.)+[a-z]{2,}(?![\\w-])${REST}` +
    `|(?:${LABEL}\\.)+(?:${TLD})(?![\\w-])${REST}` +
    `)`,
  "gi",
);
const CLOSE: Record<string, string> = { ")": "(", "]": "[" };

/** The address without the punctuation that ends the sentence around it (a bracket it opened itself stays). */
function trimEnd(url: string) {
  for (;;) {
    const last = url.at(-1) ?? "";
    const open = CLOSE[last];
    if (/[.,;:!?'"’”*]/.test(last) || (open && url.split(open).length < url.split(last).length)) url = url.slice(0, -1);
    else return url;
  }
}

/**
 * A visitor's comment as plain text and the web addresses in it, in order, so the open card can make those clickable:
 * a pasted address (http:// or https://), one starting www., or a bare domain with a common ending (youtube.com/…).
 * Those without a scheme open over https. Only http(s) ever becomes a link.
 */
export function linkParts(text: string): (string | LinkPart)[] {
  const parts: (string | LinkPart)[] = [];
  let at = 0;
  for (const m of text.matchAll(ADDRESS)) {
    const start = m.index + m[1].length;
    const url = trimEnd(m[2]);
    if (start > at) parts.push(text.slice(at, start));
    parts.push({ text: url, href: /^https?:\/\//i.test(url) ? url : `https://${url}` });
    at = start + url.length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}
