// WebGL2 renderer for the console stage. Three scenes share one low-resolution buffer that is then
// quantised with an ordered (Bayer) dither: FIELD (the world as a dot field), ATLAS (risk ridgelines
// for every country since 1975) and TRACE (contribution streams converging on the forecast).
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

// One texel per particle. pos = (x, y, age, lifetime) in stage clip space; vel = (vx, vy); meta (static) =
// (lane y, +1/-1 sign, seed, lane width; width 0 = parked). Particles ride their group's lane towards the
// core, are stirred by curl noise (wider lanes = more turbulence), spiral into the core and respawn.
const SIM_FS = `#version 300 es
precision highp float;
uniform sampler2D uPos,uVel,uMeta;
uniform float uTime,uDt,uAspect,uCoreR,uSpeed,uTurb; uniform vec2 uCore;
layout(location=0) out vec4 oPos; layout(location=1) out vec4 oVel;
const float SRC=-.56;
${SIMPLEX}
float h11(float n){ return fract(sin(n)*43758.5453); }
void main(){
  ivec2 t=ivec2(gl_FragCoord.xy);
  vec4 P=texelFetch(uPos,t,0), V=texelFetch(uVel,t,0), M=texelFetch(uMeta,t,0);
  if(M.w<=0.){ oPos=vec4(uCore,-1.,1.); oVel=vec4(0.); return; }
  vec2 p=P.xy, v=V.xy; float age=P.z, life=P.w, seed=M.z;
  float s=clamp((p.x-SRC)/(uCore.x-.14-SRC),0.,1.), e=s*s*(3.-2.*s);
  float laneY=mix(M.x,uCore.y,e);
  vec2 tgt=vec2(uSpeed*(.55+.9*seed),(laneY-p.y)*5.);
  vec3 cn=curlNoise(vec3(vec2(p.x*uAspect,p.y)*2.2,uTime*.07+seed*3.));
  tgt+=cn.xy*uTurb*(.02+M.w*.9)*(1.-.55*e);
  vec2 rel=vec2((p.x-uCore.x)*uAspect,p.y-uCore.y); float r=length(rel); vec2 dir=rel/(r+1e-4);
  float inside=smoothstep(uCoreR*2.6,uCoreR*.8,r);
  vec2 sw=(vec2(-dir.y,dir.x)*2.2-dir*.9)*uSpeed*vec2(1./uAspect,1.);
  tgt=mix(tgt,sw,inside);
  v=mix(v,tgt,1.-exp(-uDt*3.2));
  p+=v*uDt; age+=uDt;
  if(age>life||r<uCoreR*.22){
    vec2 uv=vec2(t)+.5;
    float h1=h11(dot(uv,vec2(12.9898,78.233))+uTime*1.7), h2=h11(h1*91.7+seed*13.), h3=h11(h2*57.3+3.1);
    p=vec2(SRC+(h1-.5)*.025,M.x+(h2-.5)*M.w*1.6); age=0.; life=3.6+h3*3.2; v=vec2(uSpeed*(.55+.9*seed),0.);
  }
  oPos=vec4(p,age,life); oVel=vec4(v,0.,1.);
}`;

const PARTICLE_VS = `#version 300 es
precision highp float;
uniform sampler2D uPos,uVel,uMeta;
uniform vec3 uCam; uniform float uSize,uTime,uPx,uFade,uFocus,uAspect;
out vec3 vCol;
void main(){
  int S=int(uSize+.5);
  ivec2 t=ivec2(gl_VertexID%S,gl_VertexID/S);
  vec4 P=texelFetch(uPos,t,0), V=texelFetch(uVel,t,0), M=texelFetch(uMeta,t,0);
  if(M.w<=0.||P.z<0.){ gl_Position=vec4(2.,2.,0.,1.); gl_PointSize=0.; vCol=vec3(0.); return; }
  gl_Position=vec4((P.xy-uCam.yz)*uCam.x,0.,1.);
  vec3 col=M.y>0. ? vec3(1.,.62,.14) : vec3(.14,.80,.92);
  float sp=length(V.xy*vec2(uAspect,1.));
  float b=.26+.95*smoothstep(.06,.45,sp);
  b*=smoothstep(0.,.5,P.z)*smoothstep(P.w,P.w-.9,P.z);
  b*=.65+.35*sin(P.x*16.-uTime*2.6+M.z*6.);
  b*=uFocus<-50. ? 1. : (abs(M.x-uFocus)<.001 ? 1.4 : .18);
  vCol=mix(col,vec3(1.),smoothstep(.25,.6,sp)*.45)*b*uFade;
  gl_PointSize=max(1.,uPx*sqrt(uCam.x));
}`;

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
export const TRACE_GEOM = { nodeX: -0.56, core: [0.46, 0] };
export const riskNorm = (risk, max) => (risk == null ? -1 : Math.sqrt(Math.min(1, Math.max(0, risk) / max)));
export const atlasHeight = (risk) => Math.sqrt(Math.min(1, Math.max(0, risk) / 0.3));

const MAXZ = 8, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const SRC_X = -0.56;

export function createEngine(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) return null;
  const floatOK = !!gl.getExtension("EXT_color_buffer_float");
  const field = program(gl, FIELD_VS, POINT_FS), atlas = program(gl, ATLAS_VS, POINT_FS), post = program(gl, POST_VS, POST_FS);
  const simP = floatOK ? program(gl, POST_VS, SIM_FS) : null, partP = floatOK ? program(gl, PARTICLE_VS, POINT_FS) : null;
  const vortexP = program(gl, POST_VS, VORTEX_FS);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const fbo = gl.createFramebuffer(), tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
  for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);

  // ---- trace simulation: ping-pong float textures, one texel per particle (CurlSwarm layout)
  const SIZE = canvas.clientWidth < 700 ? 128 : 256;
  const floatTex = (data) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, SIZE, SIZE, 0, gl.RGBA, gl.FLOAT, data);
    return t;
  };
  let sim = null;
  if (floatOK) {
    const pos = [floatTex(null), floatTex(null)], vel = [floatTex(null), floatTex(null)], fbos = [gl.createFramebuffer(), gl.createFramebuffer()];
    let complete = true;
    fbos.forEach((f, i) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pos[i], 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, vel[i], 0);
      complete = complete && gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    });
    if (complete) sim = { pos, vel, fbos, meta: floatTex(null), cur: 0, ready: false };
  }

  const buf = { field: gl.createBuffer(), atlas: gl.createBuffer() };
  const cam0 = () => ({ z: 1, x: 0, y: 0, tz: 1, tx: 0, ty: 0 });
  const st = {
    view: "field", fade: { field: 1, atlas: 0, trace: 0 }, W: 1, H: 1, tw: 1, th: 1, cell: 3, dpr: 1,
    nField: 0, rows: 0, Q: 0, yaw: 0.3, pitch: 0.25, tYaw: null, tPitch: null, morph: 0, tMorph: 0,
    sel: -1, hov: -1, selRow: -1, hovRow: -1, cursor: -1, emit: new Float32Array(32), risk: 0, focus: -99,
    cams: { field: cam0(), atlas: cam0(), trace: cam0() },
    live: true, drag: false, idle: 0, t: 0, last: 0, raf: 0, visible: true, onFrame: null, sim: !!sim,
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
  const coreR = () => 0.13 + 0.20 * st.risk;
  const unit = (n, t) => { gl.activeTexture(gl.TEXTURE0 + n); gl.bindTexture(gl.TEXTURE_2D, t); };

  function stepSim(dt) {
    if (!sim?.ready || !st.live) return;
    const nxt = 1 - sim.cur;
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.fbos[nxt]);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, SIZE, SIZE);
    gl.disable(gl.BLEND);
    gl.useProgram(simP.p); bindQuad(simP);
    unit(0, sim.pos[sim.cur]); unit(1, sim.vel[sim.cur]); unit(2, sim.meta);
    const u = simP.u;
    gl.uniform1i(u.uPos, 0); gl.uniform1i(u.uVel, 1); gl.uniform1i(u.uMeta, 2);
    gl.uniform1f(u.uTime, st.t); gl.uniform1f(u.uDt, Math.min(dt, 1 / 30)); gl.uniform1f(u.uAspect, aspect());
    gl.uniform1f(u.uCoreR, coreR()); gl.uniform1f(u.uSpeed, 0.2); gl.uniform1f(u.uTurb, 1);
    gl.uniform2f(u.uCore, TRACE_GEOM.core[0], TRACE_GEOM.core[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    sim.cur = nxt;
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

    if (st.fade.trace > 0.01) stepSim(dt);
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
    if (st.fade.trace > 0.01) {
      const cam = camOf("trace");
      gl.useProgram(vortexP.p); bindQuad(vortexP);
      const v = vortexP.u;
      gl.uniform2f(v.uTex, st.tw, st.th); gl.uniform2f(v.uCore, TRACE_GEOM.core[0], TRACE_GEOM.core[1]); gl.uniform3fv(v.uCam, cam);
      gl.uniform1f(v.uTime, st.t); gl.uniform1f(v.uAspect, aspect()); gl.uniform1f(v.uCoreR, coreR());
      gl.uniform1f(v.uRisk, st.risk); gl.uniform1f(v.uFade, st.fade.trace);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (sim?.ready) {
        gl.useProgram(partP.p);
        for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
        unit(0, sim.pos[sim.cur]); unit(1, sim.vel[sim.cur]); unit(2, sim.meta);
        const u = partP.u;
        gl.uniform1i(u.uPos, 0); gl.uniform1i(u.uVel, 1); gl.uniform1i(u.uMeta, 2);
        gl.uniform3fv(u.uCam, cam); gl.uniform1f(u.uSize, SIZE); gl.uniform1f(u.uTime, st.t); gl.uniform1f(u.uPx, px);
        gl.uniform1f(u.uFade, st.fade.trace); gl.uniform1f(u.uFocus, st.focus); gl.uniform1f(u.uAspect, aspect());
        gl.drawArrays(gl.POINTS, 0, SIZE * SIZE);
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
    setView(v) { st.view = v; },
    setLive(v) { st.live = v; },
    setPlane(v) { st.tMorph = v ? 1 : 0; },
    setField(data, emit) { upload(buf.field, data); st.nField = data.length / 6; st.emit.fill(0); st.emit.set(emit.slice(0, 32)); },
    /** groups: [{ y, k (0..1 strength), sign (+1 raises / -1 lowers) }]; particles are shared out by strength. */
    setTrace(groups, risk) {
      st.risk = risk;
      if (!sim) return;
      const N = SIZE * SIZE, meta = new Float32Array(N * 4), pos = new Float32Array(N * 4), vel = new Float32Array(N * 4);
      let o = 0;
      for (const g of groups) {
        if (g.k <= 0.003) continue;
        const n = Math.min(N - o, Math.round(N * (0.015 + 0.125 * g.k))), w = 0.006 + 0.09 * g.k;
        for (let i = 0; i < n; i++, o++) {
          const seed = Math.random(), life = 3.6 + Math.random() * 3.2, prog = Math.random();
          meta.set([g.y, g.sign, seed, w], o * 4);
          pos.set([SRC_X + prog * (TRACE_GEOM.core[0] - 0.14 - SRC_X), g.y * (1 - prog * prog) + (Math.random() - 0.5) * w * 1.6, prog * life, life], o * 4);
          vel.set([0.2 * (0.55 + 0.9 * seed), 0, 0, 1], o * 4);
        }
      }
      for (; o < N; o++) pos.set([0, 0, -1, 1], o * 4);
      const put = (t, d) => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SIZE, SIZE, gl.RGBA, gl.FLOAT, d); };
      put(sim.meta, meta); put(sim.pos[sim.cur], pos); put(sim.vel[sim.cur], vel);
      sim.ready = true;
    },
    setAtlas(data, rows, Q) { upload(buf.atlas, data); st.rows = rows; st.Q = Q; },
    select(idx, lon, lat) { st.sel = idx; if (lon != null) { st.tYaw = lon * RAD; st.tPitch = Math.max(-0.9, Math.min(0.9, lat * RAD * 0.85)); } },
    hover(idx) { st.hov = idx; },
    rows(sel, hov, cursor) { st.selRow = sel; st.hovRow = hov; st.cursor = cursor; },
    focus(y) { st.focus = y == null ? -99 : y; },
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
