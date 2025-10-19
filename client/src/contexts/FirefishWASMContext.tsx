import { createContext, useContext, ReactNode } from 'react';
import { useFirefishWASM, UseFirefishWASMReturn } from '@/hooks/use-firefish-wasm';

const FirefishWASMContext = createContext<UseFirefishWASMReturn | null>(null);

export function FirefishWASMProvider({ children }: { children: ReactNode }) {
  const firefishWASM = useFirefishWASM();

  return (
    <FirefishWASMContext.Provider value={firefishWASM}>
      {children}
    </FirefishWASMContext.Provider>
  );
}

export function useFirefishWASMContext(): UseFirefishWASMReturn {
  const context = useContext(FirefishWASMContext);
  
  if (!context) {
    throw new Error('useFirefishWASMContext must be used within FirefishWASMProvider');
  }
  
  return context;
}
