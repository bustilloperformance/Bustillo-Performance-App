// ============================================================
//  EDICIONES ABIERTAS
//  Quién tiene un editor abierto ahora mismo (el de programa personal, el
//  builder de rutinas). Mientras haya uno, nada debe recargar la página: ni el
//  gesto de jalar para refrescar ni la actualización automática. Una recarga a
//  media edición tiraba el trabajo y devolvía al coach a la lista de 1-on-1.
//
//  Vive en memoria y no en localStorage a propósito: si la app se cierra a
//  medias, el registro se va con ella y no puede quedar una bandera pegada que
//  bloquee las recargas para siempre.
// ============================================================
const abiertos = new Set();

export function marcarEdicion(clave) { abiertos.add(clave); }
export function liberarEdicion(clave) { abiertos.delete(clave); }
export function hayEdicionAbierta() { return abiertos.size > 0; }
