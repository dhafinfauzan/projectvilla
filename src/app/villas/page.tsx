"use client";

import PageHeader from "@/components/PageHeader";
import Reveal from "@/components/Reveal";
import VillaCard from "@/components/VillaCard";
import { useLang } from "@/context/LanguageContext";
import { siteImages, villas } from "@/lib/villas";

export default function VillasPage() {
  const { t } = useLang();

  return (
    <>
      <PageHeader
        kicker={t("villas.kicker")}
        title={t("villas.title")}
        subtitle={t("villas.subtitle")}
        image={siteImages.pool}
      />

      <section className="bg-cream py-20 md:py-28">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 md:grid-cols-3 md:px-8">
          {villas.map((villa, i) => (
            <Reveal key={villa.slug} delay={i * 0.12}>
              <VillaCard villa={villa} />
            </Reveal>
          ))}
        </div>
      </section>
    </>
  );
}
