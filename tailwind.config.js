/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        tv: {
          bg: '#0A0C14',
          surface: '#10131C',
          panel: '#151924',
          border: '#222738',
          purple: '#8B7CFF',
          green: '#22E38A',
          red: '#FF4D6A',
          amber: '#F5C15C',
          blue: '#6EA8FF',
          muted: '#8B93A7',
        },
        cp: {
          bg: '#0A0C14',
          surface: '#10131C',
          panel: '#151924',
          border: '#222738',
          green: '#22E38A',
          red: '#FF4D6A',
          amber: '#F5C15C',
          text: '#f0f0f0',
          muted: '#8B93A7',
          dim: '#374151',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'glow-green': '0 0 12px rgba(34,227,138,0.35)',
        'glow-red': '0 0 12px rgba(255,77,106,0.35)',
        'glow-amber': '0 0 12px rgba(245,193,92,0.35)',
        'glow-purple': '0 0 16px rgba(139,124,255,0.35)',
        'glow-green-lg': '0 0 24px rgba(34,227,138,0.3)',
        'glow-red-lg': '0 0 24px rgba(255,77,106,0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.25s ease-in-out',
        'slide-in': 'slideIn 0.25s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'blink': 'blink 1.2s step-end infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideIn: {
          '0%': { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(139,124,255,0.2)' },
          '50%': { boxShadow: '0 0 20px rgba(139,124,255,0.45)' },
        },
        blink: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } },
      },
    },
  },
  plugins: [],
};
