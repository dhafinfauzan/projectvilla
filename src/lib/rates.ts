import type { Villa } from "@prisma/client";
import { dateKey, stayDates, utcBusinessDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export type RateQuote = {
  nights: number;
  total: number;
  averagePerNight: number;
  minStay: number;
  sellable: boolean;
  restrictions: string[];
  nightly: Array<{ date: string; price: number }>;
};

export async function getRateQuote(
  villa: Pick<Villa, "id" | "pricePerNight">,
  checkIn: Date | string,
  checkOut: Date | string
): Promise<RateQuote> {
  const dates = stayDates(checkIn, checkOut);
  if (!dates.length) {
    return { nights: 0, total: 0, averagePerNight: 0, minStay: 1, sellable: false, restrictions: ["INVALID_STAY"], nightly: [] };
  }
  const basePlan = await prisma.ratePlan.findUnique({ where: { code: "BAR" } });
  const departureDate = utcBusinessDate(checkOut);
  const overrides = basePlan
    ? await prisma.dailyRate.findMany({
        where: { villaId: villa.id, ratePlanId: basePlan.id, businessDate: { in: [...dates, departureDate] } },
      })
    : [];
  const byDate = new Map(overrides.map((rate) => [dateKey(rate.businessDate), rate]));
  const nightly = dates.map((date) => ({
    date: date.toISOString().slice(0, 10),
    price: byDate.get(dateKey(date))?.price ?? villa.pricePerNight,
  }));
  const arrivalRate = byDate.get(dateKey(dates[0]));
  const departureRate = byDate.get(dateKey(departureDate));
  const stayOverrides = dates.map((date) => byDate.get(dateKey(date))).filter((rate) => Boolean(rate));
  const minStay = Math.max(1, ...stayOverrides.map((rate) => rate!.minStay));
  const restrictions: string[] = [];
  if (stayOverrides.some((rate) => rate!.stopSell)) restrictions.push("STOP_SELL");
  if (arrivalRate?.closedToArrival) restrictions.push("CLOSED_TO_ARRIVAL");
  if (departureRate?.closedToDeparture) restrictions.push("CLOSED_TO_DEPARTURE");
  if (dates.length < minStay) restrictions.push("MIN_STAY");
  const total = nightly.reduce((sum, night) => sum + night.price, 0);
  return {
    nights: dates.length,
    total,
    averagePerNight: Math.round(total / dates.length),
    minStay,
    sellable: restrictions.length === 0,
    restrictions,
    nightly,
  };
}
