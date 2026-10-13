// ============================================================
//  ARRANQUE EN FRÍO vs RECARGA POR ACTUALIZACIÓN
//  El navegador no distingue las dos, y la app sí lo necesita.
//
//  Abrir la app de cero debe empezar arriba. Nadie quiere entrar y aparecer a
//  media pantalla, en donde se quedó ayer.
//
//  Una recarga que dispara el actualizador es lo contrario: la persona estaba
//  usando la app y la app se recargó sola. Mandarla al tope ahí le borra el
//  lugar donde iba — para alguien capturando sus series eso es perder el hilo
//  en medio de la rutina, y no fue ni siquiera algo que pidió.
//
//  sessionStorage es exactamente la herramienta: sobrevive un reload de la
//  misma pestaña y no sobrevive cerrar la app. O sea, dice que sí justo cuando
//  hubo recarga y que no cuando el arranque es de cero.
// ============================================================
const CLAVE = 'bp-recarga-por-update';

export function marcarRecargaPorUpdate() {
  try { sessionStorage.setItem(CLAVE, '1'); } catch { /* ignorar */ }
}

// Se consume al leerla: solo la primera lectura después de la recarga dice que
// sí, para que un render posterior no la vuelva a tomar como recarga.
export function fueRecargaPorUpdate() {
  try {
    const si = sessionStorage.getItem(CLAVE) === '1';
    if (si) sessionStorage.removeItem(CLAVE);
    return si;
  } catch { return false; }
}
