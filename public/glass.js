/* One optical layer behind the HTML. Each pane samples the same scene so
   highlights and refracted features stay attached to the background on scroll. */
(() => {
  const canvas = document.getElementById('glass-scene');
  const hero = document.querySelector('.quote');
  const photo = hero.querySelector('.bullion');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const solid = matchMedia('(prefers-reduced-transparency: reduce), (forced-colors: active)');
  let frame = 0;
  let renderer;
  let pointer = [0, 0];
  let tilt = [0, 0];
  const surfaceSelector = '.horizon, .karat-options label';
  let activeSurface = null;
  let contact = [.5,.5], aim = [.5,.5];

  const vertex = `
    attribute vec2 point;
    uniform vec2 viewport;
    uniform vec4 box;
    varying vec2 pixel;
    void main() {
      pixel = box.xy + point * box.zw;
      vec2 ndc = pixel / viewport * 2.0 - 1.0;
      gl_Position = vec4(ndc.x, -ndc.y, 0., 1.);
    }`;
  const fragment = `
    precision highp float;
    varying vec2 pixel;
    uniform vec2 viewport, tilt, imageSize, contactPoint;
    uniform vec4 box, heroBox;
    uniform float radius, material;
    uniform sampler2D bullion;

    float glow(float distance, float width) {
      float t = distance / width;
      return 1.0 / (1.0 + t*t);
    }
    // A brushed-metal ribbon under the glass. Its narrow light strips give
    // the refracting rims a visible feature to bend.
    vec3 ground(vec2 p) {
      vec2 uv = p / viewport;
      float x = uv.x * 1.42;
      float arc = uv.y + x * .72 + .23 * sin(3.15*x - .85);
      vec3 c = mix(vec3(.045,.052,.070), vec3(.107,.107,.119), clamp(uv.x+.12,0.,1.));
      float warm = glow(arc - 1.33, .13);
      float core = glow(arc - 1.29, .017);
      float thin = glow(arc - 1.39, .008);
      float cool = glow(arc - .70, .058);
      c += vec3(.36,.215,.087)*warm + vec3(.47,.34,.18)*core + vec3(.35,.20,.077)*thin;
      c += vec3(.09,.132,.182)*cool;
      c += vec3(.115,.079,.045)*glow(arc-1.57,.037);
      c += vec3(.065,.062,.079)*glow(uv.y+.47*x-.18,.15);
      return c;
    }
    vec3 scene(vec2 p) {
      vec3 c = ground(p);
      vec2 local = p - heroBox.xy;
      if (heroBox.z <= 0. || local.x < 0. || local.y < 0. || local.x > heroBox.z || local.y > heroBox.w) return c;
      float w=heroBox.z * (heroBox.z < 540. ? .62 : .59);
      vec2 frame=vec2(w,heroBox.w);
      vec2 pt=local-vec2(heroBox.z-w,0.);
      float scale=max(frame.x/imageSize.x,frame.y/imageSize.y);
      vec2 uv=(pt+(imageSize*scale-frame)*vec2(.55,.025))/(imageSize*scale);
      vec3 metal=texture2D(bullion,clamp(uv,0.,1.)).rgb;
      c=mix(c*.7+vec3(.032,.035,.040),metal*vec3(.97,.97,1.01),smoothstep(-.08,.30,pt.x/w));
      return c;
    }
    float roundedDistance(vec2 local, vec2 halfSize, float r) {
      vec2 d=abs(local)-halfSize+r;
      return min(max(d.x,d.y),0.)+length(max(d,0.))-r;
    }
    vec3 lens(vec2 p, vec3 base) {
      bool compact=heroBox.z < 540.;
      float size=min(heroBox.w*.49,heroBox.z*(compact?.206:.192));
      vec2 center=heroBox.xy+heroBox.zw*vec2(compact?.85:.823,compact?.42:.46)+tilt*size*.075;
      vec2 delta=p-center;
      mat2 rot=mat2(.966,-.259,.259,.966);
      vec2 q=(rot*delta)/(size*vec2(1.23,.78));
      float r=length(q);
      if(r>=1.0) {
        float shadow=glow(r-1.,.07)*smoothstep(-.2,.8,q.y);
        return base*(1.-shadow*.52);
      }
      vec2 n=normalize(delta+.0001);
      float slope=pow(r,6.);
      float angle=asin(min(.993,slope));
      float bend=tan(angle-asin(sin(angle)/1.50));
      // The flatter center magnifies the hallmark. The curved bevel diverts
      // each colour by a different amount as the viewing angle steepens.
      vec2 sampleAt=center+delta*(.79-.055*r)-n*size*.42*bend+tilt*size*.028;
      vec2 dispersion=n*size*(.004+.042*pow(r,8.));
      vec3 color=vec3(scene(sampleAt+dispersion).r,scene(sampleAt).g,scene(sampleAt-dispersion).b);
      vec2 light=normalize(vec2(-.55,-.84)+tilt*.22);
      float direction=dot(normalize(q+.0001),light);
      float edge=pow(r,14.);
      float upper=pow(max(direction,0.),2.0);
      float lower=pow(max(-direction,0.),3.0);
      color=mix(color,vec3(.68,.82,.91),.055+.075*upper);
      color+=vec3(.98,.91,.72)*upper*(.20*slope+.67*edge);
      color+=vec3(.39,.66,.90)*lower*(.10*slope+.64*edge);
      color+=vec3(.79,.89,1.)*.50*glow(r-.976,.006)*(upper+.25);
      color+=vec3(1.,.65,.31)*.50*glow(r-.910,.009)*(lower+.12);
      color*=1.-.41*glow(r-.943,.013);
      return color;
    }
    void main() {
      if(material<.5){gl_FragColor=vec4(ground(pixel),1.);return;}
      vec2 halfSize=box.zw*.5, local=pixel-(box.xy+halfSize);
      float d=roundedDistance(local,halfSize,radius);
      if(d>0.)discard;
      vec2 corner=abs(local)-halfSize+radius;
      vec2 normal=sign(local)*normalize(max(corner,0.)+vec2(.00001));
      if(max(corner.x,corner.y)<0.) normal=corner.x>corner.y?vec2(sign(local.x),0.):vec2(0.,sign(local.y));
      float bevel=material>2.5?5.:10.;
      float rim=pow(1.-smoothstep(0.,bevel,-d),2.);
      vec2 pull=normal*rim*(material>2.5?8.:21.);
      if(material>3.5) {
        vec2 hit=box.xy+contactPoint*box.zw;
        vec2 shape=vec2(min(box.z*.68,box.w*1.32),box.w*.77);
        vec2 q=(pixel-hit)/max(shape,vec2(1.));
        float r=length(q);
        float dome=1.-smoothstep(.05,1.,r);
        vec2 ray=(pixel-hit)*(.25*dome)+pull*(1.+.6*dome);
        vec3 bent=vec3(scene(pixel-1.18*ray).r,scene(pixel-ray).g,scene(pixel-.82*ray).b);
        vec2 direction=normalize((contactPoint-.5)*1.8+vec2(-.28,-.45)+.0001);
        float glint=pow(max(dot(normal,direction),0.),2.)*rim;
        vec3 color=mix(bent,vec3(.12,.13,.16),.62);
        color+=dome*vec3(.14,.115,.085)+glint*vec3(.48,.43,.34);
        color+=vec3(.10,.15,.20)*glow(r-.91,.065)*(.35+.65*dome);
        gl_FragColor=vec4(color,1.);
        return;
      }
      vec3 c;
      if(rim>.002) {
        c=vec3(scene(pixel-pull*1.16).r,scene(pixel-pull).g,scene(pixel-pull*.80).b);
      } else { c=scene(pixel); }
      if(material<1.5) {
        c=mix(c,vec3(.073,.081,.101),.69);
      } else if(material<2.5) {
        c=lens(pixel,c);
      } else {
        c=mix(c,vec3(.18,.19,.20),.38);
      }
      float spec=dot(normal,normalize(vec2(-.48,-.87)+tilt*.13));
      c+=rim*(max(spec,0.)*vec3(.22,.23,.24)+max(-spec,0.)*vec3(.090,.105,.14));
      gl_FragColor=vec4(c,1.);
    }`;

  function init() {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
    if (!gl) return null;
    const program = gl.createProgram();
    const shaders = [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]].map(([kind, source]) => {
      const shader = gl.createShader(kind);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
      return shader;
    });
    gl.linkProgram(program);
    shaders.forEach(s => gl.deleteShader(s));
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,0,1,1,0,1,1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'point');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const uniform = Object.fromEntries(['box','radius','material','heroBox','tilt','imageSize','viewport','bullion','contactPoint'].map(k=>[k,gl.getUniformLocation(program,k)]));
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, photo);
    gl.uniform1i(uniform.bullion,0);
    gl.uniform2f(uniform.imageSize,photo.naturalWidth,photo.naturalHeight);
    const panes = [...document.querySelectorAll('.mast,.panel,.range-detail,.quote,.karat-options,.segments,.unit')];
    function draw(x,y,w,h,round,kind) {
      gl.uniform4f(uniform.box,x,y,w,h);
      gl.uniform1f(uniform.radius,Math.min(round,h/2,w/2));
      gl.uniform1f(uniform.material,kind);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    }
    return () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(devicePixelRatio || 1,1.4,Math.sqrt(1800000/(w*h)));
      const bw=Math.round(w*dpr), bh=Math.round(h*dpr);
      if (canvas.width!==bw || canvas.height!==bh) { canvas.width=bw;canvas.height=bh; }
      gl.viewport(0,0,bw,bh);
      gl.uniform2f(uniform.viewport,w,h);
      gl.uniform2fv(uniform.tilt,tilt);
      const rect = hero.getBoundingClientRect();
      gl.uniform4f(uniform.heroBox,rect.x,rect.y,rect.width,rect.height);
      draw(0,0,w,h,0,0);
      for (const pane of panes) {
        const b=pane.getBoundingClientRect();
        if (!b.width || b.bottom<0 || b.top>h) continue;
        const isControl=pane.matches('.karat-options,.segments,.unit');
        draw(b.x,b.y,b.width,b.height,parseFloat(getComputedStyle(pane).borderTopLeftRadius)||0,pane===hero?2:isControl?3:1);
      }
      if (activeSurface) {
        const b = activeSurface.getBoundingClientRect();
        const radius = parseFloat(getComputedStyle(activeSurface).borderTopLeftRadius) || 0;
        gl.uniform2fv(uniform.contactPoint,contact);
        if (b.width && b.height) draw(b.x,b.y,b.width,b.height,radius,4);
      }
    };
  }
  function paint() {
    frame=0;
    if (document.hidden || solid.matches) return;
    for(let i=0;i<2;i++) tilt[i]+=(pointer[i]-tilt[i])*.24;
    let settling = Math.abs(pointer[0]-tilt[0])+Math.abs(pointer[1]-tilt[1])>.012;
    if (activeSurface) {
      for(let i=0;i<2;i++) contact[i]+=(aim[i]-contact[i])*.43;
      activeSurface.style.setProperty('--glint-x',(contact[0]*100).toFixed(2)+'%');
      activeSurface.style.setProperty('--glint-y',(contact[1]*100).toFixed(2)+'%');
      settling ||= Math.abs(aim[0]-contact[0])+Math.abs(aim[1]-contact[1])>.006;
    }
    if(renderer) renderer();
    if (settling) schedule();
  }
  function schedule() { if(!frame && !document.hidden && !solid.matches) frame=requestAnimationFrame(paint); }
  async function start() {
    if (solid.matches) {document.documentElement.classList.remove('glass-live');return;}
    try {
      await photo.decode();
      if (!renderer) renderer=init();
      if(renderer){document.documentElement.classList.add('glass-live');schedule();}
    } catch { document.documentElement.classList.remove('glass-live'); }
  }
  function trackLens(event) {
    if(motion.matches || !renderer || event.target.closest('label,input,button')) return;
    const b=hero.getBoundingClientRect();
    pointer=[2*(event.clientX-b.left)/b.width-1,2*(event.clientY-b.top)/b.height-1];
    schedule();
  }
  function centerLens() { pointer=[0,0];schedule(); }
  function clearSurface() {
    if (!activeSurface) return;
    activeSurface.removeAttribute('data-lit');
    activeSurface.style.removeProperty('--glint-x');
    activeSurface.style.removeProperty('--glint-y');
    activeSurface=null;
    schedule();
  }
  function trackSurface(event) {
    if (!event.isPrimary || motion.matches || solid.matches) return;
    // Touch keeps its original event target during a drag. Hit-test the
    // current position without capturing the pointer or cancelling scrolling.
    const hit=event.pointerType==='touch'
      ? document.elementFromPoint(event.clientX,event.clientY) : event.target;
    const surface=hit?.closest?.(surfaceSelector);
    if (!surface) return clearSurface();
    const b=surface.getBoundingClientRect();
    const clamp=v=>Math.max(0,Math.min(1,v));
    const next=[clamp((event.clientX-b.left)/b.width),clamp((event.clientY-b.top)/b.height)];
    if (activeSurface!==surface) {
      clearSurface();
      activeSurface=surface;
      contact=[...next];
      surface.setAttribute('data-lit','');
      if (surface.closest('#purity')) centerLens();
    }
    aim=next;
    schedule();
  }
  for (const type of ['pointerover','pointerdown','pointermove']) document.addEventListener(type,trackSurface,{passive:true});
  document.addEventListener('pointerout',event=>{
    if (activeSurface && !activeSurface.contains(event.relatedTarget)) clearSurface();
  });
  document.addEventListener('pointerup',event=>{if(event.pointerType!=='mouse') clearSurface();});
  document.addEventListener('pointercancel',clearSurface);
  window.addEventListener('blur',clearSurface);
  window.addEventListener('scroll',clearSurface,{passive:true});
  window.addEventListener('hashchange',clearSurface);
  hero.addEventListener('pointermove',trackLens,{passive:true});
  hero.addEventListener('pointerdown',trackLens,{passive:true});
  hero.addEventListener('pointerup',event=>{if(event.pointerType==='touch')centerLens();});
  hero.addEventListener('pointercancel',centerLens);
  hero.addEventListener('pointerleave',centerLens);
  motion.addEventListener('change',()=>{clearSurface();pointer=[0,0];tilt=[0,0];schedule();});
  solid.addEventListener('change',()=>{clearSurface();start();});
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule);
  document.addEventListener('visibilitychange',schedule);
  window.addEventListener('hashchange',schedule);
  const resize=new ResizeObserver(schedule);
  document.querySelectorAll('main,.mast,.quote,.panel,.range-detail,.unit,.segments').forEach(el=>resize.observe(el));
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();renderer=null;document.documentElement.classList.remove('glass-live');});
  canvas.addEventListener('webglcontextrestored',start);
  start();
})();
