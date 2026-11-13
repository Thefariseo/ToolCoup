"use client";
import Link from "next/link";
import {useEffect,useMemo,useRef,useState} from "react";
import {geoMercator,geoPath} from "d3-geo";
import {feature} from "topojson-client";
import topo from "world-atlas/countries-50m.json";
import {pct} from "@/lib/format";

const SHAPES=new Map(feature(topo,topo.objects.countries).features.map(f=>[f.id,f]));
const CHANNELS=[{key:'unrest',name:'Proteste e disordini',short:'PROTESTE',color:'#86d5df'},{key:'violence',name:'Violenza armata',short:'VIOLENZA',color:'#edb875'},{key:'fatalities',name:'Vittime riportate',short:'VITTIME',color:'#bca6ec'}];
const TAU=Math.PI*2;
const fmt=s=>s?new Date(s+'-01T00:00:00Z').toLocaleDateString('it-IT',{month:'short',year:'numeric',timeZone:'UTC'}):'—';
function makeRows(data){
  const s=data?.series;if(!s?.unrest?.length)return [];
  const [year,month]=s.start.split('-').map(Number),offset=Math.max(0,s.unrest.length-180);
  return s.unrest.slice(offset).map((_,i)=>({date:new Date(Date.UTC(year,month-1+offset+i,1)).toISOString().slice(0,7),...Object.fromEntries(CHANNELS.map(c=>[c.key,s[c.key]?.[offset+i]??0]))}));
}
export default function RiskField({countries,selected,baseRate,horizon=6}){
  const country=selected||countries[0];
  const [result,setResult]=useState(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
  const [cursor,setCursor]=useState(null),[playing,setPlaying]=useState(false),[reduced,setReduced]=useState(false),[ambient,setAmbient]=useState(true),[view,setView]=useState('radial');
  useEffect(()=>{const ctl=new AbortController();setError(false);setCursor(null);setPlaying(false);
    fetch(`/api/countries/${encodeURIComponent(country.slug)}`,{signal:ctl.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>setResult({slug:country.slug,data})).catch(e=>{if(e.name!=='AbortError')setError(true);});return()=>ctl.abort();
  },[country.slug,retry]);
  useEffect(()=>{const mq=matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>setReduced(mq.matches);sync();mq.addEventListener('change',sync);return()=>mq.removeEventListener('change',sync);},[]);
  const data=result?.slug===country.slug?result.data:null;
  const rows=useMemo(()=>makeRows(data),[data]);
  const events=useMemo(()=>data?.coups?.filter(e=>!e.dup&&e.prec!=='year'&&'ABC'.includes(e.conf)&&['riuscito','fallito'].includes(e.type))||[],[data]);
  const index=cursor==null?rows.length-1:Math.min(cursor,rows.length-1),current=rows[index];
  const inMonth=events.filter(e=>current&&e.date.slice(0,7)===current.date);
  useEffect(()=>{if(!playing||reduced||!rows.length)return;const id=setInterval(()=>{if(document.hidden)return;setCursor(i=>i==null||i>=rows.length-1?0:i+1);},350);return()=>clearInterval(id);},[playing,reduced,rows.length]);
  const select=i=>{setCursor(i);setPlaying(false);};
  return <div className="country-instrument" aria-busy={!data&&!error}>
    <div className="country-instrument-title"><div><span className="eyebrow">ANATOMIA DELL’INSTABILITÀ / {country.iso||'—'}</span><h2>{country.name}</h2><p>{country.region} · {rows.length?`${rows[0].date} — ${rows.at(-1).date}`:'Caricamento delle serie…'}</p></div><div className="instrument-view-switch"><button aria-pressed={view==='radial'} onClick={()=>setView('radial')}>01 / IMPRONTA</button><button aria-pressed={view==='ribbons'} onClick={()=>setView('ribbons')}>02 / SEQUENZA</button></div></div>
    {error?<div className="instrument-empty" role="alert">Caricamento non riuscito. <button onClick={()=>setRetry(x=>x+1)}>Riprova</button></div>:!data?<div className="instrument-empty">Ricostruzione delle serie mensili…</div>:!rows.length?<div className="instrument-empty">Serie mensili non disponibili per questo territorio.</div>:<>
      <div className="country-instrument-body"><div className="country-stage"><CountryCanvas country={country} rows={rows} events={events} index={index} onSelect={select} view={view} reduced={reduced} ambient={ambient}/><div className="stage-key"><span>{view==='radial'?'SAGOMA = TERRITORIO · ANELLI = MESI':'PROFILI = CONTEGGI MENSILI'}</span></div><button className="ambient-toggle" disabled={reduced} aria-pressed={!ambient} onClick={()=>setAmbient(!ambient)}>{reduced?'MOVIMENTO RIDOTTO':ambient?'Ⅱ EFFETTI':'▷ EFFETTI'}</button></div>
      <aside className="signal-readouts" aria-label="Valori del mese selezionato"><p className="eyebrow">MESE IN ESAME</p><h3>{fmt(current?.date)}</h3>{CHANNELS.map((ch,i)=><div className="channel-readout" key={ch.key} style={{'--channel':ch.color}}><span>0{i+1} / {ch.short}</span><strong>{current[ch.key].toLocaleString('it-IT')}</strong><Spark values={rows.map(r=>r[ch.key])} index={index} color={ch.color}/><small>{ch.key==='fatalities'?'Persone riportate da ACLED':'Eventi registrati da ACLED'}</small></div>)}<div className="month-event"><span className="eyebrow">ARCHIVIO GOLPE · A–C</span>{inMonth.length?inMonth.map(e=><p key={e.id}>◇ {e.date} · {e.type}</p>):<p>Nessun tentativo registrato nel mese.</p>}</div></aside></div>
      <div className="instrument-scrubber"><button disabled={reduced} aria-pressed={playing} onClick={()=>{setPlaying(!playing);if(index===rows.length-1)setCursor(0);}}>{playing?'Ⅱ PAUSA':'▷ RIPERCORRI'}</button><div><label htmlFor="signal-month">{fmt(current.date)}<span>ESPLORA LA STORIA MENSILE</span></label><input id="signal-month" type="range" min="0" max={rows.length-1} value={index} onChange={e=>select(Number(e.target.value))}/></div><button onClick={()=>{setCursor(null);setPlaying(false);}}>ULTIMO MESE ↗</button></div>
      <div className="instrument-legend">{CHANNELS.map(ch=><span key={ch.key}><i style={{background:ch.color}}/>{ch.name}</span>)}<span>◆ Riuscito / ◇ Fallito</span><span className="scale-note">Ampiezza logaritmica, scala distinta per serie. Fili: stesso mese a un anno di distanza. Punti geografici ≠ eventi.</span></div>
      <div className="temporal-matrix"><div className="matrix-title"><span>MATRICE / {rows.length} MESI</span><span>INTENSITÀ RELATIVA PER SERIE →</span></div>{CHANNELS.map(ch=>{const max=Math.max(1,...rows.map(r=>r[ch.key]));return <div className="matrix-row" key={ch.key}><span style={{color:ch.color}}>{ch.short}</span><div>{rows.map((r,i)=><button key={r.date} aria-label={`${ch.name}, ${fmt(r.date)}: ${r[ch.key]}`} title={`${fmt(r.date)} · ${r[ch.key]}`} onClick={()=>select(i)} className={index===i?'active':''} style={{background:ch.color,opacity:.12+.88*Math.log1p(r[ch.key])/Math.log1p(max)}}/>)}</div></div>;})}</div>
      <div className="coup-bookmarks"><span>MARCATORI / GOLPE</span>{events.filter(e=>e.date.slice(0,7)>=rows[0].date&&e.date.slice(0,7)<=rows.at(-1).date).slice(-5).map(e=><button key={e.id} onClick={()=>select(rows.findIndex(r=>r.date===e.date.slice(0,7)))}>{e.type==='riuscito'?'◆':'◇'} {e.prec==='year'?e.year:e.prec==='month'?e.date.slice(0,7):e.date}<small>{e.type}</small></button>)}<small>Affidabilità A–C · date note almeno al mese</small></div>
      <div className="country-evidence"><div><span className="eyebrow">PREVISIONE / {horizon} MESI</span><b>{pct(country.risk)}</b><small>× {(country.risk/baseRate).toFixed(2)} il tasso base</small></div><div className="evidence-drivers"><span className="eyebrow">CONTRIBUTI ALLA STIMA</span>{data.drivers?.slice(0,3).map(d=><p key={d.label}><span>{d.label}</span><b className={d.contrib>0?'positive':'negative'}>{d.contrib>0?'+':''}{d.contrib.toFixed(2)}</b></p>)}<small>Log-odds · associazioni, non nessi causali.</small></div><Link href={`/paese/${country.slug}`}>DOSSIER COMPLETO ↗</Link></div>
    </>}
  </div>;
}
function Spark({values,index,color}){const max=Math.max(1,...values),path=values.map((v,i)=>`${i?'L':'M'}${i/Math.max(1,values.length-1)*160},${32-Math.log1p(v)/Math.log1p(max)*29}`).join(' ');return <svg viewBox="0 0 160 36" aria-hidden="true"><path d={path} fill="none" stroke={color} strokeWidth=".8"/><line x1={index/Math.max(1,values.length-1)*160} x2={index/Math.max(1,values.length-1)*160} y1="0" y2="36" stroke="#e7f3f2" strokeWidth=".6"/></svg>;}

function CountryCanvas({country,rows,events,index,onSelect,view,reduced,ambient}){
  const ref=useRef(null),live=useRef({index,onSelect,ambient});live.current={index,onSelect,ambient};
  useEffect(()=>{
    const el=ref.current,ctx=el.getContext('2d');if(!ctx)return;
    let w=1,h=1,frame,last=0,time=0,age=0,visible=true,points=[],outline=null,dirty=true,previous=-1;
    const shape=SHAPES.get(country.iso),max=CHANNELS.map(ch=>Math.max(1,...rows.map(r=>r[ch.key])));
    const eventMonths=new Map();for(const e of events){const m=e.date.slice(0,7);if(!eventMonths.has(m))eventMonths.set(m,[]);eventMonths.get(m).push(e);}
    const layout=()=>({cx:w*.49,cy:h*.48,R:Math.min(w*.405,h*.415)});
    function prepare(){const {cx,cy,R}=layout();points=[];if(shape){const projection=geoMercator().fitExtent([[cx-R*.59,cy-R*.50],[cx+R*.59,cy+R*.50]],shape),path=geoPath(projection);outline=new Path2D(path(shape));const bounds=path.bounds(shape),step=w<450?3:2.4;
      // Test containment on an identity transform; rendering uses the device pixel ratio.
      ctx.save();ctx.setTransform(1,0,0,1,0,0);
      for(let y=bounds[0][1];y<bounds[1][1];y+=step)for(let x=bounds[0][0];x<bounds[1][0];x+=step)if(ctx.isPointInPath(outline,x,y))points.push({x,y,seed:((x*73+y*37)%997)/997});ctx.restore();
    }else outline=null;dirty=true;}
    const resize=new ResizeObserver(([entry])=>{w=entry.contentRect.width;h=entry.contentRect.height;const dpr=Math.min(devicePixelRatio||1,2);el.width=w*dpr;el.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);prepare();draw();});
    const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;});
    function hit(e){const rect=el.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;const {cx,cy,R}=layout();if(view==='radial'){if(Math.hypot(x-cx,y-cy)<R*.62)return;const a=(Math.atan2(y-cy,x-cx)+Math.PI/2+TAU)%TAU;live.current.onSelect(Math.min(rows.length-1,Math.floor(a/TAU*rows.length)));}else live.current.onSelect(Math.max(0,Math.min(rows.length-1,Math.round((x-38)/(w-62)*(rows.length-1)))));}
    el.addEventListener('click',hit);
    function glow(x,y,color,r=2){ctx.save();ctx.shadowColor=color;ctx.shadowBlur=10;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.restore();}
    function draw(){
      ctx.clearRect(0,0,w,h);const {cx,cy,R}=layout(),selected=Math.max(0,live.current.index),phase=reduced?1:Math.min(1,age/1.5),ease=1-Math.pow(1-phase,3);
      ctx.font='8px "IBM Plex Mono",monospace';ctx.lineWidth=.5;ctx.strokeStyle='#29404c';ctx.setLineDash([2,5]);ctx.beginPath();ctx.moveTo(15,cy);ctx.lineTo(w-15,cy);ctx.moveTo(cx,28);ctx.lineTo(cx,h-30);ctx.stroke();ctx.setLineDash([]);
      if(view==='radial'){
        // Monthly rings around a true geographic outline, with per-series log scales.
        for(let j=0;j<4;j++){ctx.beginPath();ctx.arc(cx,cy,R*(.65+j*.11),0,TAU);ctx.strokeStyle=j===3?'#4b606b':'#233741';ctx.stroke();}
        // Year-on-year threads join the same calendar month, making the temporal comparison explicit.
        CHANNELS.forEach((ch,j)=>{for(let i=0;i<rows.length-12;i++){
          const v0=rows[i][ch.key],v1=rows[i+12][ch.key];if(!v0&&!v1)continue;
          const a=i/rows.length*TAU-Math.PI/2,b=(i+12)/rows.length*TAU-Math.PI/2;
          const r0=R*(.67+j*.11+Math.log1p(v0)/Math.log1p(max[j])*.085),r1=R*(.67+j*.11+Math.log1p(v1)/Math.log1p(max[j])*.085);
          const x0=cx+Math.cos(a)*r0,y0=cy+Math.sin(a)*r0,x1=cx+Math.cos(b)*r1,y1=cy+Math.sin(b)*r1;
          const mx=cx+Math.cos((a+b)/2)*R*.46,my=cy+Math.sin((a+b)/2)*R*.46;
          const active=i===selected||i+12===selected;
          ctx.globalAlpha=(active?.75:.13)*ease;ctx.strokeStyle=ch.color;ctx.lineWidth=active?1:.5;
          ctx.beginPath();ctx.moveTo(x0,y0);ctx.quadraticCurveTo(mx,my,x1,y1);ctx.stroke();ctx.globalAlpha=1;
          if(live.current.ambient&&!reduced&&(active||i%3===0)){const t=(time*.11+i*.173)%1,q=1-t,x=q*q*x0+2*q*t*mx+t*t*x1,y=q*q*y0+2*q*t*my+t*t*y1;ctx.fillStyle=ch.color;ctx.globalAlpha=active?.9:.5;ctx.fillRect(x,y,active?2:1,active?2:1);ctx.globalAlpha=1;}
        }});
        if(outline){ctx.fillStyle='#10202b';ctx.fill(outline);ctx.strokeStyle='#80bfd0';ctx.lineWidth=.8;ctx.stroke(outline);
          for(const p of points){const a=p.seed*TAU,sr=R*(.6+p.seed*.2),x=cx+Math.cos(a)*sr+(p.x-cx-Math.cos(a)*sr)*ease,y=cy+Math.sin(a)*sr+(p.y-cy-Math.sin(a)*sr)*ease;
            const band=Math.abs((p.y-(cy-R*.5))/R-(time*.07)%1);ctx.fillStyle=band<.035?'#cff3f5':`rgba(103,178,201,${.3+p.seed*.4})`;ctx.fillRect(x,y,band<.035?1.8:1,band<.035?1.8:1);}
          ctx.save();ctx.clip(outline);ctx.strokeStyle='#729cb333';for(let i=-18;i<=18;i++){ctx.beginPath();ctx.moveTo(cx-R,cy+i*9);ctx.lineTo(cx+R,cy+i*9-R*.4);ctx.stroke();}ctx.restore();
        }else{ctx.fillStyle='#8aa7b5';ctx.textAlign='center';ctx.fillText('CONFINI NON DISPONIBILI',cx,cy);ctx.textAlign='left';}
        rows.forEach((row,i)=>{const a=i/rows.length*TAU-Math.PI/2,ca=Math.cos(a),sa=Math.sin(a),active=i===selected;
          CHANNELS.forEach((ch,j)=>{const base=R*(.67+j*.11),extent=Math.log1p(row[ch.key])/Math.log1p(max[j])*R*.085;ctx.strokeStyle=active?'#f3f7ea':ch.color;ctx.globalAlpha=active?1:.65;ctx.lineWidth=active?2:1;ctx.beginPath();ctx.moveTo(cx+ca*base,cy+sa*base);ctx.lineTo(cx+ca*(base+extent*ease),cy+sa*(base+extent*ease));ctx.stroke();if(row[ch.key]){ctx.fillStyle=ch.color;ctx.fillRect(cx+ca*(base+extent*ease)-.8,cy+sa*(base+extent*ease)-.8,1.6,1.6);}});ctx.globalAlpha=1;
          // Fine ticks carry month positions even when every count is zero.
          ctx.strokeStyle='#56748166';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(cx+ca*R*.99,cy+sa*R*.99);ctx.lineTo(cx+ca*R*(row.date.endsWith('-01')?1.04:1.015),cy+sa*R*(row.date.endsWith('-01')?1.04:1.015));ctx.stroke();
          if(row.date.endsWith('-01')){ctx.fillStyle='#a0b4bd';ctx.textAlign=ca>.15?'left':ca<-.15?'right':'center';ctx.fillText(row.date.slice(0,4),cx+ca*R*1.065,cy+sa*R*1.065+3);ctx.textAlign='left';}
          if(eventMonths.has(row.date)){const rr=R*.61,x=cx+ca*rr,y=cy+sa*rr;ctx.strokeStyle='#e8b88066';ctx.beginPath();ctx.moveTo(cx+ca*R*.51,cy+sa*R*.51);ctx.lineTo(x,y);ctx.stroke();ctx.fillStyle=eventMonths.get(row.date).some(e=>e.type==='riuscito')?'#efbe7e':'#091117';ctx.strokeStyle='#efbe7e';ctx.save();ctx.translate(x,y);ctx.rotate(Math.PI/4);ctx.fillRect(-2.5,-2.5,5,5);ctx.strokeRect(-2.5,-2.5,5,5);ctx.restore();}
        });
        const a=selected/rows.length*TAU-Math.PI/2;ctx.strokeStyle='#dfe8d499';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*R*.6,cy+Math.sin(a)*R*.6);ctx.lineTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);ctx.stroke();glow(cx+Math.cos(a)*R,cy+Math.sin(a)*R,'#dcebdc',2.5);
        if(live.current.ambient&&!reduced){const sweep=(time*.09)%TAU-Math.PI/2;ctx.strokeStyle='#a3d6e833';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,R*1.025,sweep-.3,sweep);ctx.stroke();}
        ctx.textAlign='center';ctx.fillStyle='#7898a7';ctx.font='7px "IBM Plex Mono",monospace';ctx.fillText('CONFINI GEOGRAFICI / '+country.iso,cx,cy+R*.48);ctx.textAlign='left';
      }else{
        const left=38,right=w-24,top=34,bottom=h-48,band=(bottom-top)/3;
        CHANNELS.forEach((ch,j)=>{const baseline=top+(j+1)*band-15,scale=band*.67/Math.log1p(max[j]);ctx.fillStyle=ch.color;ctx.fillText(ch.short+' / MAX '+max[j],left,baseline-band+25);ctx.strokeStyle='#304550';ctx.beginPath();ctx.moveTo(left,baseline);ctx.lineTo(right,baseline);ctx.stroke();
          // Filled contour fibers trace only observed values, never synthetic forecast paths.
          for(let layer=0;layer<22;layer++){const f=(layer+1)/22;ctx.beginPath();rows.forEach((r,i)=>{const x=left+i/Math.max(1,rows.length-1)*(right-left),y=baseline-Math.log1p(r[ch.key])*scale*f*ease;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.strokeStyle=ch.color;ctx.globalAlpha=layer===21?.95:.12;ctx.lineWidth=layer===21?1:.5;ctx.stroke();}ctx.globalAlpha=1;
          rows.forEach((r,i)=>{if(!r[ch.key])return;const x=left+i/Math.max(1,rows.length-1)*(right-left),amplitude=Math.log1p(r[ch.key])*scale;for(let k=0;k<Math.ceil(amplitude/2.3);k++){ctx.fillStyle=ch.color;ctx.globalAlpha=.2+.5*(Math.sin(time+i*.8+k)*.5+.5);ctx.fillRect(x,baseline-k*2.3*ease,1.2,1.2);}ctx.globalAlpha=1;});const x=left+selected/Math.max(1,rows.length-1)*(right-left),y=baseline-Math.log1p(rows[selected]?.[ch.key]||0)*scale;glow(x,y,ch.color,2.5);
        });
        rows.forEach((row,i)=>{const x=left+i/Math.max(1,rows.length-1)*(right-left);if(row.date.endsWith('-01')&&Number(row.date.slice(0,4))%3===0){ctx.fillStyle='#8aa5b4';ctx.fillText(row.date.slice(0,4),x,bottom+12);}if(eventMonths.has(row.date)){ctx.strokeStyle='#eab77477';ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();ctx.setLineDash([]);}});const x=left+selected/Math.max(1,rows.length-1)*(right-left);ctx.strokeStyle='#cfdfdf77';ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();
      }
      ctx.fillStyle='#7895a4';ctx.font='8px "IBM Plex Mono",monospace';ctx.fillText('ACLED / SERIE MENSILI',15,18);ctx.textAlign='right';ctx.fillText(rows.length+' MESI',w-15,18);ctx.textAlign='left';
    }
    function loop(now){frame=requestAnimationFrame(loop);if(now-last<32)return;const delta=Math.min((now-last)/1000,.05);last=now;if(!visible||document.hidden)return;const moving=live.current.ambient&&!reduced;if(moving){time+=delta;age+=delta;}else if(reduced)age=2;if(moving||dirty||previous!==live.current.index){draw();dirty=false;previous=live.current.index;}}
    resize.observe(el);observer.observe(el);frame=requestAnimationFrame(loop);
    return()=>{resize.disconnect();observer.disconnect();cancelAnimationFrame(frame);el.removeEventListener('click',hit);};
  },[country.iso,rows,events,view,reduced]);
  return <canvas ref={ref} className="country-canvas" role="img" aria-label={`Impronta temporale di ${country.name}: confini, serie mensili ACLED e tentativi di golpe. Usa il cursore sottostante per esplorare i valori.`}/>;
}
