// ============================================================
//  BUSTILLO PERFORMANCE — BRAND TOKENS
// ============================================================
// Fuente unica de los colores de marca. Espejo en tailwind.config.js.
// Se usa `C` en estilos en linea (la convencion de toda la app) o los
// nombres de color de Tailwind (bg-ink, text-gold, ...) en className.
//
// ------------------------------------------------------------
//  POR QUE LOS NOMBRES NO DESCRIBEN LOS COLORES
// ------------------------------------------------------------
// Los nombres vienen de la primera instancia de esta app, que tenia base
// CLARA: `bone` era el fondo de la pagina y `ink` el texto encima. El brand
// book de Bustillo manda lo contrario — 70% negros, 15% hueso — asi que la
// app esta invertida: `bone` ahora es el negro de fondo y `ink` el hueso del
// texto.
//
// Se invirtieron los VALORES en vez de renombrar los tokens porque hay 1,826
// llamadas a `C.*` en estilos en linea, y porque la inversion es segura:
// `ink` y `bone` solo se usan uno contra el otro (`color: C.ink` sobre
// `background: C.bone`, y al reves), asi que intercambiarlos conserva cada
// par de contraste — solo lo voltea. Renombrar 1,826 llamadas habria sido
// mucho riesgo para cero beneficio visual.
//
// ------------------------------------------------------------
//  QUE SUPERFICIES SON CLARAS
// ------------------------------------------------------------
// Solo dos: la barra lateral y la barra superior movil. Todo lo demas es
// negro o carbon.
//
// La inversion mecanica habia dejado 61 paneles de hueso — los que antes
// eran acentos oscuros sobre pagina clara. Eran demasiados (el brand book
// pide 15% de hueso) y cada uno obligaba a revisar el color de todos sus
// hijos, porque sobre hueso el acero cae a 2.46:1 y el oro a 1.98:1. Se
// pasaron a carbon, donde el acero da 5.89:1 y el oro 7.31:1, y la clase
// de error desaparecio.
//
// Por eso `goldDeep` y `mossDeep` solo se usan en el cromo.
//
// ------------------------------------------------------------
//  LA REGLA DEL ORO
// ------------------------------------------------------------
//   oro sobre fondo oscuro  ·  goldDeep sobre fondo claro
// El oro de marca da 8.28:1 sobre negro y 1.98:1 sobre hueso. No es
// negociable: sobre claro simplemente no se lee.
//
// ------------------------------------------------------------
//  Y LA DEL AZUL, QUE ES LA INVERSA
// ------------------------------------------------------------
// Seleccion Blue da 2.06:1 sobre negro: ahi es SUPERFICIE o relleno, nunca
// texto. Sobre hueso da 7.94:1: ahi si es texto. Los archivos de logo de la
// marca ya codifican esto — la version clara pone "PERFORMANCE" en azul, la
// oscura en oro.
export const C = {
  // --- Los dos extremos. Se usan siempre uno contra el otro: 16.40:1.
  bone: '#0B0B0C',   // BLACK  — fondo de la pagina. Base y autoridad.
  ink: '#EEEAE2',    // BONE   — el texto encima, y los paneles claros.

  // --- Superficies
  cream: '#1A1A1D',  // CARBON — tarjetas y paneles sobre el fondo. ink da 14.47:1 encima.
  // Hairlines. Casi siempre con alpha (`${C.charcoal}30`): un filo de hueso
  // al 19% sobre negro, que es justo lo que pide una retícula discreta.
  charcoal: '#EEEAE2',

  // --- Acentos
  gold: '#C4A464',     // GOLD — logro. Solo sobre oscuro (8.28:1). 5% del total.
  goldDeep: '#765E2D', // El mismo oro bajado hasta leerse sobre hueso: 5.13:1.
  // SELECCION BLUE — rendimiento y memoria deportiva. Es SUPERFICIE: rellenos,
  // bordes y divisores. Nunca texto sobre oscuro (2.06:1); sobre hueso si
  // (7.94:1). Los tres nombres son el mismo azul y el mismo papel.
  //
  // `forest` llevaba dos trabajos en la paleta anterior: superficie neutra Y
  // color de estado ("✓ DONE", "ACTIVE"). Se separaron, porque colapsarlo en
  // oro dejaba `background: activo ? C.gold : C.forest` con el mismo color en
  // los dos estados. La superficie se queda aqui; el estado se volvio oro
  // explicito en cada sitio, que es lo que el brand book le asigna al oro:
  // "marca el estado activo o logrado".
  forest: '#23457A',
  navy: '#23457A',
  // Record personal. Va como relleno con texto blanco (8.6:1).
  heritage: '#23457A',

  // --- Texto secundario y decoracion
  // STEEL. 6.68:1 sobre negro y 5.89:1 sobre carbon — pasa como texto en
  // los dos. Sobre hueso da 2.46:1, asi que NO va en los paneles claros.
  moss: '#9A968E',
  // El mismo acero bajado hasta leerse sobre hueso: 5.00:1 contra los 2.46:1
  // del acero normal. Es a `moss` lo que `goldDeep` es a `gold`, y existe por
  // la misma razon: la barra lateral y la barra superior movil son las dos
  // unicas superficies CLARAS de la app, y ahi el texto secundario normal
  // desaparece. Es el unico token que no sale del brand book.
  mossDeep: '#66635B',
  // `sand` hacia el mismo trabajo que `moss` en la paleta anterior
  // (secundario, scrollbar, lineas de campo). El brand book de Bustillo
  // tiene seis colores y ninguno mas: "nada decorativo, cada elemento
  // soporta peso". Los dos tokens colapsan en STEEL a proposito.
  sand: '#9A968E',
}

export default C
