/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Espejo de src/theme.js — mantener los dos en sincronia.
        // Los nombres estan invertidos a proposito: ver el encabezado de
        // theme.js. `bone` es el negro de fondo, `ink` el hueso del texto.
        bone: '#0B0B0C',
        ink: '#EEEAE2',
        cream: '#1A1A1D',
        charcoal: '#EEEAE2',
        gold: '#C4A464',
        goldDeep: '#765E2D',
        forest: '#23457A',
        navy: '#23457A',
        moss: '#9A968E',
        mossDeep: '#66635B',
        sand: '#9A968E',
      },
      fontFamily: {
        // Dos familias, tres papeles. Se usan por las clases globales de
        // index.css (.display, .mono, .ui-strong) mas que por utilidades de
        // Tailwind; estas quedan por consistencia.
        //
        // Archivo es variable en peso Y en ancho: `expanded` es la misma
        // familia a font-stretch 125%, que es lo que el brand book llama
        // "Archivo Expanded". Un solo archivo de fuente cubre los dos.
        sans: ['Archivo', '-apple-system', 'sans-serif'],
        display: ['Archivo', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      fontStretch: {
        expanded: '125%',
        normal: '100%',
      },
    },
  },
  plugins: [],
}
