import Image from "next/image";

/** A screenshot in a simple phone frame. */
export function PhoneShot({ src, alt, caption, priority = false }: { src: string; alt: string; caption?: string; priority?: boolean }) {
  return (
    <figure className="w-[220px] shrink-0 snap-center sm:w-[240px]">
      <div className="overflow-hidden rounded-[2rem] border-[6px] border-ink bg-ink shadow-xl">
        <Image src={src} alt={alt} width={412} height={839} className="h-auto w-full rounded-[1.5rem]" priority={priority} />
      </div>
      {caption && <figcaption className="mt-3 text-center text-sm text-ink-2">{caption}</figcaption>}
    </figure>
  );
}
