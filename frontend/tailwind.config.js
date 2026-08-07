export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#667EEA', dark: '#5568D3', light: '#A5B4FC' },
        secondary: { DEFAULT: '#764BA2', dark: '#6A4A9B', light: '#D8BFD8' },
        accent: { DEFAULT: '#F97316', light: '#FDBA74' },
        dark: {
          DEFAULT: 'var(--bg-default)',
          default: 'var(--bg-default)',
          card: 'var(--bg-card)',
          border: 'var(--bg-border)',
        },
      },
      opacity: {
        '2': '0.02',
        '3': '0.03',
        '8': '0.08',
      },
      backgroundImage: {
        'gradient': 'linear-gradient(135deg, #667EEA 0%, #764BA2 40%, #F97316 100%)',
      }
    }
  },
  plugins: []
}