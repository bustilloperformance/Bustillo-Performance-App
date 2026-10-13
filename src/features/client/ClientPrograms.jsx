import { useState } from 'react';
import { Globe } from 'lucide-react';
import { C } from '../../theme';
import { useData } from '../../data/store';
import StripeCheckoutModal from '../../components/StripeCheckoutModal';
import { PageHeader, Btn, Modal } from '../../components/ui';
import { ContentView } from '../../components/RichContent';

// ============================================================
//  CLIENT · ONLINE PROGRAMS (storefront)
//  Buy/subscribe to listed online programs via Stripe. Owned programs link to
//  My Training (where their week×day routine + logging lives).
// ============================================================
export default function ClientPrograms({ clientMemberId, setView }) {
  const { data } = useData();
  const [checkout, setCheckout] = useState(null);
  const [detail, setDetail] = useState(null); // program whose storefront page is open

  const listed = data.programs.filter((p) => p.mode === 'online' && p.listed);
  const owns = (programId) => data.memberPrograms.some((mp) => mp.memberId === clientMemberId && mp.programId === programId && mp.status === 'active');

  const buy = (programId) => { setDetail(null); setCheckout({ kind: 'program', programId, memberId: clientMemberId }); };
  const hasPage = (p) => (p.content && p.content.length) || p.description;

  const priceLabel = (p) => p.pricingType === 'monthly' ? `$${p.price} / month` : p.pricingType === 'annual' ? `$${p.price} / year` : `$${p.price} · one-time`;

  return (
    <div className="p-4 md:p-10 anim-fade">
      <PageHeader sectionNo="05" section="CLIENT · STORE" title="Online Programs." subtitle="— train from anywhere. same standard." />

      {listed.length === 0 ? (
        <div className="p-10 text-center" style={{ background: C.cream, border: `1px solid ${C.charcoal}20` }}>
          <div className="ui-strong" style={{ fontSize: '24px', color: C.ink }}>No programs available yet.</div>
          <div className="hand mt-2" style={{ fontSize: '17px', color: C.moss }}>— vuelve en un momento.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {listed.map((p) => {
            const owned = owns(p.id);
            return (
              <div key={p.id} onClick={() => hasPage(p) && setDetail(p)} className="p-6 flex flex-col transition-all hover:opacity-95" style={{ background: C.cream, color: C.ink, border: `1px solid ${C.charcoal}20`, cursor: hasPage(p) ? 'pointer' : 'default' }}>
                <div className="flex items-center gap-1.5 mb-2 mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.gold }}>
                  <Globe size={11} /> — ONLINE · {p.durationWeeks}WK{p.focus ? ` · ${p.focus.toUpperCase()}` : ''}
                </div>
                <div className="prog-name mb-2" style={{ fontSize: '34px', color: C.cream }}>{p.name}</div>
                {p.tagline && <div className="help mb-2" style={{ fontSize: '17px', color: C.gold }}>— {p.tagline}</div>}
                {p.description && <div className="text-sm mb-3" style={{ color: C.sand }}>{p.description}</div>}
                {p.equipment && <div className="mono mb-3" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.sand }}>EQUIPMENT · {p.equipment.toUpperCase()}</div>}
                {hasPage(p) && <div className="mono mb-1" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.gold }}>▸ TAP FOR DETAILS</div>}
                <div className="mt-auto pt-3 flex items-center justify-between gap-3" style={{ borderTop: `1px solid ${C.forest}` }}>
                  <div className="mono" style={{ fontSize: '14px', fontWeight: 600, color: C.gold }}>{priceLabel(p)}</div>
                  {owned ? (
                    <Btn variant="gold" onClick={(e) => { e.stopPropagation(); setView('client-workouts'); }}>OPEN IN MY TRAINING →</Btn>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); buy(p.id); }} className="mono px-4 py-2.5" style={{ fontSize: '12px', letterSpacing: '0.1em', background: C.gold, color: C.bone }}>
                      {p.pricingType === 'one-time' ? 'BUY →' : 'SUBSCRIBE →'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="help text-center mt-4" style={{ fontSize: '14px', color: C.moss }}>— secure checkout by Stripe. recurring programs can be cancelled anytime from Account.</div>
      {checkout && <StripeCheckoutModal args={checkout} title="Online Program" onClose={() => setCheckout(null)} />}

      {detail && (
        <Modal title={detail.name} eyebrow={`ONLINE PROGRAM · ${detail.durationWeeks}WK`} onClose={() => setDetail(null)} size="lg">
          <div className="space-y-4">
            {detail.tagline && <div className="help" style={{ fontSize: '20px', color: C.gold }}>— {detail.tagline}</div>}
            {detail.description && <div className="text-sm" style={{ color: C.charcoal, whiteSpace: 'pre-wrap' }}>{detail.description}</div>}
            <ContentView content={detail.content} />
            {detail.equipment && <div className="mono" style={{ fontSize: '11px', letterSpacing: '0.1em', color: C.moss }}>EQUIPMENT · {detail.equipment.toUpperCase()}</div>}
            <div className="flex items-center justify-between gap-3 pt-3" style={{ borderTop: `1px solid ${C.charcoal}20` }}>
              <div className="display" style={{ fontSize: '24px', fontWeight: 600, color: C.ink }}>{priceLabel(detail)}</div>
              {owns(detail.id) ? (
                <Btn variant="gold" onClick={() => { setDetail(null); setView('client-workouts'); }}>OPEN IN MY TRAINING →</Btn>
              ) : (
                <Btn onClick={() => buy(detail.id)}>{detail.pricingType === 'one-time' ? 'BUY →' : 'SUBSCRIBE →'}</Btn>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
