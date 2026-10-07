import { useTheme } from '../lib/theme';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-pressed={dark}
      title={dark ? 'Passa alla versione chiara' : 'Passa alla versione scura'}
    >
      <span className={dark ? undefined : 'on'}>Giorno</span>
      <span className={dark ? 'on' : undefined}>Notte</span>
    </button>
  );
}
