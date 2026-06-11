"use client";

import { motion } from "framer-motion";
import ParallaxImage from "@/components/ParallaxImage";

type Props = {
  kicker: string;
  title: string;
  image: string;
  subtitle?: string;
};

/** Tall parallax banner used at the top of inner pages. */
export default function PageHeader({ kicker, title, image, subtitle }: Props) {
  return (
    <section className="relative flex h-[55svh] min-h-[380px] items-end overflow-hidden bg-ink">
      <ParallaxImage
        src={image}
        alt={title}
        className="absolute inset-0 h-full"
        strength={70}
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/30 to-ink/80" />
      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-14 md:px-8">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-3 text-xs tracking-[0.4em] uppercase text-gold-light"
        >
          {kicker}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="font-serif text-4xl text-cream md:text-6xl"
        >
          {title}
        </motion.h1>
        {subtitle && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.55 }}
            className="mt-4 max-w-xl text-cream/80"
          >
            {subtitle}
          </motion.p>
        )}
      </div>
    </section>
  );
}
