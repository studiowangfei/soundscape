/**
 * At most `max` comments per visitor in a rolling window, counted in memory (one serverless instance's view; a brake,
 * not a guarantee). Keys are only held here, never stored or logged, and at most `maxKeys` of them at once.
 */
export class RateLimiter {
  private seen = new Map<string, number[]>();

  constructor(
    private max = 5,
    private windowMs = 3_600_000,
    private maxKeys = 10_000,
  ) {}

  get size() {
    return this.seen.size;
  }

  allow(key: string, now = Date.now()): boolean {
    const recent = (this.seen.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.seen.delete(key); // re-added below, so the map stays in order of last use
    if (recent.length >= this.max) {
      this.seen.set(key, recent);
      return false;
    }
    recent.push(now);
    this.seen.set(key, recent);
    // Forget the least recently seen visitors past the cap, so a flood of addresses can't grow the map.
    for (const k of this.seen.keys()) {
      if (this.seen.size <= this.maxKeys) break;
      this.seen.delete(k);
    }
    return true;
  }
}

/**
 * Who a visitor is, for counting: an IPv4 address as it is, an IPv6 one by its /64 (one household or server gets a
 * whole /64, so counting single addresses would let one visitor post endlessly).
 */
export function visitorKey(ip: string | null): string {
  if (!ip) return "unknown";
  if (!ip.includes(":")) return ip;
  if (ip.includes(".")) return ip.slice(ip.lastIndexOf(":") + 1); // IPv4 written as IPv6 (::ffff:203.0.113.9)
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = ip.includes("::") ? (tail ? tail.split(":") : []) : [];
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g || "0", 16).toString(16))
    .join(":")}::/64`;
}
