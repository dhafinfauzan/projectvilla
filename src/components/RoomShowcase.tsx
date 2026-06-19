"use client";

import Link from "next/link";
import { useLang } from "@/context/LanguageContext";
import { formatIDR } from "@/lib/format";
import { useRoomTypes } from "@/lib/useRoomTypes";

/**
 * Home-page villa grid, sourced from QloApps (same data as /rooms). All cards
 * link to /rooms — the single rooms list across the whole site. Degrades to a
 * simple call-to-action if QloApps is unavailable.
 */
export default function RoomShowcase() {
  const { t } = useLang();
  const { rooms, loading, error } = useRoomTypes();
  const shown = rooms.slice(0, 3);

  if (!loading && (error || shown.length === 0)) {
    return (
      <div className="text-center">
        <Link
          href="/rooms"
          className="inline-block border border-gold bg-gold px-10 py-4 text-sm tracking-[0.3em] uppercase text-ink transition-colors duration-300 hover:bg-transparent hover:text-gold"
        >
          {t("villas.viewAll")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-8 md:grid-cols-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[420px] animate-pulse bg-white/60 shadow-sm"
              />
            ))
          : shown.map((room) => (
              <Link
                key={room.id}
                href="/rooms"
                className="group block overflow-hidden bg-white shadow-sm transition-shadow duration-500 hover:shadow-2xl"
              >
                <div className="relative h-72 overflow-hidden bg-sand md:h-80">
                  {room.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- proxied QloApps image
                    <img
                      src={room.images[0]}
                      alt={room.name}
                      className="h-full w-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-110"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-ink/30">
                      {room.name}
                    </div>
                  )}
                  {room.pricePerNight > 0 && (
                    <div className="absolute bottom-4 left-4 bg-ink/70 px-3 py-1.5 text-xs tracking-wider text-gold-light backdrop-blur-sm">
                      {t("villas.from")} {formatIDR(room.pricePerNight)} /{" "}
                      {t("villas.night")}
                    </div>
                  )}
                </div>
                <div className="p-6 md:p-7">
                  <h3 className="font-serif text-xl text-ink md:text-2xl">
                    {room.name}
                  </h3>
                  {room.description && (
                    <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink/70">
                      {room.description}
                    </p>
                  )}
                  <div className="mt-5 flex items-center justify-end border-t border-sand pt-4 text-xs tracking-wider">
                    <span className="link-gold text-gold transition-colors group-hover:text-ink">
                      {t("villas.explore")} →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
      </div>

      <div className="mt-12 text-center">
        <Link
          href="/rooms"
          className="link-gold text-sm tracking-[0.3em] uppercase text-gold"
        >
          {t("villas.viewAll")} →
        </Link>
      </div>
    </>
  );
}
