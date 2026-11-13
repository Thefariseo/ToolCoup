"use client";

import { useEffect, useRef } from "react";
import { geoMercator, geoPath, geoEqualEarth, geoCentroid } from "d3-geo";
import { feature } from "topojson-client";
import topo from "world-atlas/countries-50m.json";

const GEOGRAPHY = feature(topo, topo.objects.countries);
const SHAPES = new Map(GEOGRAPHY.features.map(f => [f.id, f]));
const TAU = Math.PI * 2;
export const CHANNELS = [
  { key: "unrest", name: "Protests & riots", short: "UNREST", color: "#8ed8ce" },
  { key: "violence", name: "Political violence", short: "VIOLENCE", color: "#e8ad74" },
  { key: "fatalities", name: "Reported fatalities", short: "FATALITIES", color: "#b9ade5" },
];

/** Geometry is contextual. Only monthly bars, profiles and markers encode observations. */
export default function SignalAtlas({ country, rows, events, index, onSelect, view, reduced, ambient, layers }) {
  const ref = useRef(null);
  const live = useRef({ index, onSelect, ambient, layers });
  live.current = { index, onSelect, ambient, layers };
  useEffect(() => {
    const canvas = ref.current, ctx = canvas.getContext("2d");
    if (!ctx || !rows.length) return;
    let w = 1, h = 1, frame, previousTime = 0, elapsed = 0, visible = true, dirty = true;
    let outline = null, dots = [], geographicLines = [], hitTargets = [];
    let pointer = null, lastSignature = "";
    const shape = SHAPES.get(String(country.iso));
    const maxima = CHANNELS.map(c => Math.max(1, ...rows.map(r => r[c.key])));
    const values = CHANNELS.map((c, j) => rows.map(r => Math.log1p(r[c.key]) / Math.log1p(maxima[j])));
    const monthEvents = new Map();
    for (const e of events) {
      const date = e.date.slice(0, 7);
      if (!monthEvents.has(date)) monthEvents.set(date, []);
      monthEvents.get(date).push(e);
    }
    const years = [...new Set(rows.map(r => r.date.slice(0, 4)))];
    const layout = () => ({ cx: w * .49, cy: h * .49, r: Math.min(w * .40, h * .395) });
    const angle = i => i / rows.length * TAU - Math.PI / 2;
    const polar = (a, r) => { const l = layout(); return [l.cx + Math.cos(a) * r, l.cy + Math.sin(a) * r]; };
    const line = (points, color, width = .6, alpha = 1) => {
      ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = alpha; ctx.stroke(); ctx.globalAlpha = 1;
    };
    const label = (text, x, y, color = "#78918e", size = 8, align = "left") => {
      ctx.fillStyle = color; ctx.font = `${size}px "JetBrains Mono", monospace`; ctx.textAlign = align;
      ctx.fillText(text, x, y); ctx.textAlign = "left";
    };
    const circle = (x, y, radius, color, width = .5) => {
      ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    };
    const light = (x, y, color, radius = 2) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 5);
      g.addColorStop(0, color + "80"); g.addColorStop(1, color + "00");
      ctx.fillStyle = g; ctx.fillRect(x - radius * 5, y - radius * 5, radius * 10, radius * 10);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
    };
    function prepare() {
      const { cx, cy, r } = layout(); dots = []; geographicLines = [];
      if (shape) {
        const p = geoMercator().fitExtent([[cx-r*.44, cy-r*.36], [cx+r*.44, cy+r*.32]], shape);
        const path = geoPath(p), bounds = path.bounds(shape);
        outline = new Path2D(path(shape));
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        const step = w < 450 ? 3 : 2.2;
        for (let y=bounds[0][1]; y<bounds[1][1]; y+=step) {
          let run=[];
          for (let x=bounds[0][0]; x<bounds[1][0]; x+=step) {
            if (ctx.isPointInPath(outline,x,y)) { const d={x,y,seed:((x*71+y*29)%997)/997};dots.push(d);run.push([x,y]); }
            else if(run.length){geographicLines.push(run);run=[];}
          }
          if(run.length)geographicLines.push(run);
        }
        ctx.restore();
      } else outline = null;
      dirty = true;
    }
    function geography() {
      const {cx,cy,r}=layout();
      if (!outline) { label("BOUNDARY UNAVAILABLE",cx,cy,"#879d98",9,"center"); return; }
      ctx.fillStyle="#0b1515";ctx.fill(outline);
      const scan=((elapsed*.085)%1.4)-.2;
      geographicLines.forEach((points,i)=>line(points,"#456f6c",.35,.18+(i%4)*.08));
      for(const p of dots){
        const bright=Math.max(0,1-Math.abs((p.y-cy+r*.4)/(r*.8)-scan)*22);
        ctx.fillStyle=bright>.1?`rgba(194,241,219,${.45+bright*.45})`:`rgba(125,183,172,${.15+p.seed*.42})`;
        const size=bright>.1?1.5:.8;ctx.fillRect(p.x,p.y,size,size);
      }
      ctx.strokeStyle="#a1d5c5";ctx.lineWidth=.7;ctx.stroke(outline);
      // Fine registration guides around the true boundary, not event coordinates.
      for(const side of [-1,1])for(const v of [-1,1]){
        const x=cx+side*r*.5,y=cy+v*r*.4;
        line([[x-side*9,y],[x,y],[x,y-v*9]],"#527771",.7);
      }
      label(country.name.toUpperCase(),cx,cy+r*.43,"#b5cbc2",w<450?8:10,"center");
      label("NATURAL EARTH / ISO "+country.iso,cx,cy+r*.49,"#647d78",7,"center");
      if(shape){const c=geoCentroid(shape);label(`${Math.abs(c[1]).toFixed(2)}°${c[1]>=0?'N':'S'}  ${Math.abs(c[0]).toFixed(2)}°${c[0]>=0?'E':'W'}`,cx,cy+r*.55,"#647d78",7,"center");}
    }
    function atlas(selected) {
      const {cx,cy,r}=layout();
      // Instrument reticle and monthly timing marks.
      [ .56,.61,.65,.76,.87,.98,1.035,1.09 ].forEach((v,i)=>circle(cx,cy,r*v,i===7?"#31463f":"#1f302c",i===7?.8:.5));
      for(let i=0;i<rows.length;i++){
        const a=angle(i),isYear=rows[i].date.endsWith("-01"),p=polar(a,r*1.035),q=polar(a,r*(isYear?1.075:1.05));
        line([p,q],isYear?"#98a89a":"#3e574e",isYear?.8:.4);
        if(isYear){const [x,y]=polar(a,r*1.13);label(rows[i].date.slice(0,4),x,y+3,"#b1b6a6",8,"center");}
      }
      // An actual month-to-next-year comparison network, arranged concentrically by signal.
      CHANNELS.forEach((ch,j)=>{
        if(!live.current.layers.includes(ch.key))return;
        for(const lag of [12,24,36,48,60]) for(let i=0;i<rows.length-lag;i++){
          if(!rows[i][ch.key]&&!rows[i+lag][ch.key])continue;
          const a=angle(i),b=angle(i+lag),r0=r*(.65+j*.11+values[j][i]*.10),r1=r*(.65+j*.11+values[j][i+lag]*.10);
          const start=polar(a,r0),end=polar(b,r1),mid=polar((a+b)/2,r*(.20+lag/60*.21+Math.abs(values[j][i]-values[j][i+lag])*.08));
          const active=i===selected||i+lag===selected;
          // Multiple nearby fibers reveal signal magnitude without fabricating extra observations.
          const fibers=1+Math.floor((values[j][i]+values[j][i+lag])*2);
          for(let f=0;f<fibers;f++){
            ctx.beginPath();ctx.moveTo(...start);ctx.quadraticCurveTo(mid[0]+f*.65,mid[1]+f*.65,...end);
            ctx.strokeStyle=ch.color;ctx.lineWidth=active?.8:.35;ctx.globalAlpha=active?.65:lag===12?.12:.055;ctx.stroke();
          }
          ctx.globalAlpha=1;
          if(live.current.ambient&&!reduced&&(active||(i+lag)%5===0)){
            const t=(elapsed*.06+i*.127+j*.3+lag*.01)%1,u=1-t;
            const x=u*u*start[0]+2*u*t*mid[0]+t*t*end[0],y=u*u*start[1]+2*u*t*mid[1]+t*t*end[1];
            ctx.fillStyle=ch.color;ctx.globalAlpha=active?1:.45;ctx.fillRect(x,y,active?2:1,active?2:1);ctx.globalAlpha=1;
          }
        }
        rows.forEach((row,i)=>{
          const a=angle(i),base=r*(.65+j*.11),v=values[j][i],end=base+v*r*.10;
          line([polar(a,base),polar(a,end)],i===selected?"#f3edce":ch.color,i===selected?2:Math.max(.6,r/190),i===selected?1:.75);
          const [x,y]=polar(a,end);if(v>0){ctx.fillStyle=ch.color;ctx.fillRect(x-.7,y-.7,1.4,1.4);}
        });
        // Continuous contour follows the observed monthly endpoints.
        line(rows.map((row,i)=>polar(angle(i),r*(.65+j*.11+values[j][i]*.10))),ch.color,.45,.45);
      });
      // Outer micro-bars are annual totals of the same channels, on their own log scales.
      const yearly = years.map(year => ({year,indices:rows.map((row,i)=>row.date.startsWith(year)?i:-1).filter(i=>i>=0)}));
      CHANNELS.forEach((ch,j)=>{
        if(!live.current.layers.includes(ch.key))return;
        const totals=yearly.map(y=>y.indices.reduce((sum,i)=>sum+rows[i][ch.key],0));
        const peak=Math.max(1,...totals);
        yearly.forEach((y,k)=>{
          const a=angle(y.indices[0])+.012,b=angle(y.indices.at(-1)+1)-.012;
          ctx.beginPath();ctx.arc(cx,cy,r*(1.015+j*.009),a,b);ctx.lineWidth=1+3*Math.log1p(totals[k])/Math.log1p(peak);ctx.strokeStyle=ch.color;ctx.globalAlpha=.20+.30*Math.log1p(totals[k])/Math.log1p(peak);ctx.stroke();ctx.globalAlpha=1;
        });
      });
      geography();
      rows.forEach((row,i)=>{
        if(!monthEvents.has(row.date))return;
        const a=angle(i),p=polar(a,r*.585),events=monthEvents.get(row.date),success=events.some(e=>e.type==='riuscito');
        line([polar(a,r*.555),polar(a,r*1.02)],"#c0a16b",.5,.35);
        ctx.save();ctx.translate(...p);ctx.rotate(Math.PI/4);ctx.fillStyle=success?"#e6ba7e":"#0a1110";ctx.fillRect(-3,-3,6,6);ctx.strokeStyle="#e6ba7e";ctx.strokeRect(-3,-3,6,6);ctx.restore();
      });
      // Peripheral statistical strips use the same observations as the main dial.
      if(w>760){
        const railW=110,left=18,right=w-128,top=150;
        label('ANNUAL TOTALS',left,top-28,'#b0ba9c',8);
        label('U / V / F',left,top-14,'#72856f',7);
        const totals=years.map(year=>CHANNELS.map(ch=>rows.filter(row=>row.date.startsWith(year)).reduce((sum,row)=>sum+row[ch.key],0)));
        const maxYear=CHANNELS.map((_,j)=>Math.max(1,...totals.map(t=>t[j])));
        years.forEach((year,yi)=>{
          const y=top+yi*15,active=rows[selected].date.startsWith(year);
          label(year,left,y+4,active?'#dfd4aa':'#718570',7);
          CHANNELS.forEach((ch,j)=>{
            if(!live.current.layers.includes(ch.key))return;
            const width=Math.log1p(totals[yi][j])/Math.log1p(maxYear[j])*65;
            line([[left+34,y-3+j*3],[left+34+width,y-3+j*3]],ch.color,1,active?.9:.45);
          });
        });
        label('MONTHLY MEANS',right,top-28,'#b0ba9c',8);
        label('ALL YEARS IN WINDOW',right,top-14,'#72856f',6);
        const means=Array.from({length:12},(_,m)=>CHANNELS.map(ch=>{const rs=rows.filter(row=>Number(row.date.slice(5))===m+1);return rs.length?rs.reduce((n,row)=>n+row[ch.key],0)/rs.length:0;}));
        const maxMean=CHANNELS.map((_,j)=>Math.max(1,...means.map(t=>t[j])));
        means.forEach((mean,m)=>{
          const y=top+m*18,active=Number(rows[selected].date.slice(5))===m+1;
          label(String(m+1).padStart(2,'0'),right,y+4,active?'#dfd4aa':'#718570',7);
          CHANNELS.forEach((ch,j)=>{if(live.current.layers.includes(ch.key))line([[right+24,y-3+j*3],[right+24+mean[j]/maxMean[j]*78,y-3+j*3]],ch.color,1.2,active?.95:.4);});
        });
        label('LOG SCALE / EACH SIGNAL',left,top+years.length*15+17,'#647761',6);
        label('LINEAR / EACH SIGNAL',right,top+12*18+17,'#647761',6);
      }
      // Compact callouts keep event dates close to the plotted evidence.
      const marked=rows.map((row,i)=>monthEvents.has(row.date)?i:-1).filter(i=>i>=0).slice(-3);
      marked.forEach((i,k)=>{
        const a=angle(i),p=polar(a,r*.585),onRight=Math.cos(a)>0;
        const endX=onRight?w-18:18,endY=42+k*27;
        ctx.setLineDash([2,3]);line([p,[onRight?w-100:100,endY],[endX,endY]],"#a08e5d",.45,.55);ctx.setLineDash([]);
        label(rows[i].date+" / COUP",endX,endY-5,"#b8ab82",7,onRight?'right':'left');
      });
      const a=angle(selected),p=polar(a,r*1.035);
      line([polar(a,r*.57),p],"#ededd0",.8,.9);light(...p,"#ece9b9",2.2);
      if(live.current.ambient&&!reduced){const a=elapsed*.08-Math.PI/2;ctx.beginPath();ctx.arc(cx,cy,r*1.09,a-.18,a);ctx.strokeStyle="#a5c6a4";ctx.lineWidth=1;ctx.stroke();}
      label("01 / GEOGRAPHIC CONTEXT",17,h-33,"#83998e",7);
      label("02 / MONTHLY SIGNAL RINGS",17,h-20,"#83998e",7);
      label("03 / SAME-MONTH LINKS ACROSS YEARS",w-17,h-33,"#83998e",7,"right");
      label("CLICK RING TO INSPECT",w-17,h-20,"#c8ba91",7,"right");
    }
    function terrain(selected) {
      hitTargets=[];
      const left=w*.11,wide=w*.63,depth=w*.18,top=52,usable=h-110,section=usable/3;
      CHANNELS.forEach((ch,j)=>{
        const baseline=top+(j+1)*section-29,amplitude=section*.48;
        label(`0${j+1} / ${ch.name.toUpperCase()}`,18,top+j*section-15,ch.color,8);
        label(`MAX ${maxima[j].toLocaleString('en-GB')}`,w-18,top+j*section-15,"#7e9189",7,"right");
        if(!live.current.layers.includes(ch.key)){label("LAYER HIDDEN",w/2,baseline,ch.color,8,"center");return;}
        const point=(rowIndex,factor=1)=>{
          const row=rows[rowIndex],yr=years.indexOf(row.date.slice(0,4)),m=Number(row.date.slice(5))-1,z=yr/Math.max(1,years.length-1);
          return [left+m/11*wide+z*depth,baseline-z*section*.32-values[j][rowIndex]*amplitude*factor];
        };
        // A calendar mesh: x=month, depth=year, height=log monthly count.
        // Fine stippling interpolates adjacent known samples; exact observations remain square nodes.
        const calendar=new Map(rows.map((row,i)=>[row.date,i]));
        const sample=(yi,mi)=>calendar.get(years[yi]+'-'+String(mi+1).padStart(2,'0'));
        const surface=(year,month,value)=>[left+month/11*wide+year/Math.max(1,years.length-1)*depth,baseline-year/Math.max(1,years.length-1)*section*.32-value*amplitude];
        for(let yi=0;yi<years.length-1;yi++)for(let mi=0;mi<11;mi++){
          const ids=[sample(yi,mi),sample(yi,mi+1),sample(yi+1,mi),sample(yi+1,mi+1)];
          if(ids.some(i=>i==null))continue;
          const vs=ids.map(i=>values[j][i]);
          for(let u=0;u<1;u+=.12)for(let v=0;v<1;v+=.2){
            const a=u*u*(3-2*u),b=v*v*(3-2*v),value=(vs[0]*(1-a)+vs[1]*a)*(1-b)+(vs[2]*(1-a)+vs[3]*a)*b;
            if(value<.015)continue;
            const p=surface(yi+v,mi+u,value),scan=(elapsed*.11)%1,bright=Math.max(0,1-Math.abs(scan-(mi+u)/11)*20);
            ctx.fillStyle=ch.color;ctx.globalAlpha=.10+value*.14+bright*.20;ctx.fillRect(p[0],p[1],.8+bright*.5,.8+bright*.5);ctx.globalAlpha=1;
          }
        }
        for(let month=1;month<=12;month++){
          const ids=rows.map((r,i)=>Number(r.date.slice(5))===month?i:-1).filter(i=>i>=0);
          line(ids.map(i=>point(i,0)),"#2c4037",.5);
          line(ids.map(i=>point(i)),ch.color,.45,.16);
        }
        years.forEach((year,yi)=>{
          const ids=rows.map((r,i)=>r.date.startsWith(year)?i:-1).filter(i=>i>=0),isActive=rows[selected].date.startsWith(year);
          for(let fiber=1;fiber<=7;fiber++)line(ids.map(i=>point(i,fiber/7)),ch.color,fiber===7?.85:.35,fiber===7?(isActive?1:.5):.06);
          ids.forEach(i=>{
            const p=point(i);hitTargets.push({x:p[0],y:p[1],index:i});
            ctx.fillStyle=ch.color;ctx.globalAlpha=isActive?.9:.45;ctx.fillRect(p[0]-.9,p[1]-.9,1.8,1.8);ctx.globalAlpha=1;
            if(live.current.ambient&&!reduced){const scan=(elapsed*.11)%1,month=(Number(rows[i].date.slice(5))-1)/11;const bright=Math.max(0,1-Math.abs(scan-month)*18);if(bright>.1)light(...p,ch.color,bright*1.5);}
          });
          if(yi%3===0||yi===years.length-1){const p=point(ids.at(-1),0);label(year,p[0]+8,p[1]+3,isActive?ch.color:"#617b70",7);}
        });
        const p=point(selected),bottom=point(selected,0);line([bottom,p],"#e7e7c9",.8);light(...p,ch.color,2.5);
        for(const m of [1,4,7,10,12])label(["JAN","APR","JUL","OCT","DEC"][[1,4,7,10,12].indexOf(m)],left+(m-1)/11*wide,baseline+14,"#7e9189",7,"center");
      });
      label("X / MONTH   Y / LOG COUNT   Z / YEAR · INTERPOLATED MESH",18,h-22,"#92a397",7);
      label("SELECT A NODE TO INSPECT",w-18,h-22,"#c8ba91",7,"right");
    }
    function draw() {
      ctx.clearRect(0,0,w,h);
      const {cx,cy}=layout(),selected=Math.max(0,Math.min(rows.length-1,live.current.index));
      ctx.fillStyle="#080d0c";ctx.fillRect(0,0,w,h);
      // Discreet drafting-paper grid and fiducial marks.
      ctx.fillStyle="#263a312f";for(let x=16;x<w;x+=16)for(let y=16;y<h;y+=16)ctx.fillRect(x,y,.8,.8);
      ctx.setLineDash([2,6]);line([[cx,28],[cx,h-40]],"#32483c",.45,.7);line([[12,cy],[w-12,cy]],"#32483c",.45,.7);ctx.setLineDash([]);
      if(view==='radial')atlas(selected);else terrain(selected);
      for(const [x,y,sx,sy] of [[8,8,1,1],[w-8,8,-1,1],[8,h-8,1,-1],[w-8,h-8,-1,-1]])line([[x,y+sy*12],[x,y],[x+sx*12,y]],"#536b59",.8);
      label(view==='radial'?"TEMPORAL ATLAS / MULTILAYER":"SIGNAL TERRAIN / CALENDAR PROFILES",18,22,"#a1b4a3",8);
      label(`${String(selected+1).padStart(3,'0')} / ${rows.length}   ${rows[selected].date}`,w-18,22,"#d6cfad",8,"right");
      if(pointer){line([[pointer.x-6,pointer.y],[pointer.x+6,pointer.y]],"#d2d7b2",.7);line([[pointer.x,pointer.y-6],[pointer.x,pointer.y+6]],"#d2d7b2",.7);}
    }
    function locate(e) {
      const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
      if(view==='radial'){const {cx,cy,r}=layout();if(Math.hypot(x-cx,y-cy)<r*.56)return null;return Math.round(((Math.atan2(y-cy,x-cx)+Math.PI/2+TAU)%TAU)/TAU*rows.length)%rows.length;}
      return hitTargets.reduce((best,p)=>{const distance=Math.hypot(x-p.x,y-p.y);return distance<best.distance?{...p,distance}:best;},{distance:Infinity,index:null}).index;
    }
    function click(e){const i=locate(e);if(i!=null)live.current.onSelect(i);}
    function move(e){const box=canvas.getBoundingClientRect();pointer={x:e.clientX-box.left,y:e.clientY-box.top};dirty=true;}
    function leave(){pointer=null;dirty=true;}
    const resize=new ResizeObserver(([e])=>{w=e.contentRect.width;h=e.contentRect.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);prepare();draw();});
    const intersection=new IntersectionObserver(([e])=>{visible=e.isIntersecting;if(visible)dirty=true;});
    function animate(now){
      frame=requestAnimationFrame(animate);if(now-previousTime<33)return;
      const delta=Math.min((now-previousTime)/1000,.05);previousTime=now;
      if(!visible||document.hidden)return;
      const moving=live.current.ambient&&!reduced,signature=live.current.index+'|'+live.current.layers.join(',');
      if(moving)elapsed+=delta;
      if(moving||dirty||signature!==lastSignature){draw();dirty=false;lastSignature=signature;}
    }
    canvas.addEventListener('click',click);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerleave',leave);
    resize.observe(canvas);intersection.observe(canvas);frame=requestAnimationFrame(animate);
    return()=>{cancelAnimationFrame(frame);resize.disconnect();intersection.disconnect();canvas.removeEventListener('click',click);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerleave',leave);};
  },[country.iso,country.name,rows,events,view,reduced]);
  return <canvas ref={ref} className="country-canvas" role="img" aria-label={`${country.name}: ${view==='radial'?'geographic context and radial monthly observations':'monthly counts by calendar month and year'}. Exact counts are available in the adjacent readouts and monthly matrix.`}/>;
}

export function GeoLocator({ iso }) {
  const p=geoEqualEarth().fitExtent([[4,4],[176,88]],GEOGRAPHY),path=geoPath(p),shape=SHAPES.get(String(iso)),center=shape?p(geoCentroid(shape)):null;
  return <svg viewBox="0 0 180 92" role="img" aria-label="Selected country in world context"><path d={path(GEOGRAPHY)} fill="#182c24" stroke="#49604e" strokeWidth=".25"/>{shape&&<path d={path(shape)} fill="#d7c896"/>}{center&&<g><circle cx={center[0]} cy={center[1]} r="5" fill="none" stroke="#d7c896" strokeWidth=".5"/><path d={`M${center[0]-10},${center[1]}h20M${center[0]},${center[1]-10}v20`} fill="none" stroke="#d7c896" strokeWidth=".5"/></g>}</svg>;
}
