/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        navy: {
          800: '#1b2440',
          900: '#131a30',
          950: '#0c1120',
        },
      },
    },
  },
  plugins: [],
};
