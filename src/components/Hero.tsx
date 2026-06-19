"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLang } from "@/context/LanguageContext";
import { siteImages } from "@/lib/villas";

const SLIDE_MS = 7000;

export default function Hero() {
  const { t } = useLang();
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setSlide((s) => (s + 1) % siteImages.hero.length),
      SLIDE_MS
    );
    return () => clearInterval(id);
  }, []);

  return (
    <section className="snap-section relative flex h-svh items-center justify-center overflow-hidden bg-ink">
      {/* Ken Burns slideshow */}
      <AnimatePresence>
        <motion.div
          key={slide}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.8 }}
          className="absolute inset-0"
        >
          <div className="kenburns absolute inset-0">
            <Image
              src={siteImages.hero[slide]}
              alt="The Taru Villas, Ubud"
              fill
              priority={slide === 0}
              sizes="100vw"
              className="object-cover"
            />
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Dark gradient for legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink/60 via-ink/30 to-ink/70" />

      <div className="relative z-10 px-5 text-center">
        <motion.p
          initial={{ opacity: 0, letterSpacing: "0.2em" }}
          animate={{ opacity: 1, letterSpacing: "0.6em" }}
          transition={{ duration: 1.4, delay: 0.3 }}
          className="mb-6 text-xs uppercase text-gold-light md:text-sm"
        >
          {t("hero.kicker")}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-4xl font-serif text-4xl leading-tight text-cream md:text-6xl lg:text-7xl"
        >
          {t("hero.title")}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 1, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-cream/80 md:text-base"
        >
          {t("hero.subtitle")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.5 }}
          className="mt-10"
        >
          <Link
            href="/rooms"
            className="inline-block border border-gold bg-gold/10 px-10 py-4 text-sm tracking-[0.3em] uppercase text-gold-light backdrop-blur-sm transition-all duration-300 hover:bg-gold hover:text-ink"
          >
            {t("hero.cta")}
          </Link>
        </motion.div>
      </div>

      {/* Slide indicators */}
      <div className="absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 gap-3">
        {siteImages.hero.map((_, i) => (
          <button
            key={i}
            onClick={() => setSlide(i)}
            aria-label={`Slide ${i + 1}`}
            className={`h-1 transition-all duration-500 ${
              i === slide ? "w-10 bg-gold" : "w-5 bg-cream/40"
            }`}
          />
        ))}
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-center">
        <p className="mb-2 text-[0.6rem] tracking-[0.4em] uppercase text-cream/60">
          {t("hero.scroll")}
        </p>
        <div className="scroll-hint mx-auto h-8 w-px bg-gradient-to-b from-gold to-transparent" />
      </div>
    </section>
  );
}
