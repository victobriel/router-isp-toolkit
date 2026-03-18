/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{html,js,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
      },
    },
  },
  plugins: [],
};
