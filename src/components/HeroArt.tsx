import { useId } from 'react';
import { BagMark } from './Brand';
import { ProductArt } from './ui';
import { splitName } from '../lib/brand';

/** Generic vector props for the hero scene. They are original drawings, not any brand's artwork. */
const Defs = ({ id }: { id: string }) => (
  <defs>
    <linearGradient id={`b${id}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#1c3a78" /><stop offset="1" stopColor="#050d22" /></linearGradient>
    <linearGradient id={`c${id}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#22d3ee" /><stop offset="1" stopColor="#087bff" /></linearGradient>
  </defs>
);

export function Headphones({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden="true"><Defs id={id} />
      <path d="M22 70V58a38 38 0 0176 0v12" stroke={`url(#c${id})`} strokeWidth="7" strokeLinecap="round" />
      <rect x="10" y="62" width="26" height="42" rx="12" fill={`url(#b${id})`} stroke={`url(#c${id})`} strokeWidth="3" />
      <rect x="84" y="62" width="26" height="42" rx="12" fill={`url(#b${id})`} stroke={`url(#c${id})`} strokeWidth="3" />
      <rect x="16" y="72" width="6" height="22" rx="3" fill={`url(#c${id})`} opacity=".8" /><rect x="98" y="72" width="6" height="22" rx="3" fill={`url(#c${id})`} opacity=".8" />
    </svg>
  );
}
export function Gamepad({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 140 90" className={className} fill="none" aria-hidden="true"><Defs id={id} />
      <path d="M38 14h64c14 0 22 10 27 34l4 20c2 10-6 18-16 16-8-1-12-6-17-12H52c-5 6-9 11-17 12-10 2-18-6-16-16l4-20c5-24 13-34 15-34z" fill={`url(#b${id})`} stroke={`url(#c${id})`} strokeWidth="3" strokeLinejoin="round" />
      <path d="M44 38v18M35 47h18" stroke="#7dd3fc" strokeWidth="5" strokeLinecap="round" />
      <circle cx="98" cy="40" r="4.5" fill="#22d3ee" /><circle cx="108" cy="49" r="4.5" fill="#087bff" /><circle cx="88" cy="49" r="4.5" fill="#087bff" /><circle cx="98" cy="58" r="4.5" fill="#22d3ee" />
    </svg>
  );
}
export function PopcornBucket({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 110 140" className={className} fill="none" aria-hidden="true">
      {[[30, 30, 14], [52, 22, 16], [76, 30, 14], [40, 44, 14], [64, 44, 15], [22, 46, 11], [86, 46, 11]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={i % 2 ? '#fde68a' : '#fef3c7'} />)}
      <path d="M12 52h86l-12 80a6 6 0 01-6 5H30a6 6 0 01-6-5z" fill="#f8fafc" />
      {[24, 44, 64, 84].map((x, i) => <path key={i} d={`M${x} 52h12l-4 85h-9z`} fill="#dc2626" opacity=".92" />)}
      <path d="M12 52h86" stroke="#e2e8f0" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** The hero scene: product tiles built from the store's real products, the brand bag and generic props. */
export function HeroScene({ products, name }: { products: any[]; name: string }) {
  const [a, b] = splitName(name);
  const slots = [
    { l: '14%', t: '4%', w: '30%', r: -9 }, { l: '50%', t: '0%', w: '33%', r: 7 }, { l: '2%', t: '30%', w: '27%', r: -6 },
    { l: '33%', t: '26%', w: '28%', r: 0 }, { l: '64%', t: '27%', w: '29%', r: 8 },
  ];
  return (
    <div className="relative mx-auto aspect-[6/5] w-full max-w-[640px]" aria-hidden="true">
      <div className="absolute inset-x-[2%] bottom-[2%] h-[26%] rounded-[50%] bg-gradient-to-b from-brand/60 to-transparent blur-md" />
      <div className="absolute inset-x-[6%] bottom-[5%] h-[20%] rounded-[50%] border-2 border-brand/60 bg-brand/10 shadow-[0_0_70px_rgb(var(--brand)/.7)]" />
      <div className="absolute inset-x-[16%] bottom-[8%] h-[13%] rounded-[50%] border border-cyan2/40" />
      {products.slice(0, 5).map((p, i) => {
        const s = slots[i];
        return (
          <div key={p.id} className="absolute animate-float" style={{ left: s.l, top: s.t, width: s.w, animationDelay: `${i * 0.7}s` }}>
            <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-navy-700 to-navy-950 p-2 text-center" style={{ transform: `perspective(700px) rotateY(${-s.r * 1.4}deg) rotateZ(${s.r / 2}deg)`, boxShadow: `0 18px 40px -12px ${p.brandColor}aa, 0 0 0 1px ${p.brandColor}55 inset` }}>
              {p.imageUrl ? <img src={p.imageUrl} alt="" className="max-h-[70%] max-w-[88%] object-contain" /> : <ProductArt name={p.name} color={p.brandColor} size="h-[38%] aspect-square w-auto min-h-8" text="text-sm sm:text-lg" />}
              <div className="mt-1.5 w-full truncate text-[10px] font-extrabold italic text-white sm:text-sm">{p.name}</div>
            </div>
          </div>
        );
      })}
      <div className="absolute animate-float" style={{ left: '20%', top: '50%', width: '34%', animationDelay: '.4s' }}>
        <div className="relative mx-auto aspect-[5/6] w-full rounded-[18%] border border-white/30 bg-gradient-to-b from-brand via-brand to-brand-600 shadow-[0_30px_80px_-10px_rgb(var(--brand)/.85)]">
          <div className="absolute inset-x-[24%] -top-[11%] h-[18%] rounded-t-full border-[5px] border-b-0 border-brand-600" />
          <div className="absolute inset-0 rounded-[18%] bg-gradient-to-br from-white/25 to-transparent" />
          <div className="relative flex h-full flex-col items-center justify-center"><BagMark className="h-[42%] w-[42%] [&_path]:!stroke-white [&_path:last-child]:!fill-white" /><div className="mt-2 text-lg font-black italic text-white sm:text-2xl">{a}{b}</div></div>
        </div>
      </div>
      <div className="absolute" style={{ left: '52%', top: '46%', width: '24%' }}><Headphones className="w-full drop-shadow-[0_10px_25px_rgb(var(--brand)/.6)]" /></div>
      <div className="absolute" style={{ right: '0%', top: '52%', width: '16%' }}><PopcornBucket className="w-full drop-shadow-[0_10px_20px_rgb(0_0_0/.5)]" /></div>
      <div className="absolute" style={{ left: '66%', top: '72%', width: '26%' }}><Gamepad className="w-full drop-shadow-[0_10px_25px_rgb(var(--brand)/.6)]" /></div>
    </div>
  );
}
