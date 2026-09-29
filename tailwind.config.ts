import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EBF2FF',
          100: '#D6E4FF',
          500: '#2F68FE',
          600: '#1D52EB',
          700: '#143EC8',
        },
        surface: {
          canvas: '#F8F9FA',
          card: '#FFFFFF',
          secondary: '#F2F4F7',
          hover: '#EAECEF',
          border: '#EBEEF2',
          subtle: '#EFF0F3',
        },
        finText: {
          primary: '#111827',
          secondary: '#6B7280',
          muted: '#9CA3AF',
        },
      },
      borderRadius: {
        '2xl': '20px',
        '3xl': '24px',
      },
      boxShadow: {
        copilot: '0 1px 3px rgba(0, 0, 0, 0.03), 0 6px 16px rgba(0, 0, 0, 0.02)',
        'copilot-hover': '0 4px 12px rgba(0, 0, 0, 0.06), 0 12px 24px rgba(0, 0, 0, 0.03)',
        'copilot-button': '0 4px 12px rgba(47, 104, 254, 0.22)',
        'copilot-modal': '0 20px 48px -10px rgba(0, 0, 0, 0.12)',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}

export default config

