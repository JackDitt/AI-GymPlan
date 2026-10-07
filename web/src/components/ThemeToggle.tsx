import { useTheme } from '../lib/theme';
import { MoonIcon, SunIcon } from './Icons';

/** One icon button: the moon switches to night, the sun back to day. */
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  const label = dark ? 'Passa alla versione chiara' : 'Passa alla versione scura';
  return (
    <button type="button" className="icon-btn theme-toggle" onClick={toggle} aria-label={label} title={label}>
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
