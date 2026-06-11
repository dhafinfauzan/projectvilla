"use client";

import PageHeader from "@/components/PageHeader";
import ParallaxImage from "@/components/ParallaxImage";
import Reveal from "@/components/Reveal";
import { useLang } from "@/context/LanguageContext";
import { siteImages } from "@/lib/villas";

const experiences = [
  { key: "spa", image: siteImages.spa },
  { key: "dining", image: siteImages.dining },
  { key: "culture", image: siteImages.temple },
  { key: "yoga", image: siteImages.yoga },
];

export default function ExperiencesPage() {
  const { t } = useLang();

  return (
    <>
      <PageHeader
        kicker={t("experiences.kicker")}
        title={t("experiences.title")}
        image={siteImages.spa}
      />

      <section className="bg-cream py-20 md:py-28">
        <div className="mx-auto max-w-6xl space-y-24 px-5 md:px-8">
          {experiences.map((exp, i) => (
            <div
              key={exp.key}
              className={`grid items-center gap-10 md:grid-cols-2 md:gap-16 ${
                i % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""
              }`}
            >
              <Reveal>
                <ParallaxImage
                  src={exp.image}
                  alt={t(`experiences.items.${exp.key}.title`)}
                  className="h-[380px] md:h-[480px]"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  strength={45}
                />
              </Reveal>
              <Reveal delay={0.15}>
                <p className="mb-3 font-serif text-5xl text-gold/30">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h2 className="font-serif text-3xl text-ink md:text-4xl">
                  {t(`experiences.items.${exp.key}.title`)}
                </h2>
                <p className="mt-5 leading-relaxed text-ink/75">
                  {t(`experiences.items.${exp.key}.desc`)}
                </p>
              </Reveal>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
