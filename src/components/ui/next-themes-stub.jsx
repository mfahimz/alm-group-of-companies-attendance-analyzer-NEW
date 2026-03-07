import React, { createContext, useContext } from 'react';

const ThemeContext = createContext({ theme: 'light', setTheme: () => {} });

export function ThemeProvider({ children }) {
    return React.createElement(ThemeContext.Provider, { value: { theme: 'light', setTheme: () => {} } }, children);
}

export function useTheme() {
    return useContext(ThemeContext);
}