"use client";

import Image from "next/image";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Reveal from "@/components/Reveal";
import { useLang } from "@/context/LanguageContext";
import { formatIDR } from "@/lib/format";
import type { VillaContent } from "@/lib/villas";

export default function VillaDetail({ villa }: { villa: VillaContent }) {
  const { t, lang } = useLang();

  return (
    <>
      <PageHeader
        kicker={villa.tagline[lang]}
        title={villa.name}
        image={villa.heroImage}
      />

      <section className="bg-cream py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal>
            <Link
              href="/villas"
              className="link-gold text-xs tracking-[0.3em] uppercase text-gold"
            >
              ← {t("villas.backToVillas")}
            </Link>
          </Reveal>

          <div className="mt-10 grid gap-14 lg:grid-cols-[1.6fr_1fr]">
            <div>
              <Reveal>
                <p className="text-lg leading-relaxed text-ink/80 md:text-xl">
                  {villa.longDescription[lang]}
                </p>
              </Reveal>

              <Reveal delay={0.15}>
                <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-2">
                  {villa.images.map((img, i) => (
                    <div
                      key={i}
                      className={`group relative overflow-hidden ${
                        i === 0 ? "col-span-2 h-80 md:h-[480px]" : "h-56 md:h-72"
                      }`}
                    >
                      <Image
                        src={img}
                        alt={`${villa.name} — ${i + 1}`}
                        fill
                        sizes="(max-width: 768px) 100vw, 60vw"
                        className="object-cover transition-transform duration-[1.2s] group-hover:scale-105"
                      />
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>

            {/* Sticky booking panel */}
            <div>
              <Reveal delay={0.2}>
                <div className="sticky top-28 border border-sand bg-white p-8 shadow-sm">
                  <p className="text-xs tracking-[0.3em] uppercase text-ink/50">
                    {t("villas.from")}
                  </p>
                  <p className="mt-2 font-serif text-3xl text-ink">
                    {formatIDR(villa.pricePerNight)}
                    <span className="font-sans text-sm text-ink/50">
                      {" "}
                      / {t("villas.night")}
                    </span>
                  </p>

                  <div className="mt-6 grid grid-cols-3 gap-3 border-y border-sand py-5 text-center text-xs tracking-wider text-ink/70">
                    <div>
                      <p className="font-serif text-2xl text-gold">{villa.bedrooms}</p>
                      <p className="mt-1 uppercase">{t("villas.bedrooms")}</p>
                    </div>
                    <div>
                      <p className="font-serif text-2xl text-gold">{villa.maxGuests}</p>
                      <p className="mt-1 uppercase">{t("villas.guests")}</p>
                    </div>
                    <div>
                      <p className="font-serif text-2xl text-gold">{villa.sizeSqm}</p>
                      <p className="mt-1 uppercase">m²</p>
                    </div>
                  </div>

                  <h3 className="mt-6 text-xs tracking-[0.3em] uppercase text-ink/50">
                    {t("villas.features")}
                  </h3>
                  <ul className="mt-4 space-y-2.5 text-sm text-ink/75">
                    {villa.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
                        {f[lang]}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={`/booking?villa=${villa.slug}`}
                    className="mt-8 block border border-gold bg-gold px-6 py-4 text-center text-sm tracking-[0.25em] uppercase text-ink transition-colors duration-300 hover:bg-transparent hover:text-gold"
                  >
                    {t("villas.bookThis")}
                  </Link>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
