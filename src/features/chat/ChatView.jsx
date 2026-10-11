import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Image as ImageIcon, Send, Users, Settings2, X, ChevronLeft } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import { useToast, useConfirm } from '../../components/feedback';
import { PageHeader, Modal, Btn, Field, Avatar } from '../../components/ui';
import { inputClass, inputStyle } from '../../components/uiStyles';
import { membershipActive } from '../../lib/helpers';
import {
  listGroups, createGroup, updateGroup, setGroupMembers, deleteGroup,
  listMessages, sendMessage, deleteMessage, signChatUrls, fetchPeers, subscribeMessages,
} from '../../data/chat';

// ============================================================
//  COMMUNITY CHAT — una sola pantalla para staff y cliente.
//  Grupos a la izquierda, conversación a la derecha; en el teléfono, una u
//  otra. El staff crea grupos y decide quién está; todos escriben como ellos
//  mismos. Los mensajes llegan en vivo por Realtime y las fotos se ven con URL
//  firmada (bucket privado).
// ============================================================
const GROUP_KEY = 'fw-chat-group';

const hhmm = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const dayLabel = (iso) => {
  const d = new Date(iso); const t = new Date();
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, t)) return 'TODAY';
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (same(d, y)) return 'YESTERDAY';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
};

export default function ChatView({ memberId, staff = false }) {
  const { data } = useData();
  const showToast = useToast();
  const askConfirm = useConfirm();

  const [groups, setGroups] = useState(null);           // null = cargando
  const [selectedId, setSelectedId] = useState(() => { try { return localStorage.getItem(GROUP_KEY) || null; } catch { return null; } });
  // Los mensajes van etiquetados con su grupo: al cambiar de grupo no hay que
  // vaciar nada, simplemente los del grupo anterior dejan de aplicar.
  const [thread, setThread] = useState({ groupId: null, list: [] });
  const [urls, setUrls] = useState({});
  const [peers, setPeers] = useState({});
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [editor, setEditor] = useState(null);           // null | 'new' | group
  const [mobileThread, setMobileThread] = useState(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  // Quién es quién. El staff tiene todos los miembros en el store; un cliente
  // solo la propia fila, así que para los demás pregunta a chat_peers().
  const me = data.members.find((m) => m.id === memberId) || null;
  const nameOf = (id) => {
    if (id === memberId && me) return me.name;
    const m = data.members.find((x) => x.id === id) || peers[id];
    return m?.name || '—';
  };
  const avatarOf = (id) => (id === memberId && me) ? me : (data.members.find((x) => x.id === id) || peers[id] || { name: '?' });

  const loadGroups = async () => {
    try {
      const g = await listGroups();
      setGroups(g);
      if (!staff) {
        try { const p = await fetchPeers(); setPeers(Object.fromEntries(p.map((x) => [x.id, x]))); } catch { /* sin pares: se verá "—" */ }
      }
      return g;
    } catch (err) { showToast(err.message || 'Could not load groups.'); setGroups([]); return []; }
  };
  useEffect(() => { (async () => { await loadGroups(); })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Grupo abierto: el guardado si sigue existiendo, si no el primero.
  const selected = useMemo(() => {
    if (!groups) return null;
    return groups.find((g) => g.id === selectedId) || groups[0] || null;
  }, [groups, selectedId]);
  useEffect(() => { if (selected) { try { localStorage.setItem(GROUP_KEY, selected.id); } catch { /* ignore */ } } }, [selected]);

  // Mensajes del grupo abierto + suscripción en vivo. Al mandar uno propio se
  // añade al instante y Realtime lo repite, por eso se descarta por id.
  useEffect(() => {
    if (!selected) return;
    const gid = selected.id;
    let alive = true;
    listMessages(gid).then((m) => { if (alive) setThread({ groupId: gid, list: m }); }).catch((err) => showToast(err.message || 'Could not load messages.'));
    const off = subscribeMessages(gid, {
      onInsert: (m) => setThread((t) => (t.groupId !== gid || t.list.some((x) => x.id === m.id)) ? t : { ...t, list: [...t.list, m] }),
      onDelete: (id) => setThread((t) => t.groupId !== gid ? t : { ...t, list: t.list.filter((x) => x.id !== id) }),
    });
    return () => { alive = false; off(); };
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const messages = thread.groupId === selected?.id ? thread.list : [];
  const setMessages = (fn) => setThread((t) => ({ ...t, list: typeof fn === 'function' ? fn(t.list) : fn }));

  // Firmar las fotos que aún no tienen URL.
  useEffect(() => {
    const missing = messages.map((m) => m.imagePath).filter((p) => p && !urls[p]);
    if (!missing.length) return;
    signChatUrls(missing).then((map) => setUrls((u) => ({ ...u, ...map }))).catch(() => {});
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, selected?.id]);

  const send = async () => {
    if (sending || !selected || (!draft.trim() && !file)) return;
    if (!memberId) { showToast('Your login is not linked to a member profile yet.'); return; }
    setSending(true);
    try {
      const m = await sendMessage(selected.id, memberId, { body: draft, file });
      setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
      setDraft(''); setFile(null); if (fileRef.current) fileRef.current.value = '';
    } catch (err) { showToast(err.message || 'Could not send.'); }
    finally { setSending(false); }
  };
  const remove = (m) => askConfirm({
    message: 'Delete this message?', detail: 'It disappears for everyone in the group.', confirmLabel: 'DELETE',
    onConfirm: async () => {
      try { await deleteMessage(m); setMessages((prev) => prev.filter((x) => x.id !== m.id)); }
      catch (err) { showToast(err.message || 'Could not delete.'); }
    },
  });

  const pick = (g) => { setSelectedId(g.id); setMobileThread(true); };

  // ---------------------------------------------------------------- render
  const header = (
    <PageHeader sectionNo={staff ? '09' : '02'} section={staff ? 'PEOPLE · COMMUNITY' : 'CLIENT · COMMUNITY'} title="Community."
      subtitle={staff ? '— groups you run, people you choose.' : '— ask, share your progress, cheer each other on.'} />
  );

  if (groups === null) return <div className="p-4 md:p-10 anim-fade">{header}<div className="help" style={{ fontSize: '15px', color: C.moss }}>— loading…</div></div>;

  const emptyAll = groups.length === 0;

  return (
    <div className="p-4 md:p-10 anim-fade">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {header}
        {staff && <Btn onClick={() => setEditor('new')}>+ NEW GROUP</Btn>}
      </div>

      {emptyAll ? (
        <div className="p-8 text-center" style={{ background: C.cream, border: `1px dashed ${C.charcoal}30` }}>
          <MessageCircle size={22} style={{ color: C.moss, margin: '0 auto 8px' }} />
          <div className="ui-strong" style={{ fontSize: '20px', color: C.ink }}>{staff ? 'No groups yet.' : 'No groups yet.'}</div>
          <div className="hand mt-1" style={{ fontSize: '17px', color: C.moss }}>
            {staff ? '— create the first one and pick who is in it.' : '— Josean will add you to the community when it opens.'}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" style={{ minHeight: '60vh' }}>
          {/* Lista de grupos */}
          <div className={`${mobileThread ? 'hidden md:block' : ''} md:col-span-1`} style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
            {groups.map((g) => {
              const on = selected?.id === g.id;
              return (
                <button key={g.id} onClick={() => pick(g)} className="w-full text-left px-4 py-3 flex items-center gap-3"
                  style={{ background: on ? C.ink : 'transparent', color: on ? C.bone : C.ink, borderBottom: `1px solid ${C.charcoal}10` }}>
                  <div className="flex items-center justify-center flex-shrink-0" style={{ width: 36, height: 36, background: on ? C.gold : C.bone, color: on ? C.ink : C.moss }}><Users size={16} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="prog-name truncate" style={{ fontSize: '18px', lineHeight: 1.1 }}>{g.name}</div>
                    <div className="mono truncate" style={{ fontSize: '11px', letterSpacing: '0.1em', color: on ? C.sand : C.moss }}>
                      {g.memberIds.length} {g.memberIds.length === 1 ? 'MEMBER' : 'MEMBERS'}{g.description ? ` · ${g.description.toUpperCase()}` : ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Conversación */}
          <div className={`${mobileThread ? '' : 'hidden md:flex'} md:col-span-2 flex flex-col`} style={{ background: '#fff', border: `1px solid ${C.charcoal}20`, maxHeight: '75vh' }}>
            {selected && (
              <>
                <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${C.charcoal}15`, background: C.cream }}>
                  <button onClick={() => setMobileThread(false)} className="md:hidden p-1" style={{ color: C.ink }}><ChevronLeft size={18} /></button>
                  <div className="min-w-0 flex-1">
                    <div className="prog-name truncate" style={{ fontSize: '20px', lineHeight: 1.1, color: C.ink }}>{selected.name}</div>
                    <div className="mono truncate" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>
                      {selected.memberIds.map(nameOf).filter((n) => n !== '—').join(' · ') || `${selected.memberIds.length} MEMBERS`}
                    </div>
                  </div>
                  {staff && (
                    <button onClick={() => setEditor(selected)} className="mono px-2.5 py-1.5 flex items-center gap-1" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.ink, color: C.goldDeep }}>
                      <Settings2 size={12} /> EDIT
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ background: C.bone }}>
                  {messages.length === 0 && (
                    <div className="hand text-center py-10" style={{ fontSize: '17px', color: C.moss }}>— aquí todavía no hay nada. saluda.</div>
                  )}
                  {messages.map((m, i) => {
                    const mine = m.authorId === memberId;
                    const prev = messages[i - 1];
                    const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
                    const sameAuthor = prev && prev.authorId === m.authorId && !newDay;
                    return (
                      <div key={m.id}>
                        {newDay && <div className="mono text-center my-3" style={{ fontSize: '10px', letterSpacing: '0.14em', color: C.moss }}>{dayLabel(m.createdAt)}</div>}
                        <div className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                          {!mine ? (sameAuthor ? <div style={{ width: 28 }} /> : <Avatar member={avatarOf(m.authorId)} size={28} bg={C.forest} fg={C.bone} />) : null}
                          <div className="max-w-[78%] group">
                            {!mine && !sameAuthor && <div className="mono mb-0.5" style={{ fontSize: '10px', letterSpacing: '0.1em', color: C.moss }}>{nameOf(m.authorId).toUpperCase()}</div>}
                            <div className="relative px-3 py-2" style={{ background: mine ? C.ink : '#fff', color: mine ? C.bone : C.ink, border: mine ? 'none' : `1px solid ${C.charcoal}15` }}>
                              {m.imagePath && (
                                urls[m.imagePath]
                                  ? <a href={urls[m.imagePath]} target="_blank" rel="noreferrer"><img src={urls[m.imagePath]} alt="" className="block mb-1" style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain' }} /></a>
                                  : <div className="mono mb-1" style={{ fontSize: '10px', color: mine ? C.sand : C.moss }}>LOADING PHOTO…</div>
                              )}
                              {m.body && <div className="text-sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>{m.body}</div>}
                              <div className={`mono mt-1 flex items-center gap-2 ${mine ? 'justify-end' : ''}`} style={{ fontSize: '9px', letterSpacing: '0.1em', color: mine ? C.sand : C.moss }}>
                                {hhmm(m.createdAt)}
                                {(mine || staff) && (
                                  <button onClick={() => remove(m)} title="Delete" className="opacity-60 hover:opacity-100" style={{ color: 'inherit' }}><X size={10} /></button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                {/* Redactar */}
                <div className="px-3 py-2" style={{ borderTop: `1px solid ${C.charcoal}15`, background: C.cream }}>
                  {file && (
                    <div className="flex items-center gap-2 mb-2">
                      <img src={URL.createObjectURL(file)} alt="" style={{ height: 56, width: 56, objectFit: 'cover', border: `1px solid ${C.charcoal}20` }} />
                      <div className="mono flex-1 truncate" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>{file.name}</div>
                      <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} className="p-1" style={{ color: C.ink }}><X size={14} /></button>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    <button onClick={() => fileRef.current?.click()} title="Add a photo" className="p-2.5 flex-shrink-0" style={{ background: C.bone, color: C.ink, border: `1px solid ${C.charcoal}20` }}><ImageIcon size={16} /></button>
                    <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} placeholder="Write a message…"
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                      className={`${inputClass} flex-1`} style={{ ...inputStyle, resize: 'none', minHeight: 40, maxHeight: 120 }} />
                    <button onClick={send} disabled={sending || (!draft.trim() && !file)} className="p-2.5 flex-shrink-0" style={{ background: C.ink, color: C.goldDeep, opacity: (sending || (!draft.trim() && !file)) ? 0.45 : 1 }}><Send size={16} /></button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {editor && (
        <GroupEditor
          group={editor === 'new' ? null : editor}
          members={data.members}
          memberships={data.memberships}
          plans={data.membershipPlans}
          createdBy={memberId}
          onClose={() => setEditor(null)}
          onSaved={async (id) => { setEditor(null); const g = await loadGroups(); if (id) setSelectedId(id); else if (!g.some((x) => x.id === selected?.id)) setSelectedId(g[0]?.id || null); }}
        />
      )}
    </div>
  );
}

// Crear o editar un grupo: nombre, descripción y, sobre todo, quién está.
// La lista trae a todos los miembros con su plan vigente para que se vea a
// quién estás metiendo; el filtro busca por nombre.
function GroupEditor({ group, members, memberships, plans, createdBy, onClose, onSaved }) {
  const showToast = useToast();
  const askConfirm = useConfirm();
  const [name, setName] = useState(group?.name || '');
  const [description, setDescription] = useState(group?.description || '');
  const [picked, setPicked] = useState(() => new Set(group?.memberIds || []));
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);

  const planOf = (m) => {
    const mb = memberships.find((x) => x.memberId === m.id && membershipActive(x, plans.find((p) => p.id === x.planId)));
    return mb ? (plans.find((p) => p.id === mb.planId)?.name || '') : '';
  };
  const list = [...members]
    .filter((m) => !q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickActive = () => setPicked(new Set(members.filter((m) => planOf(m)).map((m) => m.id)));

  const save = async () => {
    if (!name.trim()) { showToast('Group needs a name.'); return; }
    setSaving(true);
    try {
      let id = group?.id;
      if (group) { await updateGroup(group.id, { name, description }); await setGroupMembers(group.id, [...picked]); }
      else id = await createGroup({ name, description, memberIds: [...picked], createdBy });
      showToast(group ? 'Group updated.' : 'Group created.');
      onSaved(id);
    } catch (err) { showToast(err.message || 'Could not save the group.'); }
    finally { setSaving(false); }
  };
  const destroy = () => askConfirm({
    message: `Delete "${group.name}"?`, detail: 'Every message and photo in it is gone for everyone. This cannot be undone.', confirmLabel: 'DELETE GROUP',
    onConfirm: async () => {
      setSaving(true);
      try { await deleteGroup(group.id); showToast('Group deleted.'); onSaved(null); }
      catch (err) { showToast(err.message || 'Could not delete the group.'); setSaving(false); }
    },
  });

  return (
    <Modal title={group ? 'Edit Group' : 'New Group'} eyebrow="COMMUNITY · GROUP" onClose={onClose} size="md">
      <div className="space-y-3">
        <Field label="GROUP NAME"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="FW Runners" autoFocus className={inputClass} style={inputStyle} /></Field>
        <Field label="DESCRIPTION (OPTIONAL)"><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Marathon block · Dec 15" className={inputClass} style={inputStyle} /></Field>
        <Field label={`WHO'S IN · ${picked.size}`}>
          <div className="flex gap-2 mb-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members…" className={`${inputClass} flex-1`} style={inputStyle} />
            <button type="button" onClick={pickActive} className="mono px-2.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.bone, color: C.ink, border: `1px solid ${C.charcoal}25`, whiteSpace: 'nowrap' }}>ALL ACTIVE</button>
            <button type="button" onClick={() => setPicked(new Set())} className="mono px-2.5" style={{ fontSize: '11px', letterSpacing: '0.1em', background: C.bone, color: C.moss, border: `1px solid ${C.charcoal}25` }}>NONE</button>
          </div>
          <div className="max-h-72 overflow-y-auto" style={{ border: `1px solid ${C.charcoal}20`, background: '#fff' }}>
            {list.map((m) => {
              const on = picked.has(m.id);
              const plan = planOf(m);
              return (
                <button key={m.id} type="button" onClick={() => toggle(m.id)} className="w-full flex items-center gap-3 px-3 py-2 text-left" style={{ background: on ? C.cream : 'transparent', borderBottom: `1px solid ${C.charcoal}10` }}>
                  <div className="w-4 h-4 flex items-center justify-center flex-shrink-0" style={{ background: on ? C.ink : '#fff', border: `1px solid ${on ? C.gold : C.charcoal + '40'}` }}>{on && <span style={{ color: C.gold, fontSize: 10, fontWeight: 700 }}>✓</span>}</div>
                  <Avatar member={m} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="ui-strong truncate" style={{ fontSize: '15px', color: C.ink }}>{m.name}</div>
                    <div className="mono truncate" style={{ fontSize: '10px', letterSpacing: '0.1em', color: plan ? C.forest : C.moss }}>{plan ? plan.toUpperCase() : 'NO PLAN'}</div>
                  </div>
                </button>
              );
            })}
            {list.length === 0 && <div className="p-3 text-center help" style={{ fontSize: '14px', color: C.moss }}>No matches.</div>}
          </div>
          <div className="help mt-1" style={{ fontSize: '13px', color: C.goldDeep }}>— only the people checked here see this group. You can leave yourself out.</div>
        </Field>
        <div className="flex gap-2 pt-1">
          <Btn full onClick={save} disabled={saving}>{saving ? 'SAVING…' : group ? 'SAVE CHANGES' : 'CREATE GROUP'}</Btn>
          {group && (
            <button type="button" onClick={destroy} disabled={saving} className="mono px-3" style={{ fontSize: '11px', letterSpacing: '0.1em', background: '#8A4A44', color: C.bone }}>DELETE</button>
          )}
        </div>
      </div>
    </Modal>
  );
}
