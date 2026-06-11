"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import Reveal from "@/components/Reveal";
import { useLang } from "@/context/LanguageContext";
import { siteImages } from "@/lib/villas";

export default function ContactPage() {
  const { t } = useLang();
  const [sent, setSent] = useState(false);

  return (
    <>
      <PageHeader
        kicker={t("nav.contact")}
        title={t("contact.title")}
        image={siteImages.beach}
      />

      <section className="bg-cream py-20 md:py-28">
        <div className="mx-auto grid max-w-6xl gap-14 px-5 md:grid-cols-2 md:px-8">
          <Reveal>
            <h2 className="font-serif text-2xl text-ink md:text-3xl">
              The Taru Villas
            </h2>
            <p className="mt-4 leading-relaxed text-ink/75">{t("contact.address")}</p>

            <div className="mt-8 space-y-5 text-sm">
              <div>
                <p className="text-xs tracking-[0.3em] uppercase text-gold">
                  {t("contact.phone")}
                </p>
                <a href="tel:+62361000000" className="link-gold mt-1 inline-block text-lg text-ink">
                  +62 361 000 000
                </a>
              </div>
              <div>
                <p className="text-xs tracking-[0.3em] uppercase text-gold">
                  {t("contact.emailLabel")}
                </p>
                <a
                  href="mailto:stay@thetaruvillas.com"
                  className="link-gold mt-1 inline-block text-lg text-ink"
                >
                  stay@thetaruvillas.com
                </a>
              </div>
            </div>

            <div className="mt-10 h-72 overflow-hidden border border-sand">
              <iframe
                title="The Taru Villas location"
                src="https://www.google.com/maps?q=Sayan,+Ubud,+Gianyar,+Bali&output=embed"
                className="h-full w-full"
                loading="lazy"
              />
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <h2 className="font-serif text-2xl text-ink md:text-3xl">
              {t("contact.formTitle")}
            </h2>

            {sent ? (
              <p className="mt-8 border border-gold/40 bg-gold/10 p-6 text-ink">
                {t("contact.sent")}
              </p>
            ) : (
              <form
                className="mt-8 space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSent(true);
                }}
              >
                <input
                  required
                  type="text"
                  placeholder={t("contact.name")}
                  className="w-full border border-ink/20 bg-white px-5 py-4 text-sm outline-none transition focus:border-gold"
                />
                <input
                  required
                  type="email"
                  placeholder={t("contact.emailLabel")}
                  className="w-full border border-ink/20 bg-white px-5 py-4 text-sm outline-none transition focus:border-gold"
                />
                <textarea
                  required
                  rows={6}
                  placeholder={t("contact.message")}
                  className="w-full resize-none border border-ink/20 bg-white px-5 py-4 text-sm outline-none transition focus:border-gold"
                />
                <button
                  type="submit"
                  className="border border-gold bg-gold px-10 py-4 text-sm tracking-[0.25em] uppercase text-ink transition-colors duration-300 hover:bg-transparent hover:text-gold"
                >
                  {t("contact.send")}
                </button>
              </form>
            )}
          </Reveal>
        </div>
      </section>
    </>
  );
}
