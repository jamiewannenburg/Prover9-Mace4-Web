import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';

interface AdditionalOptionsContextType {
  additionalInput: string;
  setAdditionalInput: (value: string) => void;
  clearAdditionalInput: () => void;
}

const AdditionalOptionsContext = createContext<AdditionalOptionsContextType | undefined>(undefined);

export const AdditionalOptionsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [additionalInput, setAdditionalInput] = useState<string>('');

  // Load from localStorage on initial mount
  useEffect(() => {
    const savedInput = localStorage.getItem('additional_input');
    if (savedInput) {
      setAdditionalInput(savedInput);
    }
  }, []);

  // Save to localStorage when additional input changes
  useEffect(() => {
    localStorage.setItem('additional_input', additionalInput);
  }, [additionalInput]);

  const clearAdditionalInput = () => {
    setAdditionalInput('');
  };

  return (
    <AdditionalOptionsContext.Provider 
      value={{ 
        additionalInput,
        setAdditionalInput,
        clearAdditionalInput
      }}
    >
      {children}
    </AdditionalOptionsContext.Provider>
  );
};

export const useAdditionalOptions = (): AdditionalOptionsContextType => {
  const context = useContext(AdditionalOptionsContext);
  if (context === undefined) {
    throw new Error('useAdditionalOptions must be used within an AdditionalOptionsProvider');
  }
  return context;
}; 