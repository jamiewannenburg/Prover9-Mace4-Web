import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';

interface FormulaContextType {
  assumptions: string;
  goals: string;
  setAssumptions: (value: string) => void;
  setGoals: (value: string) => void;
  updateFormulas: (newAssumptions: string, newGoals: string) => void;
  clearFormulas: () => void;
}

const FormulaContext = createContext<FormulaContextType | undefined>(undefined);

export const FormulaProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [assumptions, setAssumptions] = useState<string>('');
  const [goals, setGoals] = useState<string>('');

  // Load from localStorage on initial mount
  useEffect(() => {
    const savedAssumptions = localStorage.getItem('assumptions');
    const savedGoals = localStorage.getItem('goals');
    
    if (savedAssumptions) setAssumptions(savedAssumptions);
    if (savedGoals) setGoals(savedGoals);
  }, []);

  // Save to localStorage when assumptions or goals change
  useEffect(() => {
    localStorage.setItem('assumptions', assumptions);
    localStorage.setItem('goals', goals);
  }, [assumptions, goals]);

  const updateFormulas = (newAssumptions: string, newGoals: string) => {
    setAssumptions(newAssumptions);
    setGoals(newGoals);
  };

  const clearFormulas = () => {
    setAssumptions('');
    setGoals('');
  };

  return (
    <FormulaContext.Provider 
      value={{ 
        assumptions, 
        goals, 
        setAssumptions, 
        setGoals,
        updateFormulas,
        clearFormulas
      }}
    >
      {children}
    </FormulaContext.Provider>
  );
};

export const useFormulas = (): FormulaContextType => {
  const context = useContext(FormulaContext);
  if (context === undefined) {
    throw new Error('useFormulas must be used within a FormulaProvider');
  }
  return context;
}; 