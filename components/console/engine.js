// WebGL2 renderer for the console stage. Three scenes share one low-resolution buffer that is then
// quantised with an ordered (Bayer) dither: FIELD (the world as a dot field), ATLAS (risk ridgelines
// for every country since 1975) and TRACE (a waterfall of swarm particles from the base rate to the forecast).
// Motion is decoration on fixed data positions: nothing here generates or alters a value.
//
// Third-party code (MIT): the simplex noise and curl-noise field, and the ping-pong GPGPU layout of the
// trace simulation, follow CurlSwarm.tsx from PSCactux/webgl-shader-lab; the vortex and ring halo in the
// trace core follow Portal.tsx from the same repository; the ordered 8x8 Bayer threshold follows
// zavalit/bayer-dithering-webgl-demo. snoise() is by Ashima Arts / Stefan Gustavson (MIT). See docs/console.md.

const RAMP = `
vec3 ramp(float r){
  vec3 a=vec3(.04,.17,.17), b=vec3(.10,.72,.64), c=vec3(1.,.70,.16), d=vec3(1.,.22,.10);
  r=clamp(r,0.,1.);
  return r<.38 ? mix(a,b,r/.38) : r<.72 ? mix(b,c,(r-.38)/.34) : mix(c,d,(r-.72)/.28);
}`;

const FIELD_VS = `#version 300 es
precision highp float;
in vec2 aLL; in vec4 aD;
uniform mat3 uRot; uniform vec3 uCam; uniform float uMorph,uTime,uAspect,uZoom,uSel,uHov,uPx,uFade; uniform vec4 uEmit[8];
out vec3 vCol;
${RAMP}
void main(){
  float lon=aLL.x, lat=aLL.y, risk=aD.x, rk=max(risk,0.);
  vec3 s=vec3(cos(lat)*sin(lon), sin(lat), cos(lat)*cos(lon));
  float u=aD.y>0. ? fract(aD.y+uTime*(.05+.22*rk)) : 0.;
  float lift=u*rk*rk*.5;
  vec3 g=uRot*s*(1.+lift);
  vec3 p=vec3(lon/3.14159265*1.6, lat/3.14159265*1.6+lift*.55, 1.);
  vec3 pos=mix(g,p,uMorph);
  float front=mix(smoothstep(-.12,.2,g.z), 1., uMorph);
  gl_Position=vec4((vec2(pos.x*uZoom/uAspect, pos.y*uZoom)-uCam.yz)*uCam.x, 0., 1.);
  vec3 col; float b;
  if(risk<-1.5){ col=vec3(.05,.16,.16); b=.5; }
  else if(risk<0.){ col=vec3(.10,.14,.15); b=.55; }
  else { col=ramp(rk); b=.5+.9*rk; }
  float pulse=0.;
  for(int i=0;i<8;i++){
    float w=uEmit[i].w; if(w<=0.) continue;
    float d=acos(clamp(dot(s,uEmit[i].xyz),-1.,1.));
    float ph=fract(uTime*(.10+.32*w)+float(i)*.37);
    pulse+=exp(-pow((d-ph*.55)/.022,2.))*(1.-ph)*w;
  }
  b*=.82+.18*sin(uTime*1.7+aD.z*40.);
  b+=pulse*1.3;
  if(aD.y>0.) b*=(1.-u)*.75;
  float sel=step(abs(aD.w-uSel),.5), hov=step(abs(aD.w-uHov),.5);
  col=mix(col, vec3(1.), sel*(.45+.3*sin(uTime*6.))+hov*.4*(1.-sel));
  b*=1.+sel*.9+hov*.5;
  vCol=col*b*mix(.07,1.,front)*uFade;
  gl_PointSize=max(1., uPx*(aD.y>0. ? .9 : 1.+rk*1.3+sel*.8)*sqrt(uCam.x));
}`;

const SIMPLEX = `
vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x,289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159-0.85373472095314*r; }
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+2.0*C.xxx; vec3 x3=x0-1.0+3.0*C.xxx;
  i=mod(i,289.0);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=1.0/7.0; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
vec3 potential(vec3 p){ return vec3(snoise(p),snoise(p+vec3(31.4,17.2,-9.7)),snoise(p+vec3(-23.1,41.9,7.3))); }
vec3 curlNoise(vec3 p){
  const float e=0.1; vec3 dx=vec3(e,0.,0.), dy=vec3(0.,e,0.), dz=vec3(0.,0.,e);
  vec3 px0=potential(p-dx), px1=potential(p+dx), py0=potential(p-dy), py1=potential(p+dy), pz0=potential(p-dz), pz1=potential(p+dz);
  return vec3((py1.z-py0.z)-(pz1.y-pz0.y),(pz1.x-pz0.x)-(px1.z-px0.z),(px1.y-px0.y)-(py1.x-py0.x))/(2.0*e);
}`;

// The trace is a waterfall made of a swarm. 65k particles live in a GPGPU ping-pong simulation (the layout and the
// curl-noise advection follow CurlSwarm.tsx). Each particle is assigned to one column (base rate, seven variable
// groups, ensemble step, forecast core) in proportion to that column's weight and is held inside the column's box by a
// soft spring. Inside an amber box the swarm streams upward, inside a cyan one downward, so the box height IS the
// step's push on the log-odds. Change the country and the springs drag the whole swarm to the new boxes.
// Motion is decoration on positions that come from data; nothing here invents a value.
const SIM_FS = `#version 300 es
precision highp float;
uniform sampler2D uState,uRand;
uniform float uSim,uDt,uTime,uAspect,uRisk,uCum[11],uXc[10],uHw[10],uLo[10],uHi[10],uDir[10]; uniform vec3 uCore;
out vec4 o;
${SIMPLEX}
float hsh(vec2 v){ return fract(sin(dot(v,vec2(12.9898,78.233)))*43758.5453); }
void main(){
  vec2 uv=gl_FragCoord.xy/uSim;
  vec4 s=texture(uState,uv), r=texture(uRand,uv);
  int c=9; for(int k=0;k<10;k++){ if(r.x<uCum[k+1]){ c=k; break; } }
  vec2 p=s.xy; float along=0.;
  vec3 q=vec3(p.x*uAspect*2.6,p.y*2.6,uTime*.13+r.y*4.);
  vec3 cn=curlNoise(q);
  vec2 vel=vec2(cn.x/uAspect,cn.y)*(c==0?.05:.032);
  if(c==9){
    vec2 d=vec2((p.x-uCore.x)*uAspect,p.y-uCore.y);
    float rr=length(d), a=atan(d.y,d.x), R=uCore.z;
    float tr=R*(.16+.84*r.z)*(1.+.14*sin(a*3.+uTime*.7+r.w*6.));
    rr+=(tr-rr)*min(1.,3.*uDt);
    a+=uDt*(.3+1.7*uRisk)*(1.5-r.z)*(r.w<.78?1.:-.4);
    p=vec2(uCore.x+cos(a)*rr/uAspect+vel.x*uDt, uCore.y+sin(a)*rr+vel.y*uDt);
    along=fract(a/6.2832);
  } else {
    float xc=uXc[c], hw=uHw[c], lo=uLo[c], hi=uHi[c], dir=uDir[c];
    vel.y+=dir*(.05+.16*r.w);
    vel.x-=(p.x-clamp(p.x,xc-hw,xc+hw))*7.;
    vel.y-=(p.y-clamp(p.y,lo,hi))*7.;
    p+=vel*uDt;
    bool inx=abs(p.x-xc)<hw*1.6;
    if(dir>0. && p.y>hi && p.y<hi+.05 && inx){ p.y=lo; p.x=xc+(hsh(r.zw+uTime)-.5)*2.*hw; }
    if(dir<0. && p.y<lo && p.y>lo-.05 && inx){ p.y=hi; p.x=xc+(hsh(r.wz+uTime)-.5)*2.*hw; }
    along=clamp((p.y-lo)/max(hi-lo,1e-3),0.,1.);
  }
  o=vec4(p,along,float(c));
}`;

const TRACE_VS = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uState,uRand;
uniform vec3 uCam,uCore; uniform float uSim,uTime,uAspect,uFade,uFocus,uRisk,uSg[10];
out vec3 vCol;
${RAMP}
void main(){
  int n=int(uSim), id=gl_VertexID>>1; float tail=float(gl_VertexID&1);
  ivec2 ij=ivec2(id%n, id/n);
  vec4 s=texelFetch(uState,ij,0), r=texelFetch(uRand,ij,0);
  int c=int(s.w+.5);
  float sg=uSg[c], along=s.z, len=.012+.05*r.w;
  vec2 p=s.xy, off=vec2(0.);
  if(c==9){
    vec2 d=vec2((p.x-uCore.x)*uAspect,p.y-uCore.y); float l=max(length(d),1e-3);
    off=vec2(d.y/l/uAspect,-d.x/l)*len*1.6;
  } else if(sg!=0.) off=vec2(0.,-sg*len);
  else off=vec2(len*.5/uAspect,0.);
  p+=off*tail;
  gl_Position=vec4((p-uCam.yz)*uCam.x,0.,1.);
  vec3 col=c==9 ? ramp(.3+.7*uRisk) : c==0 ? vec3(.75,.95,.92) : sg>0. ? vec3(1.,.62,.14) : sg<0. ? vec3(.14,.80,.92) : vec3(.45,.78,.72);
  float wave=.5+.5*sin(6.2832*(along*sg*1.4-uTime*.45)+r.z*6.);
  float b=c==9 ? .12+.2*pow(.5+.5*sin(6.2832*(along-uTime*.12)+r.z*3.),2.) : .03+.2*pow(wave,4.);
  b*=.75+.5*r.y;
  b*=uFocus<-.5 ? 1. : (float(c)==uFocus+1. ? 1.9 : .22);
  b*=1.-.85*tail;
  vCol=mix(col,vec3(1.),.3*b)*b*uFade;
}`;

const LINE_VS = `#version 300 es
precision highp float;
in vec2 aP; in vec3 aC; uniform vec3 uCam; uniform float uFade,uTime;
out vec3 vCol;
void main(){ gl_Position=vec4((aP-uCam.yz)*uCam.x,0.,1.); vCol=aC*uFade*(.9+.1*sin(uTime*2.+aP.x*9.)); }`;

// Core: the vortex disc and ring halo of Portal.tsx, driven by the final probability (size, spin, colour).
const VORTEX_FS = `#version 300 es
precision highp float;
uniform vec2 uTex,uCore; uniform vec3 uCam; uniform float uTime,uAspect,uCoreR,uRisk,uFade;
out vec4 o;
${RAMP}
void main(){
  vec2 clip=gl_FragCoord.xy/uTex*2.-1.;
  vec2 c0=clip/uCam.x+uCam.yz;
  vec2 p=vec2((c0.x-uCore.x)*uAspect,c0.y-uCore.y)/uCoreR;
  float r=length(p), a=atan(p.y,p.x);
  float arms=sin(a*4.+1./max(r,.06)*2.2-uTime*(.8+2.4*uRisk));
  float spiral=smoothstep(.1,.9,arms);
  vec3 A=ramp(.28+.72*uRisk), B=ramp(.06);
  vec3 col=mix(B*.7,A*1.5,spiral*(1.-r*.75))*step(r,1.);
  col*=smoothstep(1.02,.15,r)*1.3;
  col+=A*smoothstep(.45,0.,r)*.8;
  float d=(r-1.04)/.06; col+=A*exp(-d*d)*(.8+.15*sin(uTime*3.));
  o=vec4(col*uFade*.9,1.);
}`;

const ATLAS_VS = `#version 300 es
precision highp float;
in vec4 aP;
uniform vec3 uCam; uniform float uTime,uFade,uMode,uLift,uCursor,uDim;
out vec3 vCol;
${RAMP}
void main(){
  float t=aP.x, v=aP.y, row=aP.z, side=aP.w;
  float yb=mix(.38,-.78,row);
  float x=mix(-.95,.52,t)+(1.-row)*.22;
  gl_Position=vec4((vec2(x, yb+side*v*.30+uLift)-uCam.yz)*uCam.x, 0., 1.);
  if(uMode<.5){ vCol=vec3(0.); return; }
  if(uMode>2.5){ vCol=ramp(v*1.15)*(.05+.22*side)*uFade; return; }
  float scan=exp(-pow((t-fract(uTime*.045))/.010,2.));
  float cur=uCursor<0. ? 0. : exp(-pow((t-uCursor)/.004,2.));
  vec3 col=ramp(v*1.15)*(.16+1.1*v)*(.85+.15*sin(uTime*1.3-row*16.));
  col+=ramp(max(v,.3))*scan*(.25+.9*v)+vec3(.5)*cur*(.2+v);
  if(uMode>1.5) col=mix(vec3(1.), ramp(v*1.15), .25)*(1.+.25*sin(uTime*5.));
  vCol=col*uFade*(uMode>1.5 ? 1. : mix(1.,.42,uDim));
}`;

const POINT_FS = `#version 300 es
precision mediump float; in vec3 vCol; out vec4 o; void main(){ o=vec4(vCol,1.); }`;

const POST_VS = `#version 300 es
in vec2 aQ; void main(){ gl_Position=vec4(aQ,0.,1.); }`;

const POST_FS = `#version 300 es
precision highp float;
uniform sampler2D uScene; uniform vec2 uRes, uTex; uniform float uCell,uTime,uLive;
out vec4 o;
float bayer2(vec2 a){ a=floor(a); return fract(a.x/2.+a.y*a.y*.75); }
#define bayer4(a) (bayer2(.5*(a))*.25+bayer2(a))
#define bayer8(a) (bayer4(.5*(a))*.25+bayer2(a))
float hash(vec3 p){ return fract(sin(dot(p,vec3(1.,57.,113.)))*43758.5453); }
float vnoise(vec3 p){
  vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
void main(){
  vec2 cell=floor(gl_FragCoord.xy/uCell);
  vec2 px=1./uTex;
  vec2 uv=(cell+.5)*px;
  vec3 c=texture(uScene,uv).rgb;
  vec3 halo=texture(uScene,uv+vec2(2.,0.)*px).rgb+texture(uScene,uv-vec2(2.,0.)*px).rgb
           +texture(uScene,uv+vec2(0.,2.)*px).rgb+texture(uScene,uv-vec2(0.,2.)*px).rgb;
  c+=halo*.10;
  vec2 q=cell*uCell/uRes.y;
  float n=vnoise(vec3(q*2.6, uTime*.06))*.6+vnoise(vec3(q*6.5+7., uTime*.09))*.4;
  float sweep=exp(-pow((q.y-fract(uTime*.035)*1.2+.1)/.05,2.));
  c+=vec3(.03,.15,.14)*(smoothstep(.52,.95,n)*.55+sweep*.10)*uLive;
  float l=max(c.r,max(c.g,c.b));
  float ql=floor(min(l,1.)*4.+bayer8(cell))/4.;
  vec3 col=l>0. ? c/l*ql : vec3(0.);
  vec2 f=fract(gl_FragCoord.xy/uCell);
  col*=uCell>=3. ? step(f.x,.82)*step(f.y,.82)*1.12 : 1.;
  o=vec4(col+vec3(.012,.018,.018),1.);
}`;

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(s)} (lost=${gl.isContextLost()}) :: ${src.slice(0, 60)}`);
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(p)} (lost=${gl.isContextLost()})`);
  const u = {};
  for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace("[0]", "");
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

const RAD = Math.PI / 180;
export const ATLAS_GEOM = { yb: (row) => 0.38 + (-0.78 - 0.38) * row, x: (t, row) => -0.95 + (0.52 + 0.95) * t + (1 - row) * 0.22, amp: 0.30 };
export const TRACE_GEOM = { x0: -0.72, xa: -0.58, xb: 0.4, x1: 0.62, yTop: 0.5, yBot: -0.5, labelY: -0.76 };
/** centre x of step column i (0..7) and its half width, in clip units */
export const traceCol = (i) => { const cw = (TRACE_GEOM.xb - TRACE_GEOM.xa) / 8; return { x: TRACE_GEOM.xa + (i + 0.5) * cw, hw: cw * 0.3 }; };
export const riskNorm = (risk, max) => (risk == null ? -1 : Math.sqrt(Math.min(1, Math.max(0, risk) / max)));
export const atlasHeight = (risk) => Math.sqrt(Math.min(1, Math.max(0, risk) / 0.3));

const MAXZ = 8, clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createEngine(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) return null;
  const field = program(gl, FIELD_VS, POINT_FS), atlas = program(gl, ATLAS_VS, POINT_FS), post = program(gl, POST_VS, POST_FS);
  let sim = null;
  const vortexP = program(gl, POST_VS, VORTEX_FS);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const fbo = gl.createFramebuffer(), tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
  for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);

  const buf = { field: gl.createBuffer(), atlas: gl.createBuffer(), lines: gl.createBuffer() };
  const cam0 = () => ({ z: 1, x: 0, y: 0, tz: 1, tx: 0, ty: 0 });
  const st = {
    view: "field", fade: { field: 1, atlas: 0, trace: 0 }, W: 1, H: 1, tw: 1, th: 1, cell: 3, dpr: 1,
    nField: 0, rows: 0, Q: 0, yaw: 0.3, pitch: 0.25, tYaw: null, tPitch: null, morph: 0, tMorph: 0,
    sel: -1, hov: -1, selRow: -1, hovRow: -1, cursor: -1, emit: new Float32Array(32), risk: 0, focus: -99,
    cams: { field: cam0(), atlas: cam0(), trace: cam0() },
    live: true, drag: false, idle: 0, t: 0, last: 0, raf: 0, visible: true, onFrame: null, cas: null, focusIdx: -1,
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect();
    const W = Math.max(2, Math.round(r.width * dpr)), H = Math.max(2, Math.round(r.height * dpr));
    if (W === st.W && H === st.H) return;
    Object.assign(st, { W, H, dpr, cell: dpr >= 1.5 ? 3 : 2 });
    canvas.width = W; canvas.height = H;
    st.tw = Math.ceil(W / st.cell); st.th = Math.ceil(H / st.cell);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, st.tw, st.th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  }

  const aspect = () => st.W / st.H;
  const zoom = () => {
    const a = aspect(), globe = Math.min(0.86, 0.86 * a), plane = Math.min(0.94 * a / 1.6, 0.94 / 0.74);
    return globe + (plane - globe) * st.morph;
  };
  function rot() {
    const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
    return [cy, -sp * sy, cp * sy, 0, cp, sp, -sy, -sp * cy, cp * cy];
  }

  // ---- camera: clip' = (clip - pan) * zoom, shared by all three scenes. Pan only applies to the flat map.
  const camOf = (view) => {
    const c = st.cams[view], m = view === "field" ? st.morph : 1;
    return [c.z, c.x * m, c.y * m];
  };
  const clampCam = (c) => {
    const lim = Math.max(0, 1.08 - 1 / c.tz);
    c.tx = clamp(c.tx, -lim, lim); c.ty = clamp(c.ty, -lim, lim);
    if (c.tz <= 1.001) { c.tx = 0; c.ty = 0; }
  };
  /** clip position of the current view (before camera) -> stage fractions [0..1] */
  function toStage(cx, cy) {
    const [z, px, py] = camOf(st.view);
    return { x: ((cx - px) * z) * 0.5 + 0.5, y: 0.5 - ((cy - py) * z) * 0.5 };
  }
  /** stage fractions -> clip position of the current view (before camera) */
  function fromStage(fx, fy) {
    const [z, px, py] = camOf(st.view);
    return [(fx * 2 - 1) / z + px, (1 - fy * 2) / z + py];
  }
  /** lon/lat in degrees -> stage position in CSS-relative units [0..1], plus visibility. */
  function project(lon, lat) {
    const lo = lon * RAD, la = lat * RAD, m = rot(), z = zoom(), a = aspect();
    const s = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
    const g = [m[0] * s[0] + m[3] * s[1] + m[6] * s[2], m[1] * s[0] + m[4] * s[1] + m[7] * s[2], m[2] * s[0] + m[5] * s[1] + m[8] * s[2]];
    const p = [(lo / Math.PI) * 1.6, (la / Math.PI) * 1.6];
    const x = g[0] + (p[0] - g[0]) * st.morph, y = g[1] + (p[1] - g[1]) * st.morph;
    const [cz, px, py] = camOf("field");
    return { x: ((x * z / a - px) * cz) * 0.5 + 0.5, y: 0.5 - ((y * z - py) * cz) * 0.5, front: st.morph > 0.5 || g[2] > 0.12 };
  }
  /** stage position [0..1] -> lon/lat in degrees, or null when off the globe / mid-morph. */
  function unproject(fx, fy) {
    const [cz, px, py] = camOf("field"), z = zoom(), a = aspect();
    const x = (((fx * 2 - 1) / cz + px) * a) / z, y = ((1 - fy * 2) / cz + py) / z;
    if (st.morph > 0.98) {
      const lon = (x / 1.6) * 180, lat = (y / 1.6) * 180;
      return Math.abs(lon) <= 180 && Math.abs(lat) <= 90 ? [lon, lat] : null;
    }
    if (st.morph > 0.02) return null;
    const d = x * x + y * y; if (d > 1) return null;
    const g = [x, y, Math.sqrt(1 - d)], m = rot();
    const s = [m[0] * g[0] + m[1] * g[1] + m[2] * g[2], m[3] * g[0] + m[4] * g[1] + m[5] * g[2], m[6] * g[0] + m[7] * g[1] + m[8] * g[2]];
    return [Math.atan2(s[0], s[2]) / RAD, Math.asin(Math.max(-1, Math.min(1, s[1]))) / RAD];
  }

  function attribs(prog, buffer, layout, stride) {
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [name, size, offset] of layout) {
      const loc = gl.getAttribLocation(prog.p, name);
      if (loc < 0) continue;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
    }
  }
  const bindQuad = (prog) => {
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    const loc = gl.getAttribLocation(prog.p, "aQ");
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  };
  const coreR = () => 0.1 + 0.1 * st.risk;
  const unit = (n, t) => { gl.activeTexture(gl.TEXTURE0 + n); gl.bindTexture(gl.TEXTURE_2D, t); };

  // ---- GPGPU swarm (ping-pong RGBA32F: x, y, position along the box, column)
  function makeSim() {
    if (!gl.getExtension("EXT_color_buffer_float")) return null;
    const n = canvas.clientWidth < 700 ? 128 : 256;
    const make = (data) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
      for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, n, n, 0, gl.RGBA, gl.FLOAT, data);
      return t;
    };
    const rnd = new Float32Array(n * n * 4), init = new Float32Array(n * n * 4);
    for (let i = 0; i < n * n; i++) {
      rnd.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      init.set([(Math.random() * 2 - 1) * 0.9, (Math.random() * 2 - 1) * 0.9, 0, 9], i * 4);
    }
    const tex2 = [make(init), make(init)], fbos = tex2.map((t) => {
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f;
    });
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) return null;
    return { n, tex: tex2, fbo: fbos, cur: 0, rand: make(rnd), step: program(gl, POST_VS, SIM_FS), draw: program(gl, TRACE_VS, POINT_FS),
             line: program(gl, LINE_VS, POINT_FS), nLines: 0 };
  }
  function stepSim(dt) {
    const c = st.cas, u = sim.step.u, nxt = 1 - sim.cur;
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.fbo[nxt]); gl.viewport(0, 0, sim.n, sim.n);
    gl.useProgram(sim.step.p); bindQuad(sim.step);
    unit(0, sim.tex[sim.cur]); unit(1, sim.rand);
    gl.uniform1i(u.uState, 0); gl.uniform1i(u.uRand, 1);
    gl.uniform1f(u.uSim, sim.n); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uTime, st.t); gl.uniform1f(u.uAspect, aspect()); gl.uniform1f(u.uRisk, st.risk);
    gl.uniform1fv(u.uCum, c.cum); gl.uniform1fv(u.uXc, c.xc); gl.uniform1fv(u.uHw, c.hw); gl.uniform1fv(u.uLo, c.lo); gl.uniform1fv(u.uHi, c.hi); gl.uniform1fv(u.uDir, c.dir);
    gl.uniform3f(u.uCore, c.x1, c.ys[8], coreR());
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    sim.cur = nxt;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function frame(now) {
    st.raf = requestAnimationFrame(frame);
    if (!st.visible) return;
    resize();
    const dt = Math.min(0.05, (now - st.last) / 1000 || 0); st.last = now;
    if (st.live) st.t += dt;
    for (const k of Object.keys(st.fade)) st.fade[k] += ((k === st.view ? 1 : 0) - st.fade[k]) * Math.min(1, dt * 7);
    st.morph += (st.tMorph - st.morph) * Math.min(1, dt * 4);
    if (Math.abs(st.tMorph - st.morph) < 0.002) st.morph = st.tMorph;
    for (const c of Object.values(st.cams)) {
      const k = Math.min(1, dt * 10);
      c.z += (c.tz - c.z) * k; c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k;
      if (Math.abs(c.tz - c.z) < 0.001) c.z = c.tz;
      if (Math.abs(c.tx - c.x) < 0.0005) c.x = c.tx;
      if (Math.abs(c.ty - c.y) < 0.0005) c.y = c.ty;
    }
    if (st.tYaw != null) {
      let d = st.tYaw - st.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      st.yaw += d * Math.min(1, dt * 3.2); st.pitch += (st.tPitch - st.pitch) * Math.min(1, dt * 3.2);
      if (Math.abs(d) < 0.003) st.tYaw = null;
    } else if (!st.drag && st.live && st.view === "field") {
      st.idle += dt; if (st.idle > 6) st.yaw += dt * 0.035;
    }

    if (sim && st.cas && st.fade.trace > 0.01) stepSim(dt);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, st.tw, st.th);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    const px = st.cell >= 3 ? 1.0 : 1.2;

    if (st.fade.field > 0.01 && st.nField) {
      gl.useProgram(field.p);
      attribs(field, buf.field, [["aLL", 2, 0], ["aD", 4, 2]], 6);
      const u = field.u;
      gl.uniformMatrix3fv(u.uRot, false, rot()); gl.uniform3fv(u.uCam, camOf("field"));
      gl.uniform1f(u.uMorph, st.morph); gl.uniform1f(u.uTime, st.t); gl.uniform1f(u.uAspect, aspect());
      gl.uniform1f(u.uZoom, zoom()); gl.uniform1f(u.uSel, st.sel); gl.uniform1f(u.uHov, st.hov);
      gl.uniform1f(u.uPx, px * 1.25); gl.uniform1f(u.uFade, st.fade.field); gl.uniform4fv(u.uEmit, st.emit);
      gl.drawArrays(gl.POINTS, 0, st.nField);
    }
    if (st.fade.trace > 0.01 && st.cas) {
      const cam = camOf("trace"), c = st.cas;
      gl.useProgram(vortexP.p); bindQuad(vortexP);
      const v = vortexP.u;
      gl.uniform2f(v.uTex, st.tw, st.th); gl.uniform2f(v.uCore, c.x1, c.ys[8]); gl.uniform3fv(v.uCam, cam);
      gl.uniform1f(v.uTime, st.t); gl.uniform1f(v.uAspect, aspect()); gl.uniform1f(v.uCoreR, coreR());
      gl.uniform1f(v.uRisk, st.risk); gl.uniform1f(v.uFade, st.fade.trace);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (sim) {
        gl.useProgram(sim.line.p);
        attribs(sim.line, buf.lines, [["aP", 2, 0], ["aC", 3, 2]], 5);
        gl.uniform3fv(sim.line.u.uCam, cam); gl.uniform1f(sim.line.u.uFade, st.fade.trace); gl.uniform1f(sim.line.u.uTime, st.t);
        gl.drawArrays(gl.LINES, 0, sim.nLines);
        gl.useProgram(sim.draw.p);
        for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
        const u = sim.draw.u;
        unit(0, sim.tex[sim.cur]); unit(1, sim.rand);
        gl.uniform1i(u.uState, 0); gl.uniform1i(u.uRand, 1);
        gl.uniform3fv(u.uCam, cam); gl.uniform1f(u.uSim, sim.n); gl.uniform1f(u.uTime, st.t); gl.uniform1f(u.uFade, st.fade.trace);
        gl.uniform1f(u.uFocus, st.focusIdx); gl.uniform1f(u.uRisk, st.risk); gl.uniform1fv(u.uSg, c.sg);
        gl.uniform3f(u.uCore, c.x1, c.ys[8], coreR()); gl.uniform1f(u.uAspect, aspect());
        gl.drawArrays(gl.LINES, 0, sim.n * sim.n * 2);
      }
    }
    if (st.fade.atlas > 0.01 && st.rows) {
      gl.useProgram(atlas.p);
      attribs(atlas, buf.atlas, [["aP", 4, 0]], 4);
      const u = atlas.u, per = st.Q * 3, lift = 1.5 / st.th;
      gl.uniform3fv(u.uCam, camOf("atlas"));
      gl.uniform1f(u.uTime, st.t); gl.uniform1f(u.uFade, st.fade.atlas); gl.uniform1f(u.uCursor, st.cursor);
      for (let r = 0; r < st.rows; r++) {
        gl.uniform1f(u.uLift, 0); gl.uniform1f(u.uDim, st.selRow >= 0 && r !== st.selRow ? 1 : 0);
        gl.disable(gl.BLEND); gl.uniform1f(u.uMode, 0); gl.drawArrays(gl.TRIANGLE_STRIP, r * per, st.Q * 2);
        gl.enable(gl.BLEND); gl.uniform1f(u.uMode, r === st.hovRow ? 2 : 1); gl.drawArrays(gl.LINE_STRIP, r * per + st.Q * 2, st.Q);
      }
      if (st.selRow >= 0) {
        gl.uniform1f(u.uDim, 0); gl.uniform1f(u.uLift, 0);
        gl.uniform1f(u.uMode, 3); gl.drawArrays(gl.TRIANGLE_STRIP, st.selRow * per, st.Q * 2);
        gl.uniform1f(u.uMode, 2);
        for (const k of [0, 1, 2]) { gl.uniform1f(u.uLift, k * lift); gl.drawArrays(gl.LINE_STRIP, st.selRow * per + st.Q * 2, st.Q); }
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, st.W, st.H);
    gl.disable(gl.BLEND);
    gl.useProgram(post.p); bindQuad(post);
    unit(0, tex);
    gl.uniform1i(post.u.uScene, 0); gl.uniform2f(post.u.uRes, st.W, st.H); gl.uniform2f(post.u.uTex, st.tw, st.th);
    gl.uniform1f(post.u.uCell, st.cell); gl.uniform1f(post.u.uTime, st.t); gl.uniform1f(post.u.uLive, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    st.onFrame?.();
  }

  const upload = (buffer, data) => { gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); };
  const io = new IntersectionObserver(([e]) => { st.visible = e.isIntersecting && !document.hidden; });
  io.observe(canvas);
  const vis = () => { st.visible = !document.hidden; };
  document.addEventListener("visibilitychange", vis);
  resize();
  st.raf = requestAnimationFrame(frame);

  return {
    state: st, project, unproject, toStage, fromStage,
    setView(v) { st.view = v; if (!st.viewSet) { st.viewSet = true; for (const k of Object.keys(st.fade)) st.fade[k] = k === v ? 1 : 0; } },
    setLive(v) { st.live = v; },
    setPlane(v) { st.tMorph = v ? 1 : 0; },
    setField(data, emit) { upload(buf.field, data); st.nField = data.length / 6; st.emit.fill(0); st.emit.set(emit.slice(0, 32)); },
    /** ys: clip y of the 9 levels (base rate, 7 groups, ensemble); sg: sign of each of the 8 steps; mag: |log-odds push| of each step. */
    setCascade({ ys, sg, mag, x0, x1 }, risk) {
      st.risk = risk;
      if (sim === null) sim = makeSim() || false;
      const xc = new Float32Array(10), hw = new Float32Array(10), lo = new Float32Array(10), hi = new Float32Array(10), dir = new Float32Array(10);
      const w = new Float32Array(10), sgn = new Float32Array(10);
      xc[0] = x0; hw[0] = 0.03; lo[0] = ys[0] - 0.007; hi[0] = ys[0] + 0.007; w[0] = 0.5;
      const lines = [];
      const seg = (x1_, y1_, x2_, y2_, col) => lines.push(x1_, y1_, ...col, x2_, y2_, ...col);
      const dim = [0.16, 0.24, 0.23];
      for (let i = 0; i < 8; i++) {
        const { x, hw: h } = traceCol(i), a = Math.min(ys[i], ys[i + 1]), b = Math.max(ys[i], ys[i + 1]), mid = (a + b) / 2, half = Math.max((b - a) / 2, 0.011);
        xc[i + 1] = x; hw[i + 1] = h; lo[i + 1] = mid - half; hi[i + 1] = mid + half;
        dir[i + 1] = sg[i]; sgn[i + 1] = sg[i]; w[i + 1] = 0.4 + Math.min(1.5, mag[i]) * 0.9;
        const col = sg[i] > 0 ? [0.5, 0.31, 0.07] : sg[i] < 0 ? [0.07, 0.4, 0.46] : dim;
        const L = x - h, R = x + h;
        seg(L, mid - half, R, mid - half, col); seg(R, mid - half, R, mid + half, col); seg(R, mid + half, L, mid + half, col); seg(L, mid + half, L, mid - half, col);
        const nx = i < 7 ? traceCol(i + 1).x - traceCol(i + 1).hw : x1 - 0.1;
        seg(R, ys[i + 1], nx, ys[i + 1], dim);
      }
      seg(x0 + 0.03, ys[0], traceCol(0).x - traceCol(0).hw, ys[0], dim);
      seg(x0 - 0.03, ys[0], x0 + 0.03, ys[0], [0.25, 0.4, 0.38]);
      xc[9] = x1; hw[9] = 0; lo[9] = hi[9] = ys[8]; w[9] = 2.2;
      const tot = w.reduce((s_, v) => s_ + v, 0), cum = new Float32Array(11);
      for (let i = 0; i < 10; i++) cum[i + 1] = cum[i] + w[i] / tot;
      cum[10] = 1.01;
      st.cas = { ys: new Float32Array(ys), sg: sgn, cum, xc, hw, lo, hi, dir, x1 };
      if (sim) { upload(buf.lines, new Float32Array(lines)); sim.nLines = lines.length / 5; }
    },
    setAtlas(data, rows, Q) { upload(buf.atlas, data); st.rows = rows; st.Q = Q; },
    select(idx, lon, lat) { st.sel = idx; if (lon != null) { st.tYaw = lon * RAD; st.tPitch = Math.max(-0.9, Math.min(0.9, lat * RAD * 0.85)); } },
    hover(idx) { st.hov = idx; },
    rows(sel, hov, cursor) { st.selRow = sel; st.hovRow = hov; st.cursor = cursor; },
    focus(i) { st.focusIdx = i == null ? -1 : i; },
    drag(dx, dy) { st.tYaw = null; st.idle = 0; st.yaw -= dx * 2.2 / (zoom() * st.cams.field.z); st.pitch = Math.max(-1.3, Math.min(1.3, st.pitch + dy * 2.2 / (zoom() * st.cams.field.z))); },
    dragging(v) { st.drag = v; st.idle = 0; },
    /** multiply the zoom of the current view by f, keeping the stage point (fx, fy) under the cursor */
    zoomAt(fx, fy, f) {
      const c = st.cams[st.view], cx = fx * 2 - 1, cy = 1 - fy * 2, z1 = clamp(c.tz * f, 1, MAXZ);
      if (st.view !== "field" || st.tMorph === 1) {
        const wx = cx / c.tz + c.tx, wy = cy / c.tz + c.ty;
        c.tx = wx - cx / z1; c.ty = wy - cy / z1;
      }
      c.tz = z1; clampCam(c);
    },
    /** pan by a pointer delta given as a fraction of the stage size */
    pan(dfx, dfy) {
      const c = st.cams[st.view];
      if (st.view === "field" && st.morph < 0.99) return;
      c.tx -= (dfx * 2) / c.z; c.ty += (dfy * 2) / c.z; clampCam(c); c.x = c.tx; c.y = c.ty;
    },
    resetCam() { const c = st.cams[st.view]; c.tz = 1; c.tx = 0; c.ty = 0; },
    zoomLevel() { return st.cams[st.view].tz; },
    destroy() { cancelAnimationFrame(st.raf); io.disconnect(); document.removeEventListener("visibilitychange", vis); },
  };
}
