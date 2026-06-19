"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import Hero from "@/components/Hero";
import Reveal from "@/components/Reveal";
import ParallaxImage from "@/components/ParallaxImage";
import RoomShowcase from "@/components/RoomShowcase";
import { useLang } from "@/context/LanguageContext";
import { galleryItems, siteImages } from "@/lib/villas";

export default function Home() {
  const { t, lang } = useLang();

  const experiences = [
    { key: "spa", image: siteImages.spa },
    { key: "dining", image: siteImages.dining },
    { key: "culture", image: siteImages.temple },
    { key: "yoga", image: siteImages.yoga },
  ];

  return (
    <div className="snap-container">
      <Hero />

      {/* ── Welcome ───────────────────────────────────────────── */}
      <section className="snap-section bg-cream py-24 md:py-32">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 md:grid-cols-2 md:gap-16 md:px-8">
          <Reveal>
            <ParallaxImage
              src={siteImages.welcome}
              alt="The jungle around The Taru Villas"
              className="h-[420px] md:h-[560px]"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </Reveal>

          <div>
            <Reveal delay={0.1}>
              <p className="mb-4 text-xs tracking-[0.4em] uppercase text-gold">
                {t("welcome.kicker")}
              </p>
              <h2 className="font-serif text-3xl leading-snug text-ink md:text-5xl">
                {t("welcome.title")}
              </h2>
            </Reveal>
            <Reveal delay={0.25}>
              <p className="mt-7 leading-relaxed text-ink/75">{t("welcome.body1")}</p>
              <p className="mt-5 leading-relaxed text-ink/75">{t("welcome.body2")}</p>
            </Reveal>

            <Reveal delay={0.4}>
              <div className="mt-10 grid grid-cols-3 gap-6 border-t border-sand pt-8">
                {[
                  { n: "12", label: t("welcome.stat1") },
                  { n: "4.5", label: t("welcome.stat2") },
                  { n: "15", label: t("welcome.stat3") },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="font-serif text-4xl text-gold md:text-5xl">{s.n}</p>
                    <p className="mt-2 text-[0.65rem] tracking-[0.2em] uppercase text-ink/60">
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Villas ────────────────────────────────────────────── */}
      <section className="snap-section bg-sand/40 py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal className="mb-14 text-center">
            <p className="mb-4 text-xs tracking-[0.4em] uppercase text-gold">
              {t("villas.kicker")}
            </p>
            <h2 className="font-serif text-3xl text-ink md:text-5xl">
              {t("villas.title")}
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-ink/70">{t("villas.subtitle")}</p>
          </Reveal>

          <Reveal>
            <RoomShowcase />
          </Reveal>
        </div>
      </section>

      {/* ── Experiences ───────────────────────────────────────── */}
      <section className="snap-section bg-ink py-24 text-cream md:py-32">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <Reveal className="mb-14 text-center">
            <p className="mb-4 text-xs tracking-[0.4em] uppercase text-gold-light">
              {t("experiences.kicker")}
            </p>
            <h2 className="font-serif text-3xl md:text-5xl">{t("experiences.title")}</h2>
          </Reveal>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {experiences.map((exp, i) => (
              <Reveal key={exp.key} delay={i * 0.12}>
                <Link href="/experiences" className="group block">
                  <div className="relative h-80 overflow-hidden md:h-96">
                    <Image
                      src={exp.image}
                      alt={t(`experiences.items.${exp.key}.title`)}
                      fill
                      sizes="(max-width: 640px) 100vw, 25vw"
                      className="object-cover transition-transform duration-[1.4s] ease-out group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5">
                      <h3 className="font-serif text-xl text-cream">
                        {t(`experiences.items.${exp.key}.title`)}
                      </h3>
                      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-cream/70 opacity-0 transition-all duration-500 group-hover:opacity-100">
                        {t(`experiences.items.${exp.key}.desc`)}
                      </p>
                    </div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Gallery marquee ───────────────────────────────────── */}
      <section className="snap-section overflow-hidden bg-cream py-24 md:py-32">
        <Reveal className="mb-12 text-center">
          <p className="mb-4 text-xs tracking-[0.4em] uppercase text-gold">
            {t("gallery.kicker")}
          </p>
          <h2 className="font-serif text-3xl text-ink md:text-5xl">
            {t("gallery.title")}
          </h2>
        </Reveal>

        <div className="relative">
          <div className="marquee-track flex w-max gap-5">
            {[...galleryItems.slice(0, 8), ...galleryItems.slice(0, 8)].map(
              (item, i) => (
                <div
                  key={i}
                  className="relative h-56 w-72 shrink-0 overflow-hidden md:h-72 md:w-96"
                >
                  <Image
                    src={item.src}
                    alt={item.alt[lang]}
                    fill
                    sizes="384px"
                    className="object-cover transition-transform duration-700 hover:scale-105"
                  />
                </div>
              )
            )}
          </div>
        </div>

        <Reveal className="mt-12 text-center">
          <Link
            href="/gallery"
            className="link-gold text-sm tracking-[0.3em] uppercase text-gold"
          >
            {t("gallery.viewFull")} →
          </Link>
        </Reveal>
      </section>

      {/* ── Quote ─────────────────────────────────────────────── */}
      <section className="snap-section relative flex min-h-[60svh] items-center overflow-hidden">
        <ParallaxImage
          src={siteImages.riceTerrace}
          alt="Rice terraces near Ubud"
          className="absolute inset-0 h-full"
          strength={80}
        />
        <div className="absolute inset-0 bg-ink/60" />
        <div className="relative z-10 mx-auto max-w-3xl px-5 py-28 text-center">
          <Reveal>
            <p className="font-serif text-2xl leading-relaxed text-cream md:text-4xl">
              {t("quote.text")}
            </p>
            <p className="mt-8 text-xs tracking-[0.3em] uppercase text-gold-light">
              {t("quote.author")}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="snap-section bg-forest py-24 text-center md:py-32">
        <div className="mx-auto max-w-2xl px-5">
          <Reveal>
            <h2 className="font-serif text-3xl text-cream md:text-5xl">
              {t("cta.title")}
            </h2>
            <p className="mt-5 text-cream/75">{t("cta.subtitle")}</p>
            <motion.div whileHover={{ scale: 1.03 }} className="mt-10 inline-block">
              <Link
                href="/rooms"
                className="inline-block border border-gold bg-gold px-12 py-4 text-sm tracking-[0.3em] uppercase text-ink transition-colors duration-300 hover:bg-transparent hover:text-gold-light"
              >
                {t("cta.button")}
              </Link>
            </motion.div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
