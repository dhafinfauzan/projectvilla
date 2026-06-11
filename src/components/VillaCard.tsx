"use client";

import Image from "next/image";
import Link from "next/link";
import { useLang } from "@/context/LanguageContext";
import { formatIDR } from "@/lib/format";
import type { VillaContent } from "@/lib/villas";

export default function VillaCard({ villa }: { villa: VillaContent }) {
  const { t, lang } = useLang();

  return (
    <Link
      href={`/villas/${villa.slug}`}
      className="group block overflow-hidden bg-white shadow-sm transition-shadow duration-500 hover:shadow-2xl"
    >
      <div className="relative h-72 overflow-hidden md:h-80">
        <Image
          src={villa.heroImage}
          alt={villa.name}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/50 to-transparent opacity-60 transition-opacity duration-500 group-hover:opacity-30" />
        <div className="absolute bottom-4 left-4 bg-ink/70 px-3 py-1.5 text-xs tracking-wider text-gold-light backdrop-blur-sm">
          {t("villas.from")} {formatIDR(villa.pricePerNight)} / {t("villas.night")}
        </div>
      </div>

      <div className="p-6 md:p-7">
        <h3 className="font-serif text-xl text-ink md:text-2xl">{villa.name}</h3>
        <p className="mt-1 text-xs tracking-[0.15em] uppercase text-gold">
          {villa.tagline[lang]}
        </p>
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink/70">
          {villa.description[lang]}
        </p>

        <div className="mt-5 flex items-center justify-between border-t border-sand pt-4 text-xs tracking-wider text-ink/60">
          <span>
            {villa.bedrooms} {t("villas.bedrooms")} · {villa.maxGuests}{" "}
            {t("villas.guests")} · {villa.sizeSqm} m²
          </span>
          <span className="link-gold text-gold transition-colors group-hover:text-ink">
            {t("villas.explore")} →
          </span>
        </div>
      </div>
    </Link>
  );
}
