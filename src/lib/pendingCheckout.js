// ============================================================
//  UN CHECKOUT ABIERTO SOBREVIVE A SALIR DE LA APP
//  La app no tiene router: el checkout es un modal y la URL no cambia al
//  abrirlo. Así que cuando alguien toca "Términos y Condiciones" dentro del
//  formulario de Stripe, sale de la app, y al regresar la app arranca de cero
//  en la pantalla de inicio — con el pago a medias perdido.
//
//  Aquí se recuerda qué checkout estaba abierto para volver a montarlo al
//  regresar.
//
//  Va en localStorage y no en sessionStorage, aunque sessionStorage suene más
//  correcto para algo tan efímero: sessionStorage vive por CONTEXTO, y en un
//  PWA de iOS un enlace externo se abre en el navegador interno del sistema,
//  que es otro contexto. localStorage sí se comparte. La caducidad hace el
//  trabajo que sessionStorage haría solo: un intento de pago de anteayer no
//  debe resucitar.
//
//  Al restaurarlo, Stripe crea una sesión nueva. Eso no cobra nada — una
//  sesión solo cobra cuando se completa — y la anterior se queda sin usar
//  hasta que expira sola.
// ============================================================
const CLAVE = 'bp-checkout-abierto';
// Más que suficiente para leer los Términos y volver; corto para que un intento
// olvidado no reaparezca en la siguiente sesión del día.
const VIGENCIA_MS = 30 * 60 * 1000;

export function recordarCheckout(args, title) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ args, title, t: Date.now() }));
  } catch { /* modo privado o almacenamiento lleno: se pierde el rescate, no el pago */ }
}

export function olvidarCheckout() {
  try { localStorage.removeItem(CLAVE); } catch { /* ignorar */ }
}

export function checkoutPendiente() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const v = JSON.parse(crudo);
    // Sin args no hay nada que montar, y un valor corrupto no debe tumbar el
    // arranque de la app.
    if (!v || !v.args) { olvidarCheckout(); return null; }
    if (!v.t || Date.now() - v.t > VIGENCIA_MS) { olvidarCheckout(); return null; }
    return v;
  } catch { return null; }
}

// ¿Hay un pago a medias ahora mismo? Lo usa el actualizador automático para no
// recargar la app encima de alguien que está capturando su tarjeta.
export function hayCheckoutAbierto() {
  return checkoutPendiente() !== null;
}
