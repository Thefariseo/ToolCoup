"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SignalAtlas, { CHANNELS, GeoLocator } from "@/components/SignalAtlas";
import { pct, TYPE_LABEL } from "@/lib/format";
import { labelEn } from "@/lib/english";

const fmt = s => s ? new Date(s+'-01T00:00:00Z').toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'}) : '—';
function makeRows(data, window) {
  const s=data?.series;if(!s?.unrest?.length)return [];
  const [year,month]=s.start.split('-').map(Number),offset=Math.max(0,s.unrest.length-window);
  return s.unrest.slice(offset).map((_,i)=>({date:new Date(Date.UTC(year,month-1+offset+i,1)).toISOString().slice(0,7),...Object.fromEntries(CHANNELS.map(c=>[c.key,s[c.key]?.[offset+i]??0]))}));
}
export default function RiskField({countries,selected,baseRate,horizon=6}) {
  const country=selected||countries[0];
  const [result,setResult]=useState(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
  const [cursor,setCursor]=useState(null),[playing,setPlaying]=useState(false),[reduced,setReduced]=useState(false);
  const [ambient,setAmbient]=useState(true),[view,setView]=useState('radial'),[window,setWindow]=useState(180);
  const [speed,setSpeed]=useState(600),[focus,setFocus]=useState(false),[layers,setLayers]=useState(CHANNELS.map(c=>c.key));
  useEffect(()=>{const ctl=new AbortController();setError(false);setCursor(null);setPlaying(false);
    fetch(`/api/countries/${encodeURIComponent(country.slug)}`,{signal:ctl.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>setResult({slug:country.slug,data})).catch(e=>{if(e.name!=='AbortError')setError(true);});return()=>ctl.abort();
  },[country.slug,retry]);
  useEffect(()=>{const mq=matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>{setReduced(mq.matches);if(mq.matches)setPlaying(false);};sync();mq.addEventListener('change',sync);return()=>mq.removeEventListener('change',sync);},[]);
  useEffect(()=>{if(!focus)return;const key=e=>{if(e.key==='Escape')setFocus(false);};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[focus]);
  const data=result?.slug===country.slug?result.data:null;
  const rows=useMemo(()=>makeRows(data,window),[data,window]);
  const events=useMemo(()=>data?.coups?.filter(e=>!e.dup&&e.prec!=='year'&&'ABC'.includes(e.conf)&&['riuscito','fallito'].includes(e.type))||[],[data]);
  const index=cursor==null?rows.length-1:Math.max(0,Math.min(cursor,rows.length-1)),current=rows[index];
  const inMonth=events.filter(e=>current&&e.date.slice(0,7)===current.date);
  useEffect(()=>{if(!playing||reduced||!rows.length)return;const id=setInterval(()=>{if(document.hidden)return;setCursor(i=>i==null||i>=rows.length-1?0:i+1);},speed);return()=>clearInterval(id);},[playing,reduced,rows.length,speed]);
  const select=i=>{setCursor(i);setPlaying(false);};
  const toggleLayer=key=>setLayers(old=>old.includes(key)?old.filter(k=>k!==key):[...old,key]);
  function exportCSV(){
    const text=['month,unrest_events,violence_events,reported_fatalities',...rows.map(r=>[r.date,...CHANNELS.map(ch=>r[ch.key])].join(','))].join('\n');
    const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download=`toolcoup-${country.slug}-${rows[0].date}-${rows.at(-1).date}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const summary=CHANNELS.map(ch=>({ ...ch, total:rows.slice(Math.max(0,index-11),index+1).reduce((n,r)=>n+r[ch.key],0) }));
  const drivers=data?.drivers||country.drivers||[];
  return <div className={`country-instrument ${focus?'instrument-focus':''}`} aria-busy={!data&&!error}>
    <div className="country-instrument-title">
      <div className="country-heading"><span className="country-code">{country.iso||'—'}</span><div><span className="eyebrow">COUNTRY INTELLIGENCE / {country.region}</span><h2>{country.name}</h2><p>{rows.length?`${rows[0].date} — ${rows.at(-1).date}  /  ${rows.length} MONTHLY OBSERVATIONS`:'LOADING OBSERVATIONS'}</p></div></div>
      <div className="instrument-title-actions"><button className="text-control" aria-pressed={focus} onClick={()=>setFocus(!focus)}>{focus?'↙ EXIT FOCUS':'↗ FOCUS'}</button><Link href={`/paese/${country.slug}`}>DOSSIER ↗</Link></div>
    </div>
    <div className="analysis-toolbar"><div className="instrument-view-switch" role="group" aria-label="Analytical view"><button aria-pressed={view==='radial'} onClick={()=>setView('radial')}><span>◉</span> TEMPORAL ATLAS</button><button aria-pressed={view==='terrain'} onClick={()=>setView('terrain')}><span>▧</span> SIGNAL TERRAIN</button></div><div className="analysis-tools"><label>WINDOW <select aria-label="Historical window" value={window} onChange={e=>{setWindow(Number(e.target.value));setCursor(null);setPlaying(false);}}><option value={60}>5 YEARS</option><option value={120}>10 YEARS</option><option value={180}>15 YEARS</option></select></label><button disabled={!rows.length} onClick={exportCSV}>↓ CSV</button></div></div>
    {error?<div className="instrument-empty" role="alert">Unable to load observations. <button onClick={()=>setRetry(x=>x+1)}>Retry</button></div>:!data?<div className="instrument-empty"><span className="loading-reticle">⌖</span> RETRIEVING MONTHLY OBSERVATIONS</div>:!rows.length?<div className="instrument-empty">Monthly observations are not available for this territory.</div>:<>
      <div className="country-instrument-body">
        <div className="country-stage"><SignalAtlas country={country} rows={rows} events={events} index={index} onSelect={select} view={view} reduced={reduced} ambient={ambient} layers={layers}/></div>
        <aside className="signal-readouts" aria-label="Selected month observations">
          <div className="locator"><div className="mini-section-label"><span>LOCATOR</span><span>ISO {country.iso}</span></div><GeoLocator iso={country.iso}/></div>
          <div className="readout-date"><span>INSPECTION DATE</span><h3>{fmt(current.date)}</h3></div>
          {CHANNELS.map((ch,i)=><div className="channel-readout" key={ch.key} style={{'--channel':ch.color}}><div><span>0{i+1} / {ch.short}</span><strong>{current[ch.key].toLocaleString('en-GB')}</strong></div><Spark values={rows.map(r=>r[ch.key])} index={index} color={ch.color}/><small>{summary[i].total.toLocaleString('en-GB')} / trailing {Math.min(index+1,12)} months</small></div>)}
          <div className="month-event"><span className="eyebrow">COUP RECORD / A–C</span>{inMonth.length?inMonth.map(e=><p key={e.id}>{e.type==='riuscito'?'◆':'◇'} {e.prec==='month'?e.date.slice(0,7):e.date}<br/>{TYPE_LABEL[e.type]}</p>):<p>No attempt recorded in this month.</p>}</div>
        </aside>
      </div>
      <div className="layer-toolbar"><div role="group" aria-label="Visible signal layers">{CHANNELS.map(ch=><button key={ch.key} aria-pressed={layers.includes(ch.key)} onClick={()=>toggleLayer(ch.key)} style={{'--channel':ch.color}}><i/>{ch.name}</button>)}</div><button className="motion-control" disabled={reduced} aria-pressed={ambient&&!reduced} onClick={()=>setAmbient(!ambient)}>{reduced?'REDUCED MOTION':ambient?'Ⅱ MOTION':'▷ MOTION'}</button></div>
      <div className="instrument-scrubber"><button className="play-button" disabled={reduced} aria-pressed={playing} onClick={()=>{setPlaying(!playing);if(index===rows.length-1)setCursor(0);}}>{playing?'Ⅱ PAUSE':'▷ PLAY'}</button><select aria-label="Playback speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value={1200}>0.5×</option><option value={600}>1×</option><option value={300}>2×</option></select><div><label htmlFor="signal-month">{fmt(current.date)}<span>{rows[0].date} <b>—</b> {rows.at(-1).date}</span></label><input id="signal-month" type="range" min="0" max={rows.length-1} value={index} onChange={e=>select(Number(e.target.value))}/></div><button onClick={()=>{setCursor(null);setPlaying(false);}}>LATEST ↗</button></div>
      <div className="temporal-matrix"><div className="matrix-title"><span>04 / OBSERVATION MATRIX</span><span>RELATIVE INTENSITY · {rows.length} MONTHS</span></div>{CHANNELS.map(ch=>{const max=Math.max(1,...rows.map(r=>r[ch.key]));return <div className="matrix-row" key={ch.key}><span style={{color:ch.color}}>{ch.short}</span><div>{rows.map((r,i)=><button key={r.date} tabIndex={index===i?0:-1} aria-label={`${ch.name}, ${fmt(r.date)}: ${r[ch.key]}`} title={`${fmt(r.date)} · ${r[ch.key]}`} onClick={()=>select(i)} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();select(Math.max(0,Math.min(rows.length-1,index+(e.key==='ArrowRight'?1:-1))));}}} className={index===i?'active':''} style={{background:ch.color,opacity:.12+.88*Math.log1p(r[ch.key])/Math.log1p(max)}}/>)}</div></div>;})}<div className="matrix-axis"><span>{rows[0].date}</span><span>{rows[Math.floor(rows.length/2)].date}</span><span>{rows.at(-1).date}</span></div></div>
      <div className="coup-bookmarks"><span>EVENT<br/>BOOKMARKS</span>{events.filter(e=>e.date.slice(0,7)>=rows[0].date&&e.date.slice(0,7)<=rows.at(-1).date).slice(-5).map(e=><button key={e.id} onClick={()=>select(rows.findIndex(r=>r.date===e.date.slice(0,7)))}>{e.type==='riuscito'?'◆':'◇'} {e.prec==='month'?e.date.slice(0,7):e.date}<small>{TYPE_LABEL[e.type]}</small></button>)}<small>A–C confidence<br/>Month or day precision</small></div>
      <div className="country-evidence"><div><span className="eyebrow">FORECAST / {horizon} MONTHS</span><b>{pct(country.risk)}</b><small>{baseRate>0?`${(country.risk/baseRate).toFixed(2)}× BASE RATE`:'BASE RATE UNAVAILABLE'}</small></div><div className="evidence-drivers"><span className="eyebrow">MODEL CONTRIBUTIONS / LOG-ODDS</span>{drivers.slice(0,3).map(d=><p key={d.label}><span>{labelEn(d.label)}</span><b className={d.contrib>0?'positive':'negative'}>{d.contrib>0?'+':''}{d.contrib.toFixed(2)}</b></p>)}</div><Link href="/metodo">MODEL<br/>DOCUMENTATION ↗</Link></div>
      <details className="encoding-notes"><summary>READING THIS INSTRUMENT <span>ENCODING / SOURCES / LIMITS</span></summary><p>Each mark represents a monthly observation. Height and intensity use log(1 + count), normalized separately for each signal. In the atlas, fibers compare the same calendar month across years; they do not represent causal or cross-border connections. The outer micro-arcs summarize annual totals within the selected window. The terrain arranges observations by calendar month and year; its fine mesh interpolates between recorded samples, which remain marked as square nodes. Geographic stippling depicts territory, not event locations. Motion highlights existing geometry and never generates forecast scenarios. Diamonds mark recorded successful (◆) and failed (◇) coups with A–C confidence and dates known to at least the month. The forecast is the latest model estimate and does not change with the historical cursor.</p></details>
    </>}
  </div>;
}
function Spark({values,index,color}){const max=Math.max(1,...values),x=i=>i/Math.max(1,values.length-1)*160,y=v=>30-Math.log1p(v)/Math.log1p(max)*26,path=values.map((v,i)=>`${i?'L':'M'}${x(i)},${y(v)}`).join(' ');return <svg viewBox="0 0 160 34" aria-hidden="true"><path d={`${path} L160,33 L0,33 Z`} fill={color} opacity=".07"/><path d={path} fill="none" stroke={color} strokeWidth=".7"/><line x1={x(index)} x2={x(index)} y1="0" y2="34" stroke="#e7e5c0" strokeWidth=".5"/><circle cx={x(index)} cy={y(values[index])} r="1.8" fill={color}/></svg>;}
