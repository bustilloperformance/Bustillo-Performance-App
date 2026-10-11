import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../theme';

// ============================================================
//  TABATA / HIIT TIMER — runs a circuit's intervals (rounds × exercises, with
//  work/rest), with beeps at transitions and a "You're amazing" finish.
//
//  Timing is timestamp-based (not tick-counting) so a throttled/backgrounded tab
//  never drifts — on return it catches up to the phase it should be in. A screen
//  Wake Lock keeps the phone awake while the timer runs.
//
//  Audio is pure Web Audio (no <audio> element) on purpose: an HTMLAudioElement
//  would take over the iOS audio session and PAUSE the user's music. Web Audio
//  mixes over music instead. Trade-off: iOS silences it under the ringer switch,
//  so the UI tells the user to unmute.
// ============================================================
let audioCtx = null;

function beep(freq, durMs = 180, type = 'sine', vol = 0.25) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + durMs / 1000);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + durMs / 1000);
  } catch { /* audio unavailable — silent */ }
}
function finishFanfare() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 260, 'triangle', 0.3), i * 170));
}

// Unlock audio inside a user gesture — iOS keeps the context suspended until it
// is resumed from a tap. A 0-gain buffer completes the unlock. No <audio> element
// here, so the user's music keeps playing and the beeps mix over it.
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume?.();
    const src = audioCtx.createBufferSource();
    src.buffer = audioCtx.createBuffer(1, 1, 22050);
    src.connect(audioCtx.destination); src.start(0);
  } catch { /* ignore */ }
}

export default function TabataTimer({ rounds, workSec, restSec, exercises, onClose }) {
  const phases = useMemo(() => {
    const list = [{ type: 'prep', sec: 5, label: 'Get Ready' }];
    const names = exercises && exercises.length ? exercises : ['Work'];
    for (let r = 1; r <= rounds; r++) {
      names.forEach((name, i) => {
        list.push({ type: 'work', sec: workSec, label: name, round: r });
        const isLast = r === rounds && i === names.length - 1;
        if (!isLast && restSec > 0) list.push({ type: 'rest', sec: restSec, label: 'Rest', round: r });
      });
    }
    return list;
  }, [rounds, workSec, restSec, exercises]);

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [idx, setIdx] = useState(0);
  const [remaining, setRemaining] = useState(phases[0]?.sec ?? 0);
  const endsAtRef = useRef(null); // ms timestamp the current phase ends at
  const idxRef = useRef(0);
  const lastTick = useRef(0);
  const wakeRef = useRef(null);

  // Screen Wake Lock — keeps the phone from sleeping mid-workout. Released on
  // pause/finish/close; re-acquired when the tab becomes visible again.
  const requestWake = async () => {
    try { if ('wakeLock' in navigator) wakeRef.current = await navigator.wakeLock.request('screen'); }
    catch { /* unsupported or denied — timer still works */ }
  };
  const releaseWake = () => { try { wakeRef.current?.release(); } catch { /* ignore */ } wakeRef.current = null; };

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible' && running && !done) requestWake(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [running, done]);

  // Timestamp-driven clock: every tick we ask "what phase should we be in now?".
  // If the tab was frozen (screen off, app backgrounded) we fast-forward through
  // whatever elapsed instead of losing time.
  useEffect(() => {
    if (!running || done) return;
    const tick = () => {
      const now = Date.now();
      let i = idxRef.current;
      let end = endsAtRef.current;
      if (end == null) return;
      let advanced = false;
      while (now >= end) {
        const next = i + 1;
        if (next >= phases.length) {
          endsAtRef.current = null;
          setRemaining(0); setDone(true); setRunning(false);
          releaseWake(); finishFanfare();
          return;
        }
        i = next;
        end += phases[i].sec * 1000;
        advanced = true;
      }
      if (advanced) {
        idxRef.current = i; endsAtRef.current = end; setIdx(i);
        lastTick.current = 0;
        beep(phases[i].type === 'work' ? 900 : 500, 220, 'square', 0.3);
      }
      const rem = Math.max(0, Math.ceil((end - now) / 1000));
      setRemaining(rem);
      if (rem <= 3 && rem > 0 && rem !== lastTick.current) { lastTick.current = rem; beep(700, 70, 'sine', 0.22); }
    };
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [running, done, phases]);

  const start = () => {
    unlockAudio();
    requestWake();
    const secs = remaining > 0 ? remaining : (phases[idxRef.current]?.sec ?? 0);
    endsAtRef.current = Date.now() + secs * 1000;
    beep(900, 200, 'square', 0.3);
    setRunning(true);
  };
  const pause = () => { setRunning(false); endsAtRef.current = null; releaseWake(); };
  const reset = () => {
    setRunning(false); setDone(false); setIdx(0); idxRef.current = 0;
    setRemaining(phases[0]?.sec ?? 0); endsAtRef.current = null; lastTick.current = 0;
    releaseWake();
  };

  // Always drop the wake lock when the timer closes.
  useEffect(() => () => releaseWake(), []);

  const cur = phases[idx] || {};
  // Las cuatro fases son superficies OSCURAS y el texto va claro encima. En
  // la version clara de esta app el trabajo iba sobre `ink` (entonces el
  // oscuro) y el logro sobre `forest`; aqui el logro lo marca el oro del
  // acento, no un relleno dorado a pantalla completa — 5% de oro, dice la guia.
  const bg = cur.type === 'rest' ? C.navy : done ? C.cream : C.bone;
  // Sobre el azul del descanso el acero cae a 2.7:1; ahi el acento es hueso.
  const accent = cur.type === 'rest' ? C.ink : C.gold;
  const workRounds = rounds;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center p-6 anim-fade" style={{ background: bg, color: C.ink, transition: 'background 0.3s' }}>
      <button onClick={onClose} className="mono absolute top-5 right-5 px-3 py-2" style={{ fontSize: '12px', letterSpacing: '0.1em', background: 'rgba(255,255,255,0.12)', color: C.ink }}>✕ CLOSE</button>

      {done ? (
        <div className="text-center anim-up">
          <div className="mono mb-3" style={{ fontSize: '12px', letterSpacing: '0.14em', color: C.gold }}>WORKOUT COMPLETE</div>
          <div className="serif-italic" style={{ fontSize: '52px', lineHeight: 1.1, color: C.ink }}>ESO ES EL ESTÁNDAR.</div>
          <div className="hand mt-3" style={{ fontSize: '22px', color: C.moss }}>— {rounds} rounds. Eso es el estándar.</div>
          <div className="flex gap-2 justify-center mt-8">
            <button onClick={reset} className="mono px-5 py-3" style={{ fontSize: '12px', letterSpacing: '0.1em', background: 'rgba(255,255,255,0.15)', color: C.ink }}>↺ AGAIN</button>
            <button onClick={onClose} className="mono px-5 py-3" style={{ fontSize: '12px', letterSpacing: '0.1em', background: C.gold, color: C.bone }}>DONE →</button>
          </div>
        </div>
      ) : (
        <div className="text-center w-full max-w-md">
          <div className="mono mb-2" style={{ fontSize: '13px', letterSpacing: '0.14em', color: accent }}>
            {cur.type === 'prep' ? 'GET READY' : cur.type === 'work' ? 'WORK' : 'REST'}
            {cur.round ? ` · ROUND ${cur.round}/${workRounds}` : ''}
          </div>
          <div className="serif-italic mb-4" style={{ fontSize: '30px', lineHeight: 1.1, color: C.ink, minHeight: 40 }}>{cur.type === 'work' ? cur.label : cur.type === 'rest' ? 'Rest' : 'Get ready…'}</div>
          <div className="display" style={{ fontSize: '120px', lineHeight: 1, fontWeight: 700, color: accent }}>{remaining}</div>
          <div className="mono mt-2" style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'rgba(238,234,226,0.6)' }}>{cur.type === 'work' ? `${workSec}s WORK` : cur.type === 'rest' ? `${restSec}s REST` : ''}</div>

          <div className="flex gap-2 justify-center mt-8">
            {running ? (
              <button onClick={pause} className="mono px-6 py-3" style={{ fontSize: '13px', letterSpacing: '0.1em', background: 'rgba(255,255,255,0.15)', color: C.ink }}>❚❚ PAUSE</button>
            ) : (
              <button onClick={start} className="mono px-8 py-3" style={{ fontSize: '14px', letterSpacing: '0.1em', background: C.gold, color: C.bone, fontWeight: 600 }}>▶ {idx === 0 && remaining === phases[0]?.sec ? 'START' : 'RESUME'}</button>
            )}
            <button onClick={reset} className="mono px-4 py-3" style={{ fontSize: '13px', letterSpacing: '0.1em', background: 'rgba(255,255,255,0.1)', color: C.ink }}>↺</button>
          </div>
          {!running && idx === 0 && remaining === phases[0]?.sec && (
            <div className="mono mt-5" style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'rgba(238,234,226,0.55)', lineHeight: 1.7 }}>
              🔊 turn off silent mode to hear the beeps<br />
              📱 the screen stays awake while the timer runs<br />
              🎵 your music keeps playing
            </div>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
