import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { Mace4Options } from '../types';
import { DEFAULT_OPTIONS } from '../components/Mace4OptionsPanel';

interface Mace4OptionsContextType {
  options: Partial<Mace4Options>;
  setOptions: (options: Partial<Mace4Options>) => void;
  updateOptions: (newOptions: Partial<Mace4Options>) => void;
  clearOptions: () => void;
}

const Mace4OptionsContext = createContext<Mace4OptionsContextType | undefined>(undefined);

export const Mace4OptionsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [options, setOptions] = useState<Partial<Mace4Options>>(DEFAULT_OPTIONS);

  // Load from localStorage on initial mount
  useEffect(() => {
    const savedOptions = localStorage.getItem('mace4_options');
    if (savedOptions) {
      try {
        setOptions(JSON.parse(savedOptions));
      } catch (error) {
        console.warn('Error parsing saved Mace4 options:', error);
      }
    }
  }, []);

  // Save to localStorage when options change
  useEffect(() => {
    localStorage.setItem('mace4_options', JSON.stringify(options));
  }, [options]);

  const updateOptions = (newOptions: Partial<Mace4Options>) => {
    setOptions(prev => ({ ...prev, ...newOptions }));
  };

  const clearOptions = () => {
    setOptions(DEFAULT_OPTIONS);
  };

  return (
    <Mace4OptionsContext.Provider 
      value={{ 
        options, 
        setOptions, 
        updateOptions,
        clearOptions
      }}
    >
      {children}
    </Mace4OptionsContext.Provider>
  );
};

export const useMace4Options = (): Mace4OptionsContextType => {
  const context = useContext(Mace4OptionsContext);
  if (context === undefined) {
    throw new Error('useMace4Options must be used within a Mace4OptionsProvider');
  }
  return context;
}; 