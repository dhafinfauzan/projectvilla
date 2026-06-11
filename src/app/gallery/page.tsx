"use client";

import Image from "next/image";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import Reveal from "@/components/Reveal";
import { useLang } from "@/context/LanguageContext";
import { galleryItems, siteImages, type GalleryItem } from "@/lib/villas";

const categories = ["all", "villas", "nature", "dining", "wellness"] as const;

export default function GalleryPage() {
  const { t, lang } = useLang();
  const [filter, setFilter] = useState<(typeof categories)[number]>("all");
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null);

  const items =
    filter === "all"
      ? galleryItems
      : galleryItems.filter((g) => g.category === filter);

  return (
    <>
      <PageHeader
        kicker={t("gallery.kicker")}
        title={t("gallery.title")}
        image={siteImages.temple}
      />

      <section className="bg-cream py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          {/* Category filter */}
          <Reveal className="mb-12 flex flex-wrap justify-center gap-3">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`border px-5 py-2 text-xs tracking-[0.25em] uppercase transition-all duration-300 ${
                  filter === c
                    ? "border-gold bg-gold text-ink"
                    : "border-ink/20 text-ink/60 hover:border-gold hover:text-gold"
                }`}
              >
                {t(`gallery.${c}`)}
              </button>
            ))}
          </Reveal>

          {/* Masonry-style grid */}
          <motion.div layout className="columns-2 gap-4 md:columns-3 lg:columns-4">
            <AnimatePresence mode="popLayout">
              {items.map((item) => (
                <motion.button
                  layout
                  key={item.src}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => setLightbox(item)}
                  className="group relative mb-4 block w-full cursor-zoom-in overflow-hidden"
                >
                  <Image
                    src={item.src}
                    alt={item.alt[lang]}
                    width={600}
                    height={750}
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="h-auto w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-end bg-gradient-to-t from-ink/70 to-transparent p-4 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                    <p className="text-left text-xs tracking-wider text-cream">
                      {item.alt[lang]}
                    </p>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/95 p-5 backdrop-blur-sm"
          >
            <button
              className="absolute right-6 top-6 text-3xl text-cream/70 transition hover:text-cream"
              aria-label="Close"
            >
              ×
            </button>
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="relative max-h-[85svh] w-full max-w-5xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={lightbox.src}
                alt={lightbox.alt[lang]}
                width={1600}
                height={1067}
                sizes="100vw"
                className="mx-auto max-h-[80svh] w-auto object-contain"
              />
              <p className="mt-4 text-center text-sm tracking-wider text-cream/70">
                {lightbox.alt[lang]}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
