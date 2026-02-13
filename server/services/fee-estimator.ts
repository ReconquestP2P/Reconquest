import { getApiBaseUrl, isMainnet } from './bitcoin-network-selector.js';

export interface FeeEstimate {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
  source: 'api' | 'fallback';
  timestamp: string;
}

export interface TransactionFeeEstimate {
  feeRate: number;
  feeSats: number;
  estimatedVbytes: number;
  priority: 'high' | 'medium' | 'low' | 'economy';
  source: 'api' | 'fallback';
}

let cachedFees: FeeEstimate | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION_MS = 30_000;

const TESTNET_FALLBACK: FeeEstimate = {
  fastestFee: 5,
  halfHourFee: 2,
  hourFee: 1,
  economyFee: 1,
  minimumFee: 1,
  source: 'fallback',
  timestamp: new Date().toISOString(),
};

const MAINNET_FALLBACK: FeeEstimate = {
  fastestFee: 20,
  halfHourFee: 10,
  hourFee: 5,
  economyFee: 2,
  minimumFee: 1,
  source: 'fallback',
  timestamp: new Date().toISOString(),
};

export async function getRecommendedFees(): Promise<FeeEstimate> {
  const now = Date.now();

  if (cachedFees && (now - cacheTimestamp) < CACHE_DURATION_MS) {
    return cachedFees;
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/v1/fees/recommended`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Mempool fee API returned ${response.status}`);
    }

    const data = await response.json();

    cachedFees = {
      fastestFee: data.fastestFee || 20,
      halfHourFee: data.halfHourFee || 10,
      hourFee: data.hourFee || 5,
      economyFee: data.economyFee || 2,
      minimumFee: data.minimumFee || 1,
      source: 'api',
      timestamp: new Date().toISOString(),
    };
    cacheTimestamp = now;

    console.log(`[FeeEstimator] Fetched fees from mempool.space: fastest=${cachedFees.fastestFee}, halfHour=${cachedFees.halfHourFee}, hour=${cachedFees.hourFee}, economy=${cachedFees.economyFee} sat/vB`);

    return cachedFees;
  } catch (error: any) {
    console.warn(`[FeeEstimator] Failed to fetch fees: ${error.message}. Using fallback.`);
    const fallback = isMainnet() ? MAINNET_FALLBACK : TESTNET_FALLBACK;
    return { ...fallback, timestamp: new Date().toISOString() };
  }
}

export async function estimateTransactionFee(
  priority: 'high' | 'medium' | 'low' | 'economy' = 'medium',
  numInputs: number = 1,
  numOutputs: number = 2,
): Promise<TransactionFeeEstimate> {
  numInputs = Math.max(1, numInputs);
  numOutputs = Math.max(1, numOutputs);
  const fees = await getRecommendedFees();

  let feeRate: number;
  switch (priority) {
    case 'high':
      feeRate = fees.fastestFee;
      break;
    case 'medium':
      feeRate = fees.halfHourFee;
      break;
    case 'low':
      feeRate = fees.hourFee;
      break;
    case 'economy':
      feeRate = fees.economyFee;
      break;
  }

  feeRate = Math.max(feeRate, fees.minimumFee || 1);

  const baseVbytes = 10;
  const inputVbytes = 104 * numInputs;
  const outputVbytes = 43 * numOutputs;
  const estimatedVbytes = baseVbytes + inputVbytes + outputVbytes;

  const feeSats = Math.ceil(feeRate * estimatedVbytes);

  return {
    feeRate,
    feeSats,
    estimatedVbytes,
    priority,
    source: fees.source,
  };
}

export async function estimateMultisigFee(
  priority: 'high' | 'medium' | 'low' | 'economy' = 'medium',
  numInputs: number = 1,
  numOutputs: number = 2,
): Promise<TransactionFeeEstimate> {
  numInputs = Math.max(1, numInputs);
  numOutputs = Math.max(1, numOutputs);
  const fees = await getRecommendedFees();

  let feeRate: number;
  switch (priority) {
    case 'high':
      feeRate = fees.fastestFee;
      break;
    case 'medium':
      feeRate = fees.halfHourFee;
      break;
    case 'low':
      feeRate = fees.hourFee;
      break;
    case 'economy':
      feeRate = fees.economyFee;
      break;
  }

  feeRate = Math.max(feeRate, fees.minimumFee || 1);

  const baseVbytes = 11;
  const inputVbytes = 104 * numInputs;
  const outputVbytes = 43 * numOutputs;
  const estimatedVbytes = baseVbytes + inputVbytes + outputVbytes;
  const feeSats = Math.ceil(feeRate * estimatedVbytes);

  return {
    feeRate,
    feeSats,
    estimatedVbytes,
    priority,
    source: fees.source,
  };
}
