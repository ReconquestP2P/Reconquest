import { useState, useCallback, useRef } from 'react';

interface NetworkInfo {
  network: 'testnet' | 'mainnet';
  isMainnet: boolean;
  addressPrefix: string;
}

interface ExplorerResult {
  explorerUrl: string;
  network: string;
  type: string;
  value: string;
}

const explorerCache = new Map<string, string>();

export function useNetworkExplorer() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const networkInfoRef = useRef<NetworkInfo | null>(null);

  const getExplorerUrl = useCallback(async (type: 'address' | 'tx', value: string): Promise<string> => {
    const cacheKey = `${type}:${value}`;
    
    if (explorerCache.has(cacheKey)) {
      return explorerCache.get(cacheKey)!;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`/api/network/explorer/${type}/${encodeURIComponent(value)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch explorer URL');
      }
      
      const data: ExplorerResult = await response.json();
      explorerCache.set(cacheKey, data.explorerUrl);
      return data.explorerUrl;
    } catch (err: any) {
      setError(err.message);
      return type === 'address' 
        ? `https://mempool.space/address/${value}`
        : `https://mempool.space/tx/${value}`;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getAddressUrl = useCallback((address: string) => {
    return getExplorerUrl('address', address);
  }, [getExplorerUrl]);

  const getTxUrl = useCallback((txid: string) => {
    return getExplorerUrl('tx', txid);
  }, [getExplorerUrl]);

  const getNetworkInfo = useCallback(async (): Promise<NetworkInfo | null> => {
    if (networkInfoRef.current) {
      return networkInfoRef.current;
    }

    try {
      const response = await fetch('/api/network/info');
      if (!response.ok) {
        throw new Error('Failed to fetch network info');
      }
      
      const data: NetworkInfo = await response.json();
      networkInfoRef.current = data;
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const openExplorer = useCallback(async (type: 'address' | 'tx', value: string) => {
    const url = await getExplorerUrl(type, value);
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [getExplorerUrl]);

  return {
    getExplorerUrl,
    getAddressUrl,
    getTxUrl,
    getNetworkInfo,
    openExplorer,
    isLoading,
    error,
  };
}

export async function getExplorerUrlSync(type: 'address' | 'tx', value: string): Promise<string> {
  const cacheKey = `${type}:${value}`;
  
  if (explorerCache.has(cacheKey)) {
    return explorerCache.get(cacheKey)!;
  }

  try {
    const response = await fetch(`/api/network/explorer/${type}/${encodeURIComponent(value)}`);
    if (!response.ok) {
      throw new Error('Failed to fetch explorer URL');
    }
    
    const data: ExplorerResult = await response.json();
    explorerCache.set(cacheKey, data.explorerUrl);
    return data.explorerUrl;
  } catch {
    return type === 'address' 
      ? `https://mempool.space/address/${value}`
      : `https://mempool.space/tx/${value}`;
  }
}
