// WebGL2 renderer for the console stage. Three scenes share one low-resolution buffer that is then
// quantised with an ordered (Bayer) dither: FIELD (the world as a dot field), ATLAS (risk ridgelines
// for every country since 1975) and TRACE (contribution streams converging on the forecast).
// Motion is decoration on fixed data positions: nothing here generates or alters a value.

const RAMP = `
vec3 ramp(float r){
  vec3 a=vec3(.04,.17,.17), b=vec3(.10,.72,.64), c=vec3(1.,.70,.16), d=vec3(1.,.22,.10);
  r=clamp(r,0.,1.);
  return r<.38 ? mix(a,b,r/.38) : r<.72 ? mix(b,c,(r-.38)/.34) : mix(c,d,(r-.72)/.28);
}`;

const FIELD_VS = `#version 300 es
precision highp float;
in vec2 aLL; in vec4 aD;
uniform mat3 uRot; uniform float uMorph,uTime,uAspect,uZoom,uSel,uHov,uPx,uFade; uniform vec4 uEmit[8];
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
  gl_Position=vec4(pos.x*uZoom/uAspect, pos.y*uZoom, 0., 1.);
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
  gl_PointSize=max(1., uPx*(aD.y>0. ? .9 : 1.+rk*1.3+sel*.8));
}`;

const TRACE_VS = `#version 300 es
precision highp float;
in vec4 aA; in vec4 aB;
uniform float uTime,uAspect,uPulse,uCoreR,uRisk,uFade,uPx,uFocus;
out vec3 vCol;
${RAMP}
void main(){
  vec2 pos; vec3 col; float b;
  vec2 core=vec2(.46,0.);
  if(aB.z<.5){
    float u=fract(aA.y+uTime*aA.w), v=1.-u;
    vec2 P0=vec2(-.56,aA.x), P1=vec2(-.12,aA.x), P2=vec2(.08,0.), P3=core;
    pos=v*v*v*P0+3.*v*v*u*P1+3.*v*u*u*P2+u*u*u*P3;
    float w=aB.x*mix(1.,.18,smoothstep(0.,1.,u));
    pos.y+=aA.z*w+.004*sin(uTime*2.+aB.w*40.+u*14.);
    col=aB.y>0. ? vec3(1.,.60,.14) : vec3(.16,.78,.88);
    b=.30+.85*pow(.5+.5*sin((u*3.-uTime*.9)*6.2832+aB.w*1.3),6.);
    b*=smoothstep(0.,.04,u);
    float dim=uFocus<-50. ? 1. : (abs(aA.x-uFocus)<.001 ? 1.35 : .22);
    b*=dim;
  } else {
    float r=uCoreR*(.12+.88*aA.x)*(1.+.10*sin(uTime*uPulse-aA.x*5.));
    float a=aA.y*6.2832+uTime*aA.w/(.25+aA.x);
    pos=core+r*vec2(cos(a)/uAspect, sin(a));
    col=mix(ramp(uRisk), vec3(1.), .25*(1.-aA.x));
    b=(.45+.55*(1.-aA.x))*(.75+.25*sin(uTime*uPulse));
  }
  vCol=col*b*uFade;
  gl_Position=vec4(pos,0.,1.);
  gl_PointSize=max(1.,uPx);
}`;

const ATLAS_VS = `#version 300 es
precision highp float;
in vec4 aP;
uniform float uTime,uFade,uMode,uLift,uCursor;
out vec3 vCol;
${RAMP}
void main(){
  float t=aP.x, v=aP.y, row=aP.z, side=aP.w;
  float yb=mix(.38,-.78,row);
  float x=mix(-.95,.52,t)+(1.-row)*.22;
  gl_Position=vec4(x, yb+side*v*.30+uLift, 0., 1.);
  if(uMode<.5){ vCol=vec3(0.); return; }
  float scan=exp(-pow((t-fract(uTime*.045))/.010,2.));
  float cur=uCursor<0. ? 0. : exp(-pow((t-uCursor)/.004,2.));
  vec3 col=ramp(v*1.15)*(.16+1.1*v)*(.85+.15*sin(uTime*1.3-row*16.));
  col+=ramp(max(v,.3))*scan*(.25+.9*v)+vec3(.5)*cur*(.2+v);
  if(uMode>1.5) col=mix(vec3(1.), ramp(v*1.15), .25)*(1.+.25*sin(uTime*5.));
  vCol=col*uFade;
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

export function createEngine(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) return null;
  const field = program(gl, FIELD_VS, POINT_FS), trace = program(gl, TRACE_VS, POINT_FS);
  const atlas = program(gl, ATLAS_VS, POINT_FS), post = program(gl, POST_VS, POST_FS);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const fbo = gl.createFramebuffer(), tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
  for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);

  const buf = { field: gl.createBuffer(), trace: gl.createBuffer(), atlas: gl.createBuffer() };
  const st = {
    view: "field", fade: { field: 1, atlas: 0, trace: 0 }, W: 1, H: 1, tw: 1, th: 1, cell: 3, dpr: 1,
    nField: 0, nTrace: 0, rows: 0, Q: 0, yaw: 0.3, pitch: 0.25, tYaw: null, tPitch: null, morph: 0, tMorph: 0,
    sel: -1, hov: -1, selRow: -1, hovRow: -1, cursor: -1, emit: new Float32Array(32), risk: 0, focus: -99,
    live: true, drag: false, idle: 0, t: 0, last: 0, raf: 0, visible: true, onFrame: null,
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
  /** lon/lat in degrees -> stage position in CSS-relative units [0..1], plus visibility. */
  function project(lon, lat) {
    const lo = lon * RAD, la = lat * RAD, m = rot(), z = zoom(), a = aspect();
    const s = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
    const g = [m[0] * s[0] + m[3] * s[1] + m[6] * s[2], m[1] * s[0] + m[4] * s[1] + m[7] * s[2], m[2] * s[0] + m[5] * s[1] + m[8] * s[2]];
    const p = [(lo / Math.PI) * 1.6, (la / Math.PI) * 1.6];
    const x = g[0] + (p[0] - g[0]) * st.morph, y = g[1] + (p[1] - g[1]) * st.morph;
    return { x: (x * z / a) * 0.5 + 0.5, y: 0.5 - y * z * 0.5, front: st.morph > 0.5 || g[2] > 0.12 };
  }
  /** stage position [0..1] -> lon/lat in degrees, or null when off the globe / mid-morph. */
  function unproject(fx, fy) {
    const z = zoom(), a = aspect(), x = ((fx * 2 - 1) * a) / z, y = (1 - fy * 2) / z;
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
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [name, size, offset] of layout) {
      const loc = gl.getAttribLocation(prog.p, name);
      if (loc < 0) continue;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
    }
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
    if (st.tYaw != null) {
      let d = st.tYaw - st.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      st.yaw += d * Math.min(1, dt * 3.2); st.pitch += (st.tPitch - st.pitch) * Math.min(1, dt * 3.2);
      if (Math.abs(d) < 0.003) st.tYaw = null;
    } else if (!st.drag && st.live && st.view === "field") {
      st.idle += dt; if (st.idle > 6) st.yaw += dt * 0.035;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, st.tw, st.th);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    const px = st.cell >= 3 ? 1.0 : 1.2;

    if (st.fade.field > 0.01 && st.nField) {
      gl.useProgram(field.p);
      attribs(field, buf.field, [["aLL", 2, 0], ["aD", 4, 2]], 6);
      const u = field.u;
      gl.uniformMatrix3fv(u.uRot, false, rot());
      gl.uniform1f(u.uMorph, st.morph); gl.uniform1f(u.uTime, st.t); gl.uniform1f(u.uAspect, aspect());
      gl.uniform1f(u.uZoom, zoom()); gl.uniform1f(u.uSel, st.sel); gl.uniform1f(u.uHov, st.hov);
      gl.uniform1f(u.uPx, px * 1.25); gl.uniform1f(u.uFade, st.fade.field); gl.uniform4fv(u.uEmit, st.emit);
      gl.drawArrays(gl.POINTS, 0, st.nField);
    }
    if (st.fade.trace > 0.01 && st.nTrace) {
      gl.useProgram(trace.p);
      attribs(trace, buf.trace, [["aA", 4, 0], ["aB", 4, 4]], 8);
      const u = trace.u;
      gl.uniform1f(u.uTime, st.t); gl.uniform1f(u.uAspect, aspect()); gl.uniform1f(u.uFade, st.fade.trace);
      gl.uniform1f(u.uPulse, 1.4 + 6 * st.risk); gl.uniform1f(u.uCoreR, 0.10 + 0.20 * st.risk);
      gl.uniform1f(u.uRisk, st.risk); gl.uniform1f(u.uPx, px); gl.uniform1f(u.uFocus, st.focus);
      gl.drawArrays(gl.POINTS, 0, st.nTrace);
    }
    if (st.fade.atlas > 0.01 && st.rows) {
      gl.useProgram(atlas.p);
      attribs(atlas, buf.atlas, [["aP", 4, 0]], 4);
      const u = atlas.u, per = st.Q * 3, lift = 1.5 / st.th;
      gl.uniform1f(u.uTime, st.t); gl.uniform1f(u.uFade, st.fade.atlas); gl.uniform1f(u.uCursor, st.cursor);
      for (let r = 0; r < st.rows; r++) {
        gl.uniform1f(u.uLift, 0);
        gl.disable(gl.BLEND); gl.uniform1f(u.uMode, 0); gl.drawArrays(gl.TRIANGLE_STRIP, r * per, st.Q * 2);
        gl.enable(gl.BLEND); gl.uniform1f(u.uMode, r === st.hovRow ? 2 : 1); gl.drawArrays(gl.LINE_STRIP, r * per + st.Q * 2, st.Q);
      }
      if (st.selRow >= 0) {
        gl.uniform1f(u.uMode, 2);
        for (const k of [0, 1, 2]) { gl.uniform1f(u.uLift, k * lift); gl.drawArrays(gl.LINE_STRIP, st.selRow * per + st.Q * 2, st.Q); }
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, st.W, st.H);
    gl.disable(gl.BLEND);
    gl.useProgram(post.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    const loc = gl.getAttribLocation(post.p, "aQ");
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
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
    state: st, project, unproject,
    setView(v) { st.view = v; },
    setLive(v) { st.live = v; },
    setPlane(v) { st.tMorph = v ? 1 : 0; },
    setField(data, emit) { upload(buf.field, data); st.nField = data.length / 6; st.emit.fill(0); st.emit.set(emit.slice(0, 32)); },
    setTrace(data, risk) { upload(buf.trace, data); st.nTrace = data.length / 8; st.risk = risk; },
    setAtlas(data, rows, Q) { upload(buf.atlas, data); st.rows = rows; st.Q = Q; },
    select(idx, lon, lat) { st.sel = idx; if (lon != null) { st.tYaw = lon * RAD; st.tPitch = Math.max(-0.9, Math.min(0.9, lat * RAD * 0.85)); } },
    hover(idx) { st.hov = idx; },
    rows(sel, hov, cursor) { st.selRow = sel; st.hovRow = hov; st.cursor = cursor; },
    focus(y) { st.focus = y == null ? -99 : y; },
    drag(dx, dy) { st.tYaw = null; st.idle = 0; st.yaw -= dx * 2.2 / zoom(); st.pitch = Math.max(-1.3, Math.min(1.3, st.pitch + dy * 2.2 / zoom())); },
    dragging(v) { st.drag = v; st.idle = 0; },
    destroy() { cancelAnimationFrame(st.raf); io.disconnect(); document.removeEventListener("visibilitychange", vis); },
  };
}
