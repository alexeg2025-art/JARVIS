import type { CSSProperties } from 'react';

const outerTicks = Array.from({ length: 120 }, (_, index) => {
  const major = index % 10 === 0;
  const medium = index % 5 === 0;
  return <line key={index} x1="180" y1={major ? 8 : medium ? 10 : 13} x2="180" y2={major ? 25 : medium ? 18 : 16} className={major ? 'tick-major' : 'tick-minor'} transform={`rotate(${index * 3} 180 180)`} />;
});

const innerTicks = Array.from({ length: 72 }, (_, index) => <line key={index} x1="180" y1="59" x2="180" y2={index % 6 === 0 ? 69 : 64} transform={`rotate(${index * 5} 180 180)`} />);

export function Reactor({ state }: { state: string }) {
  const stateColor = state === 'thinking' ? '#91f1ff' : state === 'speaking' ? '#4a9eff' : '#00d4ff';
  return <div className={`reactor ${state}`}>
    <div className="reactor-halo" />
    <div className="reactor-ring ring-one"><svg viewBox="0 0 360 360" aria-hidden="true">
      <circle cx="180" cy="180" r="168" className="outer-track" />
      <circle cx="180" cy="180" r="158" className="outer-glow" />
      <g className="outer-ticks">{outerTicks}</g>
      <circle cx="180" cy="180" r="147" className="dash" />
      <circle cx="180" cy="180" r="141" className="micro-track" />
    </svg></div>
    <div className="reactor-ring ring-two"><svg viewBox="0 0 360 360" aria-hidden="true">
      <circle cx="180" cy="180" r="134" className="band-track" />
      <circle cx="180" cy="180" r="134" className="blue-sector" />
      <circle cx="180" cy="180" r="127" className="thin-track" />
      <path d="M 180 48 A 132 132 0 0 1 297 119" className="arc-highlight" />
      <path d="M 83 252 A 112 112 0 0 1 74 142" className="arc-amber" />
      <circle cx="180" cy="180" r="119" className="dash" />
    </svg></div>
    <div className="reactor-ring ring-three"><svg viewBox="0 0 360 360" aria-hidden="true">
      <circle cx="180" cy="180" r="108" className="inner-track" />
      <g className="inner-ticks">{innerTicks}</g>
      <circle cx="180" cy="180" r="91" className="core-orbit" />
      <circle cx="180" cy="180" r="84" className="dash" />
    </svg></div>
    <span className="orbit-beacon beacon-a"/><span className="orbit-beacon beacon-b"/><span className="orbit-beacon beacon-c"/>
    <div className="reactor-core">
      <div className="core-light"/><div className="core-cross x"/><div className="core-cross y"/>
      <div className="core-caption">J.A.R.V.I.S.</div>
      <div className="core-state" style={{ '--state-color': stateColor } as CSSProperties}>{state === 'idle' ? 'STANDBY' : state.toUpperCase()}</div>
    </div>
    <div className="reactor-tick tick-a"/><div className="reactor-tick tick-b"/><div className="reactor-tick tick-c"/><div className="reactor-tick tick-d"/>
  </div>;
}
