import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** Light ("giorno") or dark ("notte"). Follows the system until the user picks one. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? (media.matches ? 'dark' : 'light'));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#161616' : '#ffffff');
  }, [theme]);

  // while the user has not chosen, keep following the system
  useEffect(() => {
    const follow = (e: MediaQueryListEvent) => {
      if (!stored()) setTheme(e.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);

  const toggle = () =>
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* private mode: the choice lasts until reload */
      }
      return next;
    });

  return { theme, toggle };
}
