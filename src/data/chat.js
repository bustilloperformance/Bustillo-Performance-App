import { supabase } from '../lib/supabaseClient';
import { downscaleImage } from '../lib/downscaleImage';

// ============================================================
//  CHAT DE LA COMUNIDAD — grupos, pertenencia, mensajes y fotos (0033).
//  No pasa por el store: los mensajes llegan en tiempo real y una pantalla de
//  chat recarga sola lo suyo. Las fotos viven en el bucket privado `chat` bajo
//  <group_id>/ y se ven con URL firmada, igual que las fotos de progreso.
// ============================================================
const BUCKET = 'chat';

const mapGroup = (r) => ({ id: r.id, name: r.name, description: r.description ?? '', createdBy: r.created_by, createdAt: r.created_at });
const mapMessage = (r) => ({ id: r.id, groupId: r.group_id, authorId: r.author_member_id, body: r.body ?? '', imagePath: r.image_path, createdAt: r.created_at });

// Grupos visibles para quien pregunta (RLS: staff todos, cliente los suyos),
// cada uno con la lista de ids de sus miembros.
export async function listGroups() {
  const [g, gm] = await Promise.all([
    supabase.from('chat_groups').select('*').order('created_at', { ascending: true }),
    supabase.from('chat_group_members').select('group_id, member_id'),
  ]);
  if (g.error) throw g.error;
  if (gm.error) throw gm.error;
  const members = {};
  (gm.data || []).forEach((r) => { (members[r.group_id] = members[r.group_id] || []).push(r.member_id); });
  return (g.data || []).map((r) => ({ ...mapGroup(r), memberIds: members[r.id] || [] }));
}

export async function createGroup({ name, description, memberIds, createdBy }) {
  const { data, error } = await supabase
    .from('chat_groups')
    .insert({ name: name.trim(), description: (description || '').trim(), created_by: createdBy || null })
    .select('id')
    .single();
  if (error) throw error;
  await setGroupMembers(data.id, memberIds || []);
  return data.id;
}

export async function updateGroup(id, { name, description }) {
  const { error } = await supabase.from('chat_groups').update({ name: name.trim(), description: (description || '').trim() }).eq('id', id);
  if (error) throw error;
}

// Deja la pertenencia exactamente como la lista que llega: mete a los que
// faltan y saca a los que sobran. Asi el editor manda la lista completa y no
// tiene que llevar la cuenta de que cambio.
export async function setGroupMembers(groupId, memberIds) {
  const want = new Set(memberIds);
  const { data, error } = await supabase.from('chat_group_members').select('member_id').eq('group_id', groupId);
  if (error) throw error;
  const have = new Set((data || []).map((r) => r.member_id));
  const add = [...want].filter((id) => !have.has(id)).map((member_id) => ({ group_id: groupId, member_id }));
  const drop = [...have].filter((id) => !want.has(id));
  if (add.length) {
    const { error: e } = await supabase.from('chat_group_members').insert(add);
    if (e) throw e;
  }
  if (drop.length) {
    const { error: e } = await supabase.from('chat_group_members').delete().eq('group_id', groupId).in('member_id', drop);
    if (e) throw e;
  }
}

// Borra el grupo y, antes, sus fotos: la fila se va en cascada, el archivo no.
export async function deleteGroup(groupId) {
  const { data } = await supabase.from('chat_messages').select('image_path').eq('group_id', groupId).not('image_path', 'is', null);
  const paths = (data || []).map((r) => r.image_path).filter(Boolean);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  const { error } = await supabase.from('chat_groups').delete().eq('id', groupId);
  if (error) throw error;
}

// Los ultimos N mensajes del grupo, del mas viejo al mas nuevo (como se leen).
export async function listMessages(groupId, limit = 200) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapMessage).reverse();
}

// Texto, foto, o las dos. La foto se reduce antes de subir (igual que las de
// progreso) y se guarda bajo el id del grupo, que es lo que la RLS del bucket
// mira para decidir quien la puede ver.
export async function sendMessage(groupId, authorId, { body, file }) {
  let image_path = null;
  if (file) {
    const blob = await downscaleImage(file);
    image_path = `${groupId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(image_path, blob, { contentType: 'image/jpeg', upsert: false });
    if (upErr) throw upErr;
  }
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ group_id: groupId, author_member_id: authorId, body: (body || '').trim(), image_path })
    .select('*')
    .single();
  if (error) {
    // Si la fila no entro, la foto no debe quedar huerfana en el bucket.
    if (image_path) await supabase.storage.from(BUCKET).remove([image_path]);
    throw error;
  }
  return mapMessage(data);
}

export async function deleteMessage(msg) {
  if (msg.imagePath) await supabase.storage.from(BUCKET).remove([msg.imagePath]);
  const { error } = await supabase.from('chat_messages').delete().eq('id', msg.id);
  if (error) throw error;
}

// URLs firmadas (1 h) por ruta, listas para <img src>.
export async function signChatUrls(paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(list, 3600);
  if (error) throw error;
  const map = {};
  data.forEach((d, i) => { if (d.signedUrl) map[list[i]] = d.signedUrl; });
  return map;
}

// Nombre y foto de quien comparte grupo con el usuario. Un cliente no puede
// leer members mas alla de su fila, y esto le da lo justo para poner nombre a
// cada mensaje sin abrirle emails ni telefonos ajenos.
export async function fetchPeers() {
  const { data, error } = await supabase.rpc('chat_peers');
  if (error) throw error;
  return (data || []).map((r) => ({ id: r.id, name: r.name, photoUrl: r.photo_url }));
}

// Mensajes nuevos y borrados de un grupo, en vivo. Devuelve la funcion para
// dejar de escuchar. Realtime respeta la RLS: cada quien recibe solo lo suyo.
export function subscribeMessages(groupId, { onInsert, onDelete }) {
  const channel = supabase
    .channel(`chat:${groupId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `group_id=eq.${groupId}` },
      (payload) => onInsert?.(mapMessage(payload.new)))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `group_id=eq.${groupId}` },
      (payload) => onDelete?.(payload.old?.id))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
