export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#050e1b', 900: '#071426', 800: '#0b1f3a', 700: '#12305a', 600: '#1a4478' },
        brand: { DEFAULT: '#087BFF', 600: '#0668d9', 50: '#eaf3ff', 100: '#d4e7ff' },
        cyan2: '#22d3ee',
        mist: '#F4F7FC',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(7,20,38,.05), 0 8px 24px -12px rgba(7,20,38,.18)' },
    },
  },
  plugins: [],
};
