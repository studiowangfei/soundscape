/** A film poster shown whole (posters, TV key art and landscape one-sheets all fit), on a blurred, dimmed copy of itself. */
export function PosterStage({ src, title, className, inset }: { src: string; title: string; className: string; inset: string }) {
  return (
    <div className={`relative overflow-hidden bg-black/40 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static same-origin image */}
      <img src={src} alt="" aria-hidden className="absolute inset-0 size-full scale-125 object-cover opacity-45 blur-2xl" />
      <div className={`absolute flex items-center justify-center ${inset}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static same-origin image */}
        <img src={src} alt={`${title} poster`} className="max-h-full max-w-full rounded-[4px] object-contain shadow-[0_10px_28px_-8px_rgba(0,0,0,0.75)]" />
      </div>
    </div>
  );
}
