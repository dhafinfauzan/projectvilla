"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLang } from "@/context/LanguageContext";

const links = [
  { href: "/rooms", key: "nav.villas" },
  { href: "/experiences", key: "nav.experiences" },
  { href: "/gallery", key: "nav.gallery" },
  { href: "/contact", key: "nav.contact" },
];

export default function Navbar() {
  const { t, lang, setLang } = useLang();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  // Pages without a dark hero need a solid navbar from the start
  const transparentStart = pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = scrolled || !transparentStart || open;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        solid ? "bg-ink/95 shadow-lg backdrop-blur-sm" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
        <Link href="/" className="group flex flex-col leading-none">
          <span className="font-serif text-xl tracking-[0.18em] text-cream md:text-2xl">
            THE TARU
          </span>
          <span className="text-[0.6rem] tracking-[0.5em] text-gold-light">
            VILLAS · UBUD
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`link-gold text-sm tracking-[0.2em] uppercase transition-colors ${
                pathname.startsWith(l.href)
                  ? "text-gold-light"
                  : "text-cream/85 hover:text-cream"
              }`}
            >
              {t(l.key)}
            </Link>
          ))}

          <button
            onClick={() => setLang(lang === "en" ? "id" : "en")}
            className="rounded-full border border-cream/30 px-3 py-1 text-xs tracking-widest text-cream/85 transition hover:border-gold hover:text-gold-light"
            aria-label="Switch language"
          >
            {lang === "en" ? "ID" : "EN"}
          </button>

          <Link
            href="/booking"
            className="border border-gold bg-gold/10 px-5 py-2 text-sm tracking-[0.2em] uppercase text-gold-light transition-all duration-300 hover:bg-gold hover:text-ink"
          >
            {t("nav.bookNow")}
          </Link>
        </div>

        {/* Mobile controls */}
        <div className="flex items-center gap-3 md:hidden">
          <button
            onClick={() => setLang(lang === "en" ? "id" : "en")}
            className="rounded-full border border-cream/30 px-2.5 py-1 text-xs tracking-widest text-cream/85"
            aria-label="Switch language"
          >
            {lang === "en" ? "ID" : "EN"}
          </button>
          <button
            onClick={() => setOpen(!open)}
            className="flex h-9 w-9 flex-col items-center justify-center gap-1.5"
            aria-label="Menu"
          >
            <span
              className={`h-px w-6 bg-cream transition-transform duration-300 ${
                open ? "translate-y-[3.5px] rotate-45" : ""
              }`}
            />
            <span
              className={`h-px w-6 bg-cream transition-transform duration-300 ${
                open ? "-translate-y-[3.5px] -rotate-45" : ""
              }`}
            />
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden bg-ink/95 backdrop-blur-sm md:hidden"
          >
            <div className="flex flex-col gap-1 px-5 pb-6 pt-2">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-cream/10 py-3 text-sm tracking-[0.25em] uppercase text-cream/85"
                >
                  {t(l.key)}
                </Link>
              ))}
              <Link
                href="/rooms"
                onClick={() => setOpen(false)}
                className="mt-4 border border-gold bg-gold/10 px-5 py-3 text-center text-sm tracking-[0.25em] uppercase text-gold-light"
              >
                {t("nav.bookNow")}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
