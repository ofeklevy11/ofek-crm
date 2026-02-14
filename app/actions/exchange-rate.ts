"use server";

const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

let cachedRates: { rates: Record<string, number>; fetchedAt: number } | null = null;

async function fetchAllRates(): Promise<Record<string, number>> {
  if (cachedRates && Date.now() - cachedRates.fetchedAt < CACHE_DURATION_MS) {
    return cachedRates.rates;
  }

  const res = await fetch("https://boi.org.il/PublicApi/GetExchangeRates", {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error("Failed to fetch exchange rates from Bank of Israel");
  }

  const data = await res.json();
  const rates: Record<string, number> = {};

  for (const item of data.exchangeRates) {
    rates[item.key] = item.currentExchangeRate / (item.unit || 1);
  }

  cachedRates = { rates, fetchedAt: Date.now() };
  return rates;
}

export async function getExchangeRate(currency: string): Promise<number> {
  if (currency === "ILS") return 1;

  const rates = await fetchAllRates();
  const rate = rates[currency];

  if (!rate) {
    throw new Error(`Exchange rate not found for currency: ${currency}`);
  }

  return rate;
}
