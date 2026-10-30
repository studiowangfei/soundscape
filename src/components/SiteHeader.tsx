import Link from "next/link";

/** The wordmark, as the design sets it: small, semibold and faint, linking home. Hidden for now; its space is kept. */
export function SiteHeader() {
  return (
    <header className="invisible">
      <Link href="/" className="text-[18px] font-semibold text-white/20 transition-colors hover:text-white/45">
        soundscape
      </Link>
    </header>
  );
}
