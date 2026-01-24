import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useNetworkExplorer } from '@/hooks/useNetworkExplorer';

interface ExplorerLinkProps {
  type: 'address' | 'tx';
  value: string;
  className?: string;
  children?: React.ReactNode;
  showIcon?: boolean;
  testId?: string;
}

export function ExplorerLink({ 
  type, 
  value, 
  className = '', 
  children, 
  showIcon = true,
  testId 
}: ExplorerLinkProps) {
  const [explorerUrl, setExplorerUrl] = useState<string>('');
  const { getExplorerUrl } = useNetworkExplorer();

  useEffect(() => {
    if (value) {
      getExplorerUrl(type, value).then(setExplorerUrl);
    }
  }, [type, value, getExplorerUrl]);

  return (
    <a
      href={explorerUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      data-testid={testId}
    >
      {children}
      {showIcon && <ExternalLink className="h-3 w-3 inline ml-1" />}
    </a>
  );
}

export function AddressLink({ 
  address, 
  className = 'text-blue-500 hover:underline',
  displayText,
  testId 
}: { 
  address: string; 
  className?: string;
  displayText?: string;
  testId?: string;
}) {
  const [explorerUrl, setExplorerUrl] = useState<string>('');
  const { getAddressUrl } = useNetworkExplorer();

  useEffect(() => {
    if (address) {
      getAddressUrl(address).then(setExplorerUrl);
    }
  }, [address, getAddressUrl]);

  const display = displayText || `${address.slice(0, 12)}...${address.slice(-8)}`;

  return (
    <a
      href={explorerUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      data-testid={testId}
    >
      {display}
      <ExternalLink className="h-3 w-3 inline ml-1" />
    </a>
  );
}

export function TxLink({ 
  txid, 
  className = 'text-blue-500 hover:underline',
  displayText,
  testId 
}: { 
  txid: string; 
  className?: string;
  displayText?: string;
  testId?: string;
}) {
  const [explorerUrl, setExplorerUrl] = useState<string>('');
  const { getTxUrl } = useNetworkExplorer();

  useEffect(() => {
    if (txid) {
      getTxUrl(txid).then(setExplorerUrl);
    }
  }, [txid, getTxUrl]);

  const display = displayText || `${txid.slice(0, 8)}...${txid.slice(-6)}`;

  return (
    <a
      href={explorerUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      data-testid={testId}
    >
      {display}
      <ExternalLink className="h-3 w-3 inline ml-1" />
    </a>
  );
}
