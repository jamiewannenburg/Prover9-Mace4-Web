import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';

interface LanguageOptionsContextType {
  options: string;
  setOptions: (options: string) => void;
  updateOptions: (newOptions: string) => void;
  clearOptions: () => void;
}

const LanguageOptionsContext = createContext<LanguageOptionsContextType | undefined>(undefined);

export const LanguageOptionsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [options, setOptions] = useState<string>('');

  // Load from localStorage on initial mount
  useEffect(() => {
    const savedOptions = localStorage.getItem('language_options');
    if (savedOptions) {
      try {
        setOptions(savedOptions);
      } catch (error) {
        console.warn('Error parsing saved language options:', error);
      }
    }
  }, []);

  // Save to localStorage when options change
  useEffect(() => {
    localStorage.setItem('language_options', options);
  }, [options]);

  const updateOptions = (newOptions: string) => {
    setOptions(newOptions);
  };

  const clearOptions = () => {
    setOptions('');
  };

  return (
    <LanguageOptionsContext.Provider 
      value={{ 
        options, 
        setOptions, 
        updateOptions,
        clearOptions
      }}
    >
      {children}
    </LanguageOptionsContext.Provider>
  );
};

export const useLanguageOptions = (): LanguageOptionsContextType => {
  const context = useContext(LanguageOptionsContext);
  if (context === undefined) {
    throw new Error('useLanguageOptions must be used within a LanguageOptionsProvider');
  }
  return context;
}; 