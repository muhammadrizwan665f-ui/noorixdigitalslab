const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-mode="dark"]'],
  theme: {
    extend: {
      colors: {
        navy: { 950: v('n950'), 900: v('n900'), 800: v('n800'), 700: v('n700'), 600: v('n600') },
        brand: { DEFAULT: v('brand'), 600: v('brand-600'), 50: v('brand-50'), 100: v('brand-100') },
        cyan2: v('accent2'),
        mist: v('mist'),
        surface: v('surface'),
        line: v('line'),
      },
      fontFamily: { sans: ['ui-sans-serif', 'Inter', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / .05), 0 10px 30px -14px rgb(var(--shadow) / .22)',
        lift: '0 2px 4px rgb(var(--shadow) / .06), 0 22px 44px -18px rgb(var(--shadow) / .35)',
        glow: '0 0 0 1px rgb(var(--brand) / .5), 0 10px 40px -8px rgb(var(--brand) / .55)',
      },
      keyframes: {
        pop: { '0%': { transform: 'scale(.6)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        rise: { '0%': { transform: 'translateY(8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
      },
      animation: { pop: 'pop .35s cubic-bezier(.3,1.4,.5,1) both', rise: 'rise .5s ease-out both', float: 'float 6s ease-in-out infinite' },
    },
  },
  plugins: [],
};
