import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

// Sin las variables de Supabase, el build NO falla: produce un bundle sin la
// aplicación y sale con código 0.
//
// Pasa porque src/lib/supabaseClient.js hace `throw` en el nivel superior del
// módulo cuando faltan. Vite sustituye import.meta.env.* por literales en
// tiempo de compilación, así que la condición se pliega a `if (true) throw` y
// el optimizador borra todo lo que sigue — y por dependencia, el árbol entero.
// Quedan 291 KB de proveedores y una pantalla en blanco.
//
// En Vercel eso es un despliegue "exitoso" que publica una página vacía: una
// variable mal escrita en el panel y nadie se entera hasta que un cliente
// abre la app. Esta guarda convierte ese silencio en un error de build.
function requireSupabaseEnv(mode) {
  return {
    name: 'require-supabase-env',
    buildStart() {
      // loadEnv lee .env* del proyecto; process.env cubre el panel de Vercel.
      const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
      const faltan = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((k) => !env[k])
      if (faltan.length) {
        this.error(
          `Faltan variables de entorno: ${faltan.join(', ')}.\n` +
          'Sin ellas el bundle se compila SIN la aplicación y el sitio sale en blanco.\n' +
          'En local: copia .env.example a .env.local y llénalo.\n' +
          'En Vercel: Settings → Environment Variables, y vuelve a desplegar.'
        )
      }
    },
  }
}

// A unique id per build. The running app compares this against /version.json to
// detect a new deploy and reload itself (see useAutoUpdate in App.jsx).
const BUILD_ID = String(Date.now())

// Writes dist/version.json after the bundle is built, so the deployed app can
// poll it (served no-cache via vercel.json) and know when it's outdated.
function emitVersion() {
  return {
    name: 'emit-version',
    closeBundle() {
      try { writeFileSync(resolve('dist', 'version.json'), JSON.stringify({ build: BUILD_ID })) } catch { /* ignore */ }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [requireSupabaseEnv(mode), react(), emitVersion()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
}))
