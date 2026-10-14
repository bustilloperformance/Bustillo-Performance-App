#!/usr/bin/env node
// ============================================================
//  AUDITORIA DE CONTRASTE — BUSTILLO PERFORMANCE
// ============================================================
// Por que existe: la app invirtio su paleta (ver src/theme.js) y quedaron
// dos juegos de colores que no se mezclan — uno para las superficies
// OSCURAS (negro, carbon) y otro para el CROMO claro (barra lateral, barra
// superior movil). La misma clase de error aparecio cuatro veces seguidas:
//
//   1. Un boton declara `background` y NO declara `color`, asi que el icono
//      hereda el color del padre. Oro con icono de hueso = 1.98:1.
//   2. Un ternario deja `'transparent'` y se razona como si cayera sobre la
//      pagina negra, cuando cae sobre el cromo claro. Acero ahi = 2.46:1.
//
// Rehacer la auditoria a mano cada vez no escala. Este script la deja como
// herramienta del repo.
//
//   node scripts/auditar-contraste.mjs            # solo los fallos
//   node scripts/auditar-contraste.mjs --todo     # + las advertencias
//   node scripts/auditar-contraste.mjs --tabla    # la tabla de la paleta
//
// Sale con codigo 1 si hay fallos, para poder colgarlo de un hook o de CI.

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, dirname } from 'path'
import { fileURLToPath } from 'url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(raiz, 'src')

// ------------------------------------------------------------
//  LA PALETA — se lee de src/theme.js, no se copia
// ------------------------------------------------------------
// Copiarla aqui garantizaria que algun dia mienta. Se extrae del archivo.
function leerPaleta() {
  const texto = readFileSync(join(SRC, 'theme.js'), 'utf8')
  const cuerpo = texto.slice(texto.indexOf('export const C = {'))
  const paleta = {}
  for (const m of cuerpo.matchAll(/^\s{2}(\w+):\s*'(#[0-9a-fA-F]{6})'/gm)) {
    paleta[m[1]] = m[2].toUpperCase()
  }
  return paleta
}

const C = leerPaleta()

// Las tres superficies que existen en la app. La etiqueta es el nombre del
// brand book, no el del token, porque los tokens estan invertidos.
const SUPERFICIES = [
  { token: 'bone', etiqueta: 'negro (pagina)' },
  { token: 'cream', etiqueta: 'carbon (tarjetas)' },
  { token: 'ink', etiqueta: 'hueso (cromo)' },
]

// Los archivos donde vive el cromo CLARO. Un `'transparent'` aqui cae sobre
// hueso, no sobre negro — es la trampa que ya costo cuatro vueltas.
const ARCHIVOS_DE_CROMO = ['components/Shell.jsx']

// ------------------------------------------------------------
//  WCAG 2.1 — luminancia relativa y razon de contraste
// ------------------------------------------------------------
function canal(v) {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminancia(hex) {
  const n = parseInt(hex.slice(1), 16)
  return (
    0.2126 * canal((n >> 16) & 255) +
    0.7152 * canal((n >> 8) & 255) +
    0.0722 * canal(n & 255)
  )
}

function contraste(a, b) {
  const la = luminancia(a)
  const lb = luminancia(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// Texto normal pide 4.5:1. Un icono o un texto grande pasa con 3:1, pero
// aqui no se distingue el tamano de forma fiable, asi que el umbral duro es
// 3.0 (fallo seguro) y entre 3.0 y 4.5 queda como sospecha.
const FALLO = 3.0
const MINIMO = 4.5

// ------------------------------------------------------------
//  LECTURA DE LOS ESTILOS EN LINEA
// ------------------------------------------------------------
function archivosJsx(dir) {
  const salida = []
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) salida.push(...archivosJsx(ruta))
    else if (/\.jsx?$/.test(nombre)) salida.push(ruta)
  }
  return salida
}

// Saca cada `style={{ ... }}` con llaves balanceadas, la linea donde abre, y
// los hijos del elemento que lo lleva — que es lo que decide si un fondo sin
// `color` es un bug o solo un contenedor.
function objetosDeEstilo(texto) {
  const salida = []
  const marca = /style=\{\{/g
  let m
  while ((m = marca.exec(texto))) {
    const inicioCuerpo = m.index + m[0].length
    let i = inicioCuerpo
    let nivel = 2
    while (i < texto.length && nivel > 0) {
      if (texto[i] === '{') nivel++
      else if (texto[i] === '}') nivel--
      i++
    }
    const cuerpo = texto.slice(inicioCuerpo, i - 2)

    // El nombre de la etiqueta: el ultimo `<Algo` antes del style.
    const previo = texto.slice(0, m.index)
    const etiqueta = [...previo.matchAll(/<([A-Za-z][\w.]*)/g)].pop()
    const nombre = etiqueta ? etiqueta[1] : ''
    const { hijos, fin } = hijosDe(texto, i, nombre)

    salida.push({
      cuerpo,
      nombre,
      hijos,
      // Donde empieza este estilo y donde acaba su elemento, para saber que
      // objetos de estilo caen DENTRO de el.
      inicio: m.index,
      fin,
      linea: previo.split('\n').length,
    })
  }
  return salida
}

// Desde el final del objeto de estilo, cierra la etiqueta de apertura y
// devuelve el codigo de los hijos (vacio si cierra sola) y donde acaba el
// elemento completo.
function hijosDe(texto, desde, nombre) {
  let i = desde
  let nivel = 0
  let cita = null
  while (i < texto.length) {
    const ch = texto[i]
    if (cita) {
      if (ch === '\\') i++
      else if (ch === cita) cita = null
    } else if (ch === "'" || ch === '"' || ch === '`') cita = ch
    else if (ch === '{') nivel++
    else if (ch === '}') nivel--
    else if (ch === '>' && nivel === 0) break
    i++
  }
  if (texto[i - 1] === '/') return { hijos: '', fin: i }
  if (!nombre) return { hijos: '', fin: i }
  // Busca el cierre, saltandose los anidados con el mismo nombre.
  const abre = new RegExp(`<${nombre}[\\s/>]`, 'g')
  const cierra = new RegExp(`</${nombre}>`, 'g')
  const inicio = i + 1
  let profundidad = 1
  let cursor = inicio
  while (profundidad > 0 && cursor < texto.length) {
    abre.lastIndex = cursor
    cierra.lastIndex = cursor
    const a = abre.exec(texto)
    const c = cierra.exec(texto)
    if (!c) return { hijos: texto.slice(inicio), fin: texto.length }
    if (a && a.index < c.index) {
      profundidad++
      cursor = a.index + a[0].length
    } else {
      profundidad--
      if (profundidad === 0) {
        return { hijos: texto.slice(inicio, c.index), fin: c.index }
      }
      cursor = c.index + c[0].length
    }
  }
  return { hijos: texto.slice(inicio), fin: texto.length }
}

// Los hijos que declaran `color` pero NO `background`: su texto cae sobre el
// fondo del padre. Es el par que mas se escapa al leer el codigo, porque las
// dos mitades estan en lineas distintas — el oro de relleno en el padre y el
// hueso del contenido en el hijo.
function coloresDeHijos(hijos) {
  const salida = []
  // Un hijo que pone su propio fondo tapa al padre: lo que haya DENTRO de el
  // ya no cae sobre el relleno del padre, sino sobre el suyo. Ese subarbol se
  // salta — si no, un icono se compararia contra su abuelo.
  let limite = -1
  for (const o of objetosDeEstilo(hijos).sort((a, b) => a.inicio - b.inicio)) {
    if (o.inicio < limite) continue
    if (valorDe(o.cuerpo, ['background', 'backgroundColor'])) {
      limite = Math.max(limite, o.fin)
      continue
    }
    const expr = valorDe(o.cuerpo, ['color'])
    if (!expr) continue
    salida.push({ desplazamiento: o.linea - 1, expr })
  }
  return salida
}

// Empareja una expresion de fondo con una de color. Si las dos se deciden
// con la misma condicion, solo conviven las ramas que van a la par — un
// `isOnline ? C.gold : C.cream` en el fondo y un `isOnline ? C.sand :
// C.charcoal` en el color solo producen gold+sand y cream+charcoal, nunca
// gold+charcoal. Y baja en los ternarios anidados, que es donde se esconde
// el estado de tres valores (owner / coach / client).
function paresDeExpr(eFondo, eTexto) {
  const rf = ramas(eFondo)
  const rt = ramas(eTexto)
  const gf = rf.map((r) => normaliza(r.guarda)).join('|')
  const gt = rt.map((r) => normaliza(r.guarda)).join('|')

  if (rf.length > 1 && rf.length === rt.length && gf === gt) {
    return rf.flatMap((b, i) => paresDeExpr(b.valor, rt[i].valor))
  }
  // Un lado fijo y el otro condicional: cruzarlos es exacto.
  if (rf.length > 1 && rt.length === 1) {
    return rf.flatMap((b) => paresDeExpr(b.valor, eTexto))
  }
  if (rt.length > 1 && rf.length === 1) {
    return rt.flatMap((f) => paresDeExpr(eFondo, f.valor))
  }
  // Hojas, o dos condiciones distintas: no queda mas que cruzar, y entonces
  // el par es una sospecha, no un hecho.
  return [
    {
      fondo: coloresPosibles(eFondo),
      texto: coloresPosibles(eTexto),
      seguro: rf.length === 1 && rt.length === 1,
    },
  ]
}

// Que hereda el color de este elemento: un icono sin color propio, o texto
// suelto. Un contenedor cuyos hijos declaran su color no hereda nada.
function queHereda(hijos) {
  // Iconos de lucide: componente capitalizado con `size=`.
  for (const m of hijos.matchAll(/<([A-Z]\w*)\s[^>]*?\bsize=\{[^}]*\}[^>]*?\/>/g)) {
    if (!/\bstyle=|\bcolor=/.test(m[0])) return `el icono <${m[1]}>`
  }
  // Texto suelto: lo que queda al quitar etiquetas, expresiones y espacios.
  const pelado = hijos
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/\s+/g, '')
  if (pelado.length > 1) return 'el texto directo'
  // Una expresion suelta que no es un elemento: `{label}`, `{count}`.
  const sueltas = hijos.replace(/<[^>]*>[\s\S]*?<\/[^>]*>/g, ' ')
  if (/\{\s*[\w.?[\]'"\s|&(),:+-]*\s*\}/.test(sueltas)) return 'el contenido'
  return null
}

// Saca el valor de una propiedad del objeto, respetando ternarios anidados
// y template literals. Corta en la coma del nivel cero.
function valorDe(cuerpo, props) {
  for (const prop of props) {
    const re = new RegExp(`(^|[,{\\s])${prop}\\s*:`, 'g')
    const m = re.exec(cuerpo)
    if (!m) continue
    let i = m.index + m[0].length
    let nivel = 0
    const inicio = i
    while (i < cuerpo.length) {
      const ch = cuerpo[i]
      if ('({['.includes(ch)) nivel++
      else if (')}]'.includes(ch)) {
        if (nivel === 0) break
        nivel--
      } else if (ch === ',' && nivel === 0) break
      i++
    }
    return cuerpo.slice(inicio, i).trim()
  }
  return null
}

// Recorre una expresion saltandose cadenas y niveles de parentesis, y
// devuelve la posicion del primer caracter de `buscar` en el nivel cero.
// Ignora `?.` y `??`, que no abren ternario.
function cortePlano(expr, buscar) {
  let nivel = 0
  let cita = null
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (cita) {
      if (ch === '\\') i++
      else if (ch === cita) cita = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') { cita = ch; continue }
    if ('({['.includes(ch)) { nivel++; continue }
    if (')}]'.includes(ch)) { nivel--; continue }
    if (nivel !== 0) continue
    if (ch === '?') {
      if (expr[i + 1] === '.' || expr[i + 1] === '?') { i++; continue }
      if (expr[i - 1] === '?') continue
      if (buscar === '?') return i
    }
    if (ch === ':' && buscar === ':') return i
  }
  return -1
}

// True si el parentesis que abre la expresion es el que la cierra.
function envuelveTodo(e) {
  let nivel = 0
  let cita = null
  for (let i = 0; i < e.length; i++) {
    const ch = e[i]
    if (cita) {
      if (ch === '\\') i++
      else if (ch === cita) cita = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') { cita = ch; continue }
    if ('({['.includes(ch)) nivel++
    else if (')}]'.includes(ch)) {
      nivel--
      if (nivel === 0) return i === e.length - 1
    }
  }
  return false
}

// Parte una expresion en sus ramas de ternario. `a ? x : b ? y : z` da tres
// ramas, cada una con la condicion que la gobierna (la ultima, ninguna).
// Esto es lo que permite NO cruzar ramas que nunca coexisten: si el fondo y
// el color se deciden con la misma condicion, `gold` solo convive con la
// rama de color que va a su lado, no con las otras.
function ramas(expr) {
  let e = expr.trim()
  // Desenvuelve `(...)` solo cuando el parentesis envuelve TODA la
  // expresion, no cuando es el primero de varios grupos.
  while (e.startsWith('(') && e.endsWith(')') && envuelveTodo(e)) {
    e = e.slice(1, -1).trim()
  }
  const iq = cortePlano(e, '?')
  if (iq === -1) return [{ guarda: '', valor: e }]
  const cond = e.slice(0, iq).trim()
  const resto = e.slice(iq + 1)
  const ic = cortePlano(resto, ':')
  if (ic === -1) return [{ guarda: '', valor: e }]
  const siRama = resto.slice(0, ic).trim()
  const noRama = resto.slice(ic + 1).trim()
  return [{ guarda: cond, valor: siRama }, ...ramas(noRama)]
}

const normaliza = (g) => g.replace(/\s+/g, '')

// Convierte una expresion de color en la lista de colores que puede valer.
// `'transparent'` se marca aparte; un template literal con alpha se ignora,
// porque se mezcla con el fondo y no se puede calcular estaticamente.
function coloresPosibles(expr) {
  if (!expr) return { colores: [], transparente: false, alpha: false }
  const colores = []
  let transparente = false
  let alpha = false

  // Un color con alpha se mezcla con el fondo de abajo y no se puede
  // calcular aqui. Se escribe de dos formas en esta base: `${C.x}15` y
  // `C.x + '15'`.
  const conAlpha = new Set()
  for (const m of expr.matchAll(/\$\{\s*C\.(\w+)\s*\}[0-9a-fA-F]{2}/g)) conAlpha.add(m[1])
  for (const m of expr.matchAll(/\bC\.(\w+)\s*\+\s*['"][0-9a-fA-F]{2}['"]/g)) conAlpha.add(m[1])
  if (conAlpha.size) alpha = true
  if (/\btransparent\b/.test(expr)) transparente = true
  for (const m of expr.matchAll(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g
  )) {
    // Un rgba traslucido es un velo sobre lo que haya debajo. No se puede
    // medir sin saber el fondo, asi que se marca como alpha y no se compara.
    if (m[4] !== undefined && Number(m[4]) < 1) {
      alpha = true
      continue
    }
    const hex =
      '#' +
      [m[1], m[2], m[3]]
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')
    colores.push({ nombre: m[0], hex: hex.toUpperCase() })
  }
  for (const m of expr.matchAll(/\bC\.(\w+)\b/g)) {
    // Si ese token aparecio con alpha, no es un color solido.
    const despues = expr.slice(m.index + m[0].length, m.index + m[0].length + 8)
    if (/^\s*\}[0-9a-fA-F]{2}/.test(despues)) continue
    if (/^\s*\+\s*['"][0-9a-fA-F]{2}['"]/.test(despues)) continue
    if (C[m[1]]) colores.push({ nombre: 'C.' + m[1], hex: C[m[1]] })
  }
  for (const m of expr.matchAll(/'(#[0-9a-fA-F]{6})'/g)) {
    colores.push({ nombre: m[1], hex: m[1].toUpperCase() })
  }
  return { colores, transparente, alpha }
}

// ------------------------------------------------------------
//  LA AUDITORIA
// ------------------------------------------------------------
const fallos = []
const sospechas = []
const sinColor = []
const sobreTransparente = []

for (const ruta of archivosJsx(SRC)) {
  const rel = relative(raiz, ruta).replace(/^src\//, '')
  const esCromo = ARCHIVOS_DE_CROMO.some((f) => rel.endsWith(f))
  const texto = readFileSync(ruta, 'utf8')

  for (const { cuerpo, linea, hijos } of objetosDeEstilo(texto)) {
    const exprFondo = valorDe(cuerpo, ['background', 'backgroundColor'])
    const exprTexto = valorDe(cuerpo, ['color'])
    const sitio = `src/${rel}:${linea}`

    // Todos los colores que el fondo puede tomar, para el caso 1.
    const todoElFondo = exprFondo
      ? ramas(exprFondo).map((r) => coloresPosibles(r.valor))
      : []
    const fondo = {
      colores: todoElFondo.flatMap((r) => r.colores),
      transparente: todoElFondo.some((r) => r.transparente),
    }

    // Caso 1 — declara fondo y no declara color: el contenido hereda.
    // Solo es un bug si de verdad hay algo que herede. Un contenedor cuyos
    // hijos declaran su propio color no entra: ahi el fondo claro es
    // intencional y nada queda ilegible.
    // Si algun hijo declara su propio `color`, el contenido no hereda nada:
    // ese par ya lo mide el caso 1b, con el color real en vez de una
    // suposicion. Sin esto, cada boton con un icono pintado se reportaria.
    const hijosColorean = /style=\{\{[^{}]*\bcolor\s*:/.test(hijos)

    if (fondo.colores.length && !exprTexto && !hijosColorean) {
      const hereda = queHereda(hijos)
      // Y solo importa si el fondo no es una superficie normal: sobre negro
      // y carbon el color heredado (hueso) se lee bien.
      const riesgo = fondo.colores.filter(
        (c) => !['bone', 'cream'].some((t) => C[t] === c.hex)
      )
      if (hereda && riesgo.length) {
        sinColor.push({
          sitio,
          hereda,
          fondos: riesgo.map((c) => c.nombre).join(' | '),
          // Si hereda hueso, cual seria el contraste.
          razon: Math.min(...riesgo.map((c) => contraste(c.hex, C.ink))),
        })
      }
    }

    // Caso 1b — el padre pone el relleno y un hijo pone el color. Solo
    // cuenta cuando el relleno no es una superficie normal: sobre negro y
    // carbon cualquier color de texto de la paleta se lee.
    if (exprFondo) {
      for (const hijo of coloresDeHijos(hijos)) {
        for (const { fondo: b, texto: f, seguro } of paresDeExpr(exprFondo, hijo.expr)) {
          const rellenos = b.colores.filter(
            (c) => !['bone', 'cream'].some((t) => C[t] === c.hex)
          )
          for (const bg of rellenos) {
            for (const ft of f.colores) {
              const r = contraste(bg.hex, ft.hex)
              if (r >= MINIMO) continue
              const fila = {
                sitio: `src/${rel}:${linea + hijo.desplazamiento}`,
                par: `${ft.nombre} (hijo) sobre ${bg.nombre} (padre, :${linea})`,
                razon: r,
                seguro,
              }
              if (r < FALLO && seguro) fallos.push(fila)
              else sospechas.push(fila)
            }
          }
        }
      }
    }

    const pares =
      exprFondo && exprTexto
        ? paresDeExpr(exprFondo, exprTexto).map((p) => [p.fondo, p.texto, p.seguro])
        : []

    for (const [b, f, seguro] of pares) {
      // Caso 2 — fondo transparente: depende de la superficie de abajo.
      if (b.transparente) {
        for (const ft of f.colores) {
          const malas = SUPERFICIES.filter(
            (s) => contraste(ft.hex, C[s.token]) < MINIMO
          )
          if (!malas.length) continue
          const enCromo = contraste(ft.hex, C.ink)
          sobreTransparente.push({
            sitio,
            texto: ft.nombre,
            malas: malas.map((s) => s.etiqueta).join(', '),
            cromo: enCromo,
            duro: esCromo && enCromo < MINIMO,
          })
        }
      }

      // Caso 3 — fondo y color explicitos en la misma rama.
      for (const bg of b.colores) {
        for (const ft of f.colores) {
          const r = contraste(bg.hex, ft.hex)
          const fila = {
            sitio,
            par: `${ft.nombre} sobre ${bg.nombre}`,
            razon: r,
            seguro,
          }
          if (r < FALLO && seguro) fallos.push(fila)
          else if (r < MINIMO) sospechas.push(fila)
        }
      }
    }
  }
}

// ------------------------------------------------------------
//  SALIDA
// ------------------------------------------------------------
const args = process.argv.slice(2)
const todo = args.includes('--todo')
const r2 = (n) => n.toFixed(2) + ':1'

if (args.includes('--tabla')) {
  console.log('\nTABLA DE CONTRASTE — contra las tres superficies\n')
  const ancho = Math.max(...Object.keys(C).map((k) => k.length))
  console.log(
    ' '.repeat(ancho + 2) +
      SUPERFICIES.map((s) => s.etiqueta.padStart(18)).join('')
  )
  for (const [nombre, hex] of Object.entries(C)) {
    const celdas = SUPERFICIES.map((s) =>
      r2(contraste(hex, C[s.token])).padStart(18)
    ).join('')
    console.log('  ' + nombre.padEnd(ancho) + celdas)
  }
  console.log()
}

const cromoDuro = sobreTransparente.filter((x) => x.duro)
const sinColorGrave = sinColor.filter((x) => x.razon < FALLO)

console.log(
  `\nAUDITORIA DE CONTRASTE — ${Object.keys(C).length} tokens, umbral ${MINIMO}:1\n`
)

if (fallos.length) {
  console.log(`FALLOS — por debajo de ${FALLO}:1, ilegible (${fallos.length})\n`)
  for (const f of fallos.sort((a, b) => a.razon - b.razon)) {
    console.log(`  ${r2(f.razon).padStart(8)}  ${f.sitio}\n            ${f.par}`)
  }
  console.log()
}

if (cromoDuro.length) {
  console.log(
    `FALLOS EN EL CROMO CLARO — 'transparent' cae sobre hueso (${cromoDuro.length})\n`
  )
  for (const x of cromoDuro.sort((a, b) => a.cromo - b.cromo)) {
    console.log(
      `  ${r2(x.cromo).padStart(8)}  ${x.sitio}\n            ${x.texto} sobre hueso`
    )
  }
  console.log()
}

const listaSinColor = todo ? sinColor : sinColorGrave
if (listaSinColor.length) {
  console.log(
    `FONDO SIN COLOR — el contenido hereda del padre (${sinColorGrave.length} grave${sinColorGrave.length === 1 ? '' : 's'}${todo ? `, ${sinColor.length} en total` : ''})\n`
  )
  for (const x of listaSinColor.sort((a, b) => a.razon - b.razon)) {
    console.log(
      `  ${r2(x.razon).padStart(8)}  ${x.sitio}\n            fondo ${x.fondos} — ${x.hereda} hereda hueso`
    )
  }
  console.log()
}

if (todo) {
  if (sospechas.length) {
    console.log(`SOSPECHAS — entre ${FALLO}:1 y ${MINIMO}:1 (${sospechas.length})\n`)
    for (const s of sospechas.sort((a, b) => a.razon - b.razon)) {
      console.log(`  ${r2(s.razon).padStart(8)}  ${s.sitio}\n            ${s.par}`)
    }
    console.log()
  }
  const blandos = sobreTransparente.filter((x) => !x.duro)
  if (blandos.length) {
    console.log(
      `DEPENDE DE LA SUPERFICIE — 'transparent' fuera del cromo (${blandos.length})\n`
    )
    for (const x of blandos) {
      console.log(`  ${x.sitio}\n            ${x.texto} falla sobre: ${x.malas}`)
    }
    console.log()
  }
}

const duros = fallos.length + cromoDuro.length + sinColorGrave.length

if (duros === 0) {
  console.log('Sin fallos duros.')
  if (!todo && (sospechas.length || sobreTransparente.length)) {
    console.log(
      `(${sospechas.length} sospechas y ${sobreTransparente.length} casos que dependen de la superficie — \`--todo\` los lista.)`
    )
  }
  console.log()
} else {
  console.log(`${duros} fallo${duros === 1 ? '' : 's'} duro${duros === 1 ? '' : 's'}.\n`)
}

process.exit(duros > 0 ? 1 : 0)
