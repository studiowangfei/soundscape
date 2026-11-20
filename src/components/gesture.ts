/**
 * Who a touch belongs to, when several things follow it at the window: on the landing page a drag turns the wheel and
 * a press held still wipes the fog; on a song page that fits the window a finger wipes unless it's thrown (a swipe,
 * turning the song: paging.ts touchIntent), and where the page scrolls a press held still wipes (backdrops/variants.tsx).
 * The first to claim a pointer keeps it until it lifts (or gives it back); the others let it go.
 */
const owners = new Map<number, string>();

const listeners = new Set<(pointerId: number, who: string) => void>();

/** Takes the pointer for `who`, unless someone else already has it. A new owner is announced (see onClaim). */
export function claim(pointerId: number, who: string): boolean {
  const owner = owners.get(pointerId);
  if (owner && owner !== who) return false;
  owners.set(pointerId, who);
  if (!owner) for (const fn of listeners) fn(pointerId, who);
  return true;
}

/** Hears every new claim at once, e.g. so the wheel lets go the moment the fog takes a still press. Returns the unsubscribe. */
export function onClaim(fn: (pointerId: number, who: string) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/**
 * Told at the window whenever the visitor plays with the fog: every stroke wiping it (Fog, backdrops/variants.tsx) and
 * every tap on the landing page's 💧, e.g. so the landing wheel holds still meanwhile.
 */
export const FOG_PLAYED = "soundscape:fog-played";

export function ownerOf(pointerId: number): string | null {
  return owners.get(pointerId) ?? null;
}

/** The pointer lifted (or was cancelled): it's nobody's. */
export function release(pointerId: number) {
  owners.delete(pointerId);
}

const givenBack = new Set<(pointerId: number, who: string) => void>();

/**
 * `who` lets the pointer go before it lifts, as never theirs: the fog standing down from a press that turns out to have
 * been a drag or a swipe (its moves handled late, after the hold was up). Heard by onGiveBack, e.g. so a swipe turns the
 * song after all.
 */
export function giveBack(pointerId: number, who: string) {
  if (owners.get(pointerId) !== who) return;
  owners.delete(pointerId);
  for (const fn of givenBack) fn(pointerId, who);
}

/** Hears every giveBack. Returns the unsubscribe. */
export function onGiveBack(fn: (pointerId: number, who: string) => void) {
  givenBack.add(fn);
  return () => void givenBack.delete(fn);
}

/**
 * On touch screens a press held this long, the finger still, wipes the fog; moving off sooner turns or scrolls instead
 * (on a song page that fits, it's told by its pace instead: paging.ts touchIntent). Short (the user found 280 ms hard to
 * hit, 2026-10-30): a deliberate touch-then-drag gets there, a flick doesn't.
 */
export const HOLD_MS = 160;
/**
 * How far (px) the finger may wander during the hold and still count as still: a real fingertip wobbles a few px as
 * it presses. Past this it's a drag, and the wheel (or the page's scrolling) has it.
 */
export const HOLD_SLOP = 12;
