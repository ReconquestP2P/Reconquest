import { Request, Response, NextFunction } from 'express';
import { getCurrentNetwork } from '../services/bitcoin-network-selector';

interface ValidationFailureTracking {
  count: number;
  firstFailure: Date;
  lastFailure: Date;
}

const failureTracking: Map<string, ValidationFailureTracking> = new Map();
const FAILURE_ALERT_THRESHOLD = 50;
const TRACKING_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export function detectAddressNetwork(address: string): 'mainnet' | 'testnet' | 'unknown' {
  if (!address || typeof address !== 'string') {
    return 'unknown';
  }

  const trimmed = address.trim();

  // Bech32 addresses (most common for modern wallets)
  if (trimmed.startsWith('bc1')) {
    return 'mainnet';
  }
  if (trimmed.startsWith('tb1')) {
    return 'testnet';
  }

  // P2PKH addresses (legacy)
  if (trimmed.startsWith('1')) {
    return 'mainnet';
  }
  if (trimmed.startsWith('m') || trimmed.startsWith('n')) {
    return 'testnet';
  }

  // P2SH addresses (wrapped SegWit)
  if (trimmed.startsWith('3')) {
    return 'mainnet';
  }
  if (trimmed.startsWith('2')) {
    return 'testnet';
  }

  return 'unknown';
}

function redactAddress(address: string): string {
  if (!address || address.length < 10) {
    return '***';
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function getExpectedPrefixes(network: string): string[] {
  if (network === 'mainnet') {
    return ['bc1', '1', '3'];
  }
  return ['tb1', 'm', 'n', '2'];
}

function logValidationEvent(event: string, details: Record<string, any>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    type: 'ADDRESS_VALIDATION',
    event,
    network: getCurrentNetwork(),
    ...details
  }));
}

function trackFailure(sourceIp: string) {
  const now = new Date();
  const existing = failureTracking.get(sourceIp);

  if (existing) {
    // Reset if outside tracking window
    if (now.getTime() - existing.firstFailure.getTime() > TRACKING_WINDOW_MS) {
      failureTracking.set(sourceIp, {
        count: 1,
        firstFailure: now,
        lastFailure: now
      });
    } else {
      existing.count++;
      existing.lastFailure = now;

      if (existing.count >= FAILURE_ALERT_THRESHOLD) {
        logValidationEvent('EXCESSIVE_FAILURES_ALERT', {
          sourceIp: sourceIp === '::1' || sourceIp === '127.0.0.1' ? 'localhost' : 'redacted',
          failureCount: existing.count,
          windowMinutes: Math.round((now.getTime() - existing.firstFailure.getTime()) / 60000),
          alert: 'Possible attack or misconfiguration detected'
        });
      }
    }
  } else {
    failureTracking.set(sourceIp, {
      count: 1,
      firstFailure: now,
      lastFailure: now
    });
  }
}

function cleanupOldTracking() {
  const now = Date.now();
  const entries = Array.from(failureTracking.entries());
  for (const [ip, tracking] of entries) {
    if (now - tracking.firstFailure.getTime() > TRACKING_WINDOW_MS) {
      failureTracking.delete(ip);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupOldTracking, 10 * 60 * 1000);

interface AddressValidationResult {
  valid: boolean;
  field?: string;
  address?: string;
  addressNetwork?: string;
  expectedNetwork?: string;
  addressPrefix?: string;
  expectedPrefixes?: string[];
}

function validateAddressForNetwork(
  address: string,
  fieldName: string,
  currentNetwork: string
): AddressValidationResult {
  if (!address || typeof address !== 'string') {
    return { valid: true }; // Skip empty/non-string values
  }

  const addressNetwork = detectAddressNetwork(address);

  if (addressNetwork === 'unknown') {
    return { valid: true }; // Don't block unknown formats (might be valid new formats)
  }

  if (addressNetwork !== currentNetwork) {
    const prefix = address.slice(0, 3);
    return {
      valid: false,
      field: fieldName,
      address: redactAddress(address),
      addressNetwork,
      expectedNetwork: currentNetwork,
      addressPrefix: prefix,
      expectedPrefixes: getExpectedPrefixes(currentNetwork)
    };
  }

  return { valid: true };
}

const ADDRESS_FIELDS = [
  'escrow_address',
  'escrowAddress',
  'borrower_address',
  'borrowerAddress',
  'lender_address',
  'lenderAddress',
  'btc_address',
  'btcAddress',
  'bitcoin_address',
  'bitcoinAddress',
  'withdrawal_address',
  'withdrawalAddress',
  'deposit_address',
  'depositAddress',
  'recipient_address',
  'recipientAddress',
  'return_address',
  'returnAddress'
];

function extractAddressFields(body: any): Array<{ field: string; value: string }> {
  const addresses: Array<{ field: string; value: string }> = [];

  if (!body || typeof body !== 'object') {
    return addresses;
  }

  for (const field of ADDRESS_FIELDS) {
    if (body[field] && typeof body[field] === 'string') {
      addresses.push({ field, value: body[field] });
    }
  }

  // Also check nested objects (one level deep)
  for (const key of Object.keys(body)) {
    if (body[key] && typeof body[key] === 'object' && !Array.isArray(body[key])) {
      for (const field of ADDRESS_FIELDS) {
        if (body[key][field] && typeof body[key][field] === 'string') {
          addresses.push({ field: `${key}.${field}`, value: body[key][field] });
        }
      }
    }
  }

  return addresses;
}

export function validateNetworkAddresses(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const currentNetwork = getCurrentNetwork();
  const addresses = extractAddressFields(req.body);

  if (addresses.length === 0) {
    return next();
  }

  for (const { field, value } of addresses) {
    const result = validateAddressForNetwork(value, field, currentNetwork);

    if (!result.valid) {
      const sourceIp = req.ip || req.socket.remoteAddress || 'unknown';
      trackFailure(sourceIp);

      logValidationEvent('ADDRESS_REJECTED', {
        field: result.field,
        redactedAddress: result.address,
        detectedNetwork: result.addressNetwork,
        expectedNetwork: result.expectedNetwork,
        route: req.path,
        method: req.method
      });

      return res.status(400).json({
        error: 'Invalid address for current network',
        message: `This is a ${result.addressNetwork} address, but the platform is running on ${result.expectedNetwork}. Please use the correct network address format.`,
        code: 'ADDRESS_NETWORK_MISMATCH',
        details: {
          field: result.field,
          addressPrefix: result.addressPrefix,
          expectedPrefixes: result.expectedPrefixes,
          currentNetwork: result.expectedNetwork
        }
      });
    }
  }

  logValidationEvent('ADDRESSES_VALIDATED', {
    fieldCount: addresses.length,
    fields: addresses.map(a => a.field),
    route: req.path
  });

  next();
}

export function validateAddressEndpoint(req: Request, res: Response) {
  const { address } = req.params;
  const currentNetwork = getCurrentNetwork();

  if (!address) {
    return res.status(400).json({
      error: 'Address required',
      message: 'Please provide an address to validate'
    });
  }

  const detectedNetwork = detectAddressNetwork(address);
  const isValid = detectedNetwork === currentNetwork || detectedNetwork === 'unknown';

  const response: any = {
    address: redactAddress(address),
    detectedNetwork,
    currentNetwork,
    valid: isValid,
    expectedPrefixes: getExpectedPrefixes(currentNetwork)
  };

  if (!isValid) {
    response.message = `This ${detectedNetwork} address is not valid for the current ${currentNetwork} network.`;
    response.suggestion = `Please use an address starting with: ${getExpectedPrefixes(currentNetwork).join(', ')}`;
  } else if (detectedNetwork === 'unknown') {
    response.message = 'Address format not recognized. It may be a new format or invalid.';
    response.warning = 'Validation passed but address format is unknown';
  } else {
    response.message = `Address is valid for ${currentNetwork} network.`;
  }

  res.json(response);
}

export function getValidationStats(req: Request, res: Response) {
  cleanupOldTracking();

  const stats = {
    currentNetwork: getCurrentNetwork(),
    trackingWindowHours: 1,
    alertThreshold: FAILURE_ALERT_THRESHOLD,
    activeTrackingEntries: failureTracking.size,
    totalFailuresInWindow: Array.from(failureTracking.values())
      .reduce((sum, t) => sum + t.count, 0)
  };

  res.json(stats);
}
