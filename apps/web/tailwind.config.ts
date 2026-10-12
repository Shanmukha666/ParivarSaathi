import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'var(--font-noto-hindi)', 'var(--font-noto-telugu)', 'var(--font-noto-tamil)', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-inter)', 'var(--font-noto-hindi)', 'var(--font-noto-telugu)', 'var(--font-noto-tamil)', 'sans-serif'],
      },
      colors: {
        ink: { DEFAULT: '#0C1311', 800: '#111B18', 700: '#18241F', 600: '#22322B' },
        lime: { DEFAULT: '#D6F36A', 300: '#E3F89A', 600: '#B9D94A' },
        primary: '#0C7A5B',
        secondary: '#0C7A5B',
        background: '#F2F6F4',
        textDark: '#0F1B17',
        // brand: replaces the default orange scale so every existing class restyles
        orange: { 50: '#EEF9F4', 100: '#D6F0E4', 200: '#ABE0C8', 300: '#74CBA8', 400: '#3FB188', 500: '#12936F', 600: '#0C7A5B', 700: '#09614A', 800: '#084C3B', 900: '#063A2D', 950: '#04261D' },
        amber: { 50: '#FBF8EC', 100: '#F5EDCB', 200: '#E8DA9E', 400: '#C9A93A', 600: '#9A7A12', 700: '#7C610E', 800: '#614C0B', 900: '#4A3A09' },
        slate: { 50: '#F4F7F6', 100: '#E9EFEC', 200: '#D7E0DC', 300: '#B8C6C0', 500: '#586679' },
        emerald: { 600: '#047857', 700: '#065F46' },
      },
      fontSize: {
        xs: '14px',
        sm: '16px',
        base: '18px',
        lg: '20px',
        xl: '24px',
        '2xl': '32px',
      }
    },
  },
  plugins: [],
};
export default config;
