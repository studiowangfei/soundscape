import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pt-10 pb-28">
      <div className="mb-10">
        <SiteHeader />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 pb-16 text-center">
        <p className="text-lg font-medium">We don&apos;t have that song</p>
        <p className="max-w-sm text-[15px] leading-relaxed text-white/55">The page you asked for isn&apos;t here. It may have moved, or the link has a typo.</p>
        <Link href="/" className="rounded-full bg-amber-300 px-5 py-2.5 text-sm font-medium text-black">
          See all songs
        </Link>
      </div>
    </main>
  );
}
