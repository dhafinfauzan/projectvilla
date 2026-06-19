"use client";

import Link from "next/link";
import { useLang } from "@/context/LanguageContext";

export default function Footer() {
  const { t } = useLang();

  return (
    <footer className="bg-ink text-cream/70">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 md:grid-cols-3 md:px-8">
        <div>
          <p className="font-serif text-2xl tracking-[0.18em] text-cream">
            THE TARU
          </p>
          <p className="mb-5 text-[0.65rem] tracking-[0.5em] text-gold-light">
            VILLAS · UBUD
          </p>
          <p className="max-w-xs text-sm leading-relaxed">{t("footer.tagline")}</p>
          <p className="mt-4 text-xs tracking-[0.25em] uppercase text-gold-light">
            {t("footer.opening")}
          </p>
        </div>

        <div>
          <h3 className="mb-5 text-xs tracking-[0.3em] uppercase text-gold-light">
            {t("footer.explore")}
          </h3>
          <ul className="space-y-3 text-sm">
            <li>
              <Link href="/rooms" className="link-gold hover:text-cream">
                {t("nav.villas")}
              </Link>
            </li>
            <li>
              <Link href="/experiences" className="link-gold hover:text-cream">
                {t("nav.experiences")}
              </Link>
            </li>
            <li>
              <Link href="/gallery" className="link-gold hover:text-cream">
                {t("nav.gallery")}
              </Link>
            </li>
            <li>
              <Link href="/rooms" className="link-gold hover:text-cream">
                {t("nav.bookNow")}
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-5 text-xs tracking-[0.3em] uppercase text-gold-light">
            {t("footer.contactUs")}
          </h3>
          <ul className="space-y-3 text-sm">
            <li>Jl. Raya Sayan, Ubud</li>
            <li>Gianyar, Bali 80571</li>
            <li>
              <a href="tel:+62361000000" className="link-gold hover:text-cream">
                +62 361 000 000
              </a>
            </li>
            <li>
              <a
                href="mailto:stay@thetaruvillas.com"
                className="link-gold hover:text-cream"
              >
                stay@thetaruvillas.com
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-cream/10 py-6 text-center text-xs tracking-wider text-cream/40">
        © {new Date().getFullYear()} The Taru Villas. {t("footer.rights")}
      </div>
    </footer>
  );
}
