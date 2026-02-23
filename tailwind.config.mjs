/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                brand: {
                    DEFAULT: '#39FF14',
                    50: '#E8FFE0',
                    100: '#CCFFBD',
                    200: '#9FFF82',
                    300: '#72FF47',
                    400: '#39FF14',
                    500: '#2DD60E',
                    600: '#22A30A',
                    700: '#177007',
                    800: '#0C3D04',
                    900: '#061F02',
                },
                surface: {
                    DEFAULT: '#0a0a0a',
                    50: '#f7f7f7',
                    100: '#e3e3e3',
                    200: '#c8c8c8',
                    300: '#a4a4a4',
                    400: '#818181',
                    500: '#666666',
                    600: '#515151',
                    700: '#434343',
                    800: '#383838',
                    900: '#111827',
                    950: '#0a0a0a',
                },
            },
            fontFamily: {
                display: ['Oswald', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                body: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
            },
            keyframes: {
                'fade-up': {
                    '0%': { opacity: '0', transform: 'translateY(24px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'slide-in-right': {
                    '0%': { transform: 'translateX(100%)' },
                    '100%': { transform: 'translateX(0)' },
                },
                'slide-in-left': {
                    '0%': { transform: 'translateX(-100%)' },
                    '100%': { transform: 'translateX(0)' },
                },
                'glow-pulse': {
                    '0%, 100%': { boxShadow: '0 0 20px rgba(57, 255, 20, 0.3)' },
                    '50%': { boxShadow: '0 0 40px rgba(57, 255, 20, 0.6)' },
                },
                marquee: {
                    '0%': { transform: 'translateX(0)' },
                    '100%': { transform: 'translateX(-50%)' },
                },
                'scale-in': {
                    '0%': { opacity: '0', transform: 'scale(0.95)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                'reveal-up': {
                    '0%': { opacity: '0', transform: 'translateY(40px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'cart-bounce': {
                    '0%, 100%': { transform: 'scale(1)' },
                    '30%': { transform: 'scale(1.3)' },
                    '60%': { transform: 'scale(0.9)' },
                    '80%': { transform: 'scale(1.1)' },
                },
                'shimmer': {
                    '0%': { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition: '200% 0' },
                },
            },
            animation: {
                'fade-up': 'fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'fade-in': 'fade-in 0.4s ease-out forwards',
                'slide-in-right': 'slide-in-right 0.3s ease-out forwards',
                'slide-in-left': 'slide-in-left 0.3s ease-out forwards',
                'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
                marquee: 'marquee 20s linear infinite',
                'scale-in': 'scale-in 0.3s ease-out forwards',
                'reveal-up': 'reveal-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'cart-bounce': 'cart-bounce 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) forwards',
                'shimmer': 'shimmer 2s linear infinite',
            },
            backdropBlur: {
                xs: '2px',
            },
        },
    },
    plugins: [],
};
