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
        cp: {
          bg:      '#0d0f14',
          surface: '#111318',
          panel:   '#13161d',
          border:  '#1a1d26',
          green:   '#00ff88',
          red:     '#ff3b3b',
          amber:   '#f59e0b',
          text:    '#f0f0f0',
          muted:   '#6b7280',
          dim:     '#374151',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        'glow-green': '0 0 12px rgba(0,255,136,0.4)',
        'glow-red':   '0 0 12px rgba(255,59,59,0.4)',
        'glow-amber': '0 0 12px rgba(245,158,11,0.4)',
        'glow-green-lg': '0 0 24px rgba(0,255,136,0.35)',
        'glow-red-lg':   '0 0 24px rgba(255,59,59,0.35)',
      },
      animation: {
        'pulse-slow':  'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':     'fadeIn 0.25s ease-in-out',
        'slide-in':    'slideIn 0.25s ease-out',
        'glow-pulse':  'glowPulse 2s ease-in-out infinite',
        'blink':       'blink 1.2s step-end infinite',
      },
      keyframes: {
        fadeIn:    { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideIn:   { '0%': { transform: 'translateY(-8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(0,255,136,0.25)' },
          '50%':      { boxShadow: '0 0 20px rgba(0,255,136,0.55)' },
        },
        blink: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } },
      },
    },
  },
  plugins: [],
};
