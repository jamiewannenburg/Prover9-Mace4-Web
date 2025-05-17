import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { Prover9Options } from '../types';

interface Prover9OptionsContextType {
  options: Partial<Prover9Options>;
  setOptions: (options: Partial<Prover9Options>) => void;
  updateOptions: (newOptions: Partial<Prover9Options>) => void;
  clearOptions: () => void;
}

const Prover9OptionsContext = createContext<Prover9OptionsContextType | undefined>(undefined);

export const Prover9OptionsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [options, setOptions] = useState<Partial<Prover9Options>>({});

  // Load from localStorage on initial mount
  useEffect(() => {
    const savedOptions = localStorage.getItem('prover9_options');
    if (savedOptions) {
      try {
        setOptions(JSON.parse(savedOptions));
      } catch (error) {
        console.warn('Error parsing saved Prover9 options:', error);
      }
    }
  }, []);

  // Save to localStorage when options change
  useEffect(() => {
    localStorage.setItem('prover9_options', JSON.stringify(options));
  }, [options]);

  const updateOptions = (newOptions: Partial<Prover9Options>) => {
    setOptions(prev => ({ ...prev, ...newOptions }));
  };

  const clearOptions = () => {
    setOptions({});
  };

  return (
    <Prover9OptionsContext.Provider 
      value={{ 
        options, 
        setOptions, 
        updateOptions,
        clearOptions
      }}
    >
      {children}
    </Prover9OptionsContext.Provider>
  );
};

export const useProver9Options = (): Prover9OptionsContextType => {
  const context = useContext(Prover9OptionsContext);
  if (context === undefined) {
    throw new Error('useProver9Options must be used within a Prover9OptionsProvider');
  }
  return context;
}; 