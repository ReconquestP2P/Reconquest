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

export async function getBtcPrice(): Promise<BtcPriceData> {
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
      usd: data.bitcoin?.usd || 97000,
      eur: data.bitcoin?.eur || 90000,
      usd24hChange: data.bitcoin?.usd_24h_change || 0,
      lastUpdatedAt: data.bitcoin?.last_updated_at || Math.floor(now / 1000),
    };
    cacheTimestamp = now;

    return cachedPrice;
  } catch (error) {
    console.error('Error fetching BTC price:', error);
    
    // Return fallback price if API fails
    return {
      usd: 97000,
      eur: 90000,
      usd24hChange: 0,
      lastUpdatedAt: Math.floor(now / 1000),
    };
  }
}

export async function getBtcPriceUsd(): Promise<number> {
  const priceData = await getBtcPrice();
  return priceData.usd;
}
