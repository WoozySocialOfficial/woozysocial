import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext({});

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Apply theme to DOM immediately (called both on init and on change)
const applyThemeToDOM = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);

  // Also set class for broader CSS compatibility
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(theme);
  document.body.classList.remove('light', 'dark');
  document.body.classList.add(theme);

  // Update meta theme-color for mobile browsers
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', theme === 'dark' ? '#18181b' : '#ffffff');
  }
};

// Check localStorage and system preference for initial theme
const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'light';

  const savedTheme = localStorage.getItem('woozy_theme');
  if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
    return savedTheme;
  }
  // Check system preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

// Apply theme immediately before React hydrates to prevent flash
const initialTheme = getInitialTheme();
applyThemeToDOM(initialTheme);

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(initialTheme);

  // Custom setTheme that also saves to localStorage
  const setTheme = useCallback((newTheme) => {
    if (newTheme !== 'light' && newTheme !== 'dark') return;

    setThemeState(newTheme);
    localStorage.setItem('woozy_theme', newTheme);
    applyThemeToDOM(newTheme);
  }, []);

  // Apply theme to document whenever it changes
  useEffect(() => {
    applyThemeToDOM(theme);
    localStorage.setItem('woozy_theme', theme);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      const savedTheme = localStorage.getItem('woozy_theme');
      // Only auto-switch if user hasn't manually set a preference
      if (!savedTheme) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [setTheme]);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const setLightTheme = () => setTheme('light');
  const setDarkTheme = () => setTheme('dark');

  const value = {
    theme,
    isDark: theme === 'dark',
    isLight: theme === 'light',
    toggleTheme,
    setLightTheme,
    setDarkTheme,
    setTheme
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
