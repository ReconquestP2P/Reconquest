/**
 * Price Service
 * Fetches real-time Bitcoin prices from CoinGecko
 */

interface BtcPriceData {
  usd: number;
  eur: number;
  usd24hChange: number;
  lastUpdatedAt: number;
}

let cachedPrice: BtcPriceData | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 60000; // 1 minute cache

// Test override for stress testing LTV monitoring
let testPriceOverride: BtcPriceData | null = null;

export function setTestPriceOverride(priceData: BtcPriceData | null): void {
  testPriceOverride = priceData;
  console.log(`[PriceService] Test price override ${priceData ? `SET to $${priceData.usd} USD / €${priceData.eur} EUR` : 'CLEARED'}`);
}

export function getTestPriceOverride(): BtcPriceData | null {
  return testPriceOverride;
}

export async function getBtcPrice(): Promise<BtcPriceData> {
  // Return test override if set (for stress testing)
  if (testPriceOverride) {
    console.log(`[PriceService] Using test override price: $${testPriceOverride.usd}`);
    return testPriceOverride;
  }

  const now = Date.now();
  
  // Return cached price if still valid
  if (cachedPrice && (now - cacheTimestamp) < CACHE_DURATION_MS) {
    return cachedPrice;
  }

  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur&include_24hr_change=true&include_last_updated_at=true'
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    
    cachedPrice = {
      usd: data.bitcoin?.usd || 66000,
      eur: data.bitcoin?.eur || 56000,
      usd24hChange: data.bitcoin?.usd_24h_change || 0,
      lastUpdatedAt: data.bitcoin?.last_updated_at || Math.floor(now / 1000),
    };
    cacheTimestamp = now;

    return cachedPrice;
  } catch (error) {
    console.error('Error fetching BTC price:', error);
    
    // Return fallback price if API fails
    return {
      usd: 66000,
      eur: 56000,
      usd24hChange: 0,
      lastUpdatedAt: Math.floor(now / 1000),
    };
  }
}

export async function getBtcPriceUsd(): Promise<number> {
  const priceData = await getBtcPrice();
  return priceData.usd;
}
