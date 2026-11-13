"use client";

import { useEffect, useRef, useState } from "react";
import { pct } from "@/lib/format";

const TAU = Math.PI * 2;
const COLORS = [[100,182,204],[157,186,198],[208,166,99],[167,152,211]];

/** A deliberately illustrative phase-space sculpture, not a simulated forecast. */
export default function RiskField({ countries, selected, baseRate }) {
  const canvas = useRef(null);
  const clock = useRef(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [shape, setShape] = useState("orbit");
  const c = selected || countries[0];
  const above = countries.filter(x => x.risk > baseRate).length;
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync(); mq.addEventListener("change",sync);
    return () => mq.removeEventListener("change",sync);
  }, []);
  useEffect(() => {
    const el = canvas.current, ctx = el.getContext("2d");
    if (!ctx) return;
    let frame, w=1,h=1,visible=true,t=clock.current,last=0;
    let pointer={x:0,y:0}, tilt={x:0,y:0};
    const resize = new ResizeObserver(([entry]) => {
      w=entry.contentRect.width; h=entry.contentRect.height;
      const dpr=Math.min(devicePixelRatio||1,2);
      el.width=w*dpr; el.height=h*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
      draw(t);
    });
    const observer = new IntersectionObserver(([entry])=> {visible=entry.isIntersecting;});
    const move = e => {const r=el.getBoundingClientRect();pointer={x:(e.clientX-r.left)/w-.5,y:(e.clientY-r.top)/h-.5};};
    const leave = () => {pointer={x:0,y:0};};
    el.addEventListener("pointermove",move); el.addEventListener("pointerleave",leave);
    const project = (x,y,z,angle) => {
      const rx=x*Math.cos(angle)-z*Math.sin(angle), rz=x*Math.sin(angle)+z*Math.cos(angle);
      const a=.78+tilt.y*.3, ry=y*Math.cos(a)-rz*Math.sin(a), depth=y*Math.sin(a)+rz*Math.cos(a);
      const perspective=4.8/(4.8+depth), scale=Math.min(w*.29,h*.36);
      return [w*.5+rx*scale*perspective,h*.49+ry*scale*perspective,depth];
    };
    function point(u,v,time) {
      if(shape==='flow') {
        const x=(u/TAU-.5)*3.8;
        const flare=Math.pow(u/TAU,3)*1.15;
        return [x,Math.cos(v+time*.12)*(.035+flare),Math.sin(v+time*.12)*(.035+flare)];
      }
      const r=1.08+.15*Math.cos(3*u+time*.15);
      const tube=.25+.09*Math.sin(2*u+v+time*.22);
      return [(r+tube*Math.cos(v))*Math.cos(u),(r+tube*Math.cos(v))*Math.sin(u),tube*Math.sin(v)+.28*Math.sin(2*u+time*.12)];
    }
    function draw(time) {
      ctx.clearRect(0,0,w,h);
      const angle=shape==='flow'?.25:time*.045+tilt.x*.38;
      // Instrument frame and calibrated ticks are decorative, without fabricated metrics.
      ctx.strokeStyle='rgba(106,154,174,.12)';ctx.lineWidth=.6;
      const cx=w*.5,cy=h*.49,rad=Math.min(w*.41,h*.42);
      ctx.beginPath();ctx.ellipse(cx,cy,rad,rad*.79,-.3,0,TAU);ctx.stroke();
      for(let i=0;i<96;i++) {
        const a=i/96*TAU,l=i%8===0?7:3;
        ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*rad,cy+Math.sin(a)*rad*.79);ctx.lineTo(cx+Math.cos(a)*(rad+l),cy+Math.sin(a)*(rad*.79+l));ctx.stroke();
      }
      // Decorative filaments: geometry and colors do not encode probabilities.
      const count=Math.min(countries.length,w<500?100:200);
      for(let j=0;j<count;j++) {
        const v=j/count*TAU, color=COLORS[shape==='flow'?Math.floor(j/count*4):j%4];
        ctx.beginPath();
        for(let k=0;k<=128;k++) {
          const u=k/128*TAU;
          const p=point(u,v+u*3,time);
          const q=project(...p,angle);
          if(k===0) ctx.moveTo(q[0],q[1]); else ctx.lineTo(q[0],q[1]);
        }
        ctx.strokeStyle=`rgba(${color.join(',')},${j%9===0?.65:.22})`;ctx.lineWidth=j%9===0?.65:.4;ctx.stroke();
        // Particles move along the actual filament geometry.
        for(let b=0;b<(shape==='flow'?12:4);b++) {
          const u=((j*.618+b/(shape==='flow'?12:4)+time*.018)%1)*TAU;
          const q=project(...point(u,v+u*3,time),angle);
          ctx.fillStyle=`rgba(${color.join(',')},${.35+(q[2]+1.5)*.12})`;
          ctx.fillRect(q[0],q[1],j%7===0?1.8:1,j%7===0?1.8:1);
        }
      }
      // One bright section travels around the form, providing a restrained scanning rhythm.
      ctx.beginPath();
      const u=time*.17+1.2;
      for(let i=0;i<=80;i++) {const q=project(...point(u,i/80*TAU,time),angle);if(!i)ctx.moveTo(q[0],q[1]);else ctx.lineTo(q[0],q[1]);}
      ctx.strokeStyle='rgba(211,232,217,.65)';ctx.lineWidth=.9;ctx.stroke();
      ctx.fillStyle='#6a8c99';ctx.font='9px "IBM Plex Mono", monospace';
      ctx.fillText(shape==='orbit'?'PHASE SPACE / ORBITAL PROJECTION':'PARTICLE FIELD / FLOW PROJECTION',18,h-26);
      ctx.fillText('GEOMETRIA ILLUSTRATIVA',18,h-12);
      ctx.strokeStyle='#57727a';ctx.beginPath();ctx.moveTo(22,h-65);ctx.lineTo(22,h-43);ctx.lineTo(43,h-43);ctx.stroke();
    }
    const loop = now => {
      frame=requestAnimationFrame(loop);
      if(now-last<32) return;
      const delta=Math.min((now-last)/1000,.05);last=now;
      if(!visible||document.hidden) return;
      if(!paused&&!reduced){t+=delta;clock.current=t;tilt.x+=(pointer.x-tilt.x)*.035;tilt.y+=(pointer.y-tilt.y)*.035;draw(t);}
    };
    resize.observe(el);observer.observe(el);draw(t);frame=requestAnimationFrame(loop);
    return ()=> {cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();el.removeEventListener('pointermove',move);el.removeEventListener('pointerleave',leave);};
  },[countries,paused,reduced,shape]);
  return <div className="field-view">
    <div className="field-stage">
      <div className="field-caption"><span>MODEL OBSERVATORY</span><b>{c.name.toUpperCase()}</b><small>SELEZIONE / {String(c.rank).padStart(3,'0')}</small></div>
      <canvas ref={canvas} aria-label="Scultura animata illustrativa a filamenti. Le stime sono riportate nei pannelli numerici." role="img" />
      <div className="field-controls"><button aria-pressed={shape==='orbit'} onClick={()=>setShape('orbit')}>01 ORBITA</button><button aria-pressed={shape==='flow'} onClick={()=>setShape('flow')}>02 FLUSSO</button><button onClick={()=>setPaused(!paused)} aria-pressed={paused} disabled={reduced}>{reduced?'MOTO RIDOTTO':paused?'▷ RIPRENDI':'Ⅱ PAUSA'}</button></div>
    </div>
    <div className="field-diagnostics">
      <section><h3>A / PROBABILITÀ</h3><div className="readout">{pct(c.risk)}</div><svg viewBox="0 0 160 70" aria-hidden="true"><path d="M5 60H155M5 10V60" className="diag-grid"/><path d={`M5 40H${5+c.risk*150}`} className="diag-curve"/><circle cx={5+c.risk*150} cy="40" r="3" fill="currentColor"/><text x="5" y="18" fontSize="8">0%</text><text x="125" y="18" fontSize="8">100%</text></svg><small>Almeno un tentativo<br/>nell’orizzonte del modello</small></section>
      <section><h3>B / TASSO BASE</h3><div className="ratio-readout">× {(c.risk/baseRate).toFixed(2)}</div><div className="matrix" aria-hidden="true">{Array.from({length:24},(_,i)=><i key={i} style={{opacity:i/24<Math.min(c.risk/baseRate/12,1)?1:.12}} />)}</div><small>Rapporto con la media<br/>Tasso base: {pct(baseRate)}</small></section>
      <section><h3>C / COPERTURA</h3><p className="coverage-count">{above}<span> / {countries.length}</span></p><div className="coverage-track"><i style={{width:`${above/countries.length*100}%`}}/></div><small>Paesi sopra il tasso base</small></section>
    </div>
  </div>;
}
