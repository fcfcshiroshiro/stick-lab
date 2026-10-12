const $ = id => document.getElementById(id);
const field = $('field'), ctx = field.getContext('2d'), TAU = Math.PI * 2;
const keys = new Set();let qPulse=false;
const delayBuffer=new InputDelayBuffer();
try{$('latency').value=Math.max(0,Math.min(60,Number(localStorage.getItem('sticklab-latency'))||0));}catch{}
$('latencyValue').textContent=$('latency').value+' ms';
function resetFormation(){FormationSim.reset(null,{assist:$('assist').value});}
function formationStats(){const f=FormationSim.getState();$('accuracy').textContent=f.completed;$('reaction').textContent=f.completionTimes.length?(f.completionTimes.reduce((a,b)=>a+b,0)/f.completionTimes.length).toFixed(2)+'s':'—';$('streak').textContent=f.flicks;$('selectedRole').textContent='当前 '+f.team[f.selected].role;$('targetRole').textContent='目标 '+f.team[f.goal].role;$('teamFlow').textContent=f.flow;}
function resetFreestyle(){Freestyle.reset({count:$('pursuers').value,practice:$('skillPractice').value});}
let skillHUDKey='';
function freestyleStats(){const f=Freestyle.getState();$('accuracy').textContent=f.completed;$('reaction').textContent=f.contacts;$('streak').textContent=f.streak;$('skillName').textContent=f.name;const key=f.name+f.stage+f.steps.join('');if(key!==skillHUDKey){$('skillSteps').innerHTML=f.steps.map((s,i)=>'<span class="'+(i<f.stage?'done':i===f.stage?'current':'')+'">'+(i<f.stage?'✓ ':i+1+'. ')+s+'</span>').join('');skillHUDKey=key;}$('skillTimer').textContent=f.command?'指令剩余 '+Math.max(0,7-f.age).toFixed(1)+'s · '+(f.command.reference===null?'方向随左杆':'方向已锁定'):'保持移动，准备下一项';}
let hitAudio=null;
try{$('hitSound').checked=localStorage.getItem('sticklab-hit-sound')!=='off';}catch{}
function prepareHitAudio(){
  if(!$('hitSound').checked)return;
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return;
    hitAudio??=new Audio();
    if(hitAudio.state==='suspended')hitAudio.resume().catch(()=>{});
  }catch{}
}
function playHitSound(){
  // A single quiet 65ms click per successful hit; no looping or ambient sound.
  if(!$('hitSound').checked||!hitAudio||hitAudio.state!=='running')return;
  try{
    const now=hitAudio.currentTime,osc=hitAudio.createOscillator(),gain=hitAudio.createGain();
    osc.type='sine';osc.frequency.setValueAtTime(900,now);osc.frequency.exponentialRampToValueAtTime(450,now+.055);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.075,now+.004);gain.gain.exponentialRampToValueAtTime(.0001,now+.06);
    osc.connect(gain);gain.connect(hitAudio.destination);osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(now);osc.stop(now+.065);
  }catch{}
}
const rules = {easy:{tol:25,timeout:3.5,track:.18,speed:.65},normal:{tol:15,timeout:2.6,track:.12,speed:1},hard:{tol:8,timeout:1.8,track:.075,speed:1.4}};
let mode='dribble',state='idle',remaining=60,target=0,hold=0,armed=false,hits=0,attempts=0,streak=0,times=[],errors=[];
let last=0,cooldown=0,lastDir=-1,padSeen=false,simTime=0,roundAge=0;
let trackedTime=0,trackTotal=0,powerErrorSum=0,trail=[],trailClock=0;
let trackScore=0,inBandTime=0,longestBandTime=0,bandInside=false,lastBandSound=-Infinity;
const SCORE_RATE=100,ACTIVE_WINDOW=.07;
let motionSchedule=[];
const TURN_TRANSITION=1.2;
function rotationTravel(v0,v1,elapsed){
  if(elapsed>=TURN_TRANSITION)return (v0+v1)*TURN_TRANSITION/2+v1*(elapsed-TURN_TRANSITION);
  const u=elapsed/TURN_TRANSITION;
  return v0*elapsed+(v1-v0)*TURN_TRANSITION*(u*u*u-.5*u*u*u*u);
}
function resetMotionSchedule(){
  motionSchedule=[];let time=0,angle=0,v0=1;
  while(time<+$('duration').value+10){
    const sign=motionSchedule.length>0&&Math.random()<.45?-Math.sign(v0):Math.sign(v0),v1=sign*(.65+Math.random()*.5);
    const duration=TURN_TRANSITION+4+Math.random()*3;
    motionSchedule.push({start:time,angle,v0,v1,duration});
    angle+=rotationTravel(v0,v1,duration);time+=duration;v0=v1;
  }
}
function randomRotationAt(time){
  const s=motionSchedule.find(s=>time<s.start+s.duration)||motionSchedule[motionSchedule.length-1];
  if(!s)return {angle:time,velocity:1};
  const elapsed=Math.max(0,time-s.start),u=Math.min(1,elapsed/TURN_TRANSITION),blend=u*u*(3-2*u);
  return {angle:s.angle+rotationTravel(s.v0,s.v1,elapsed),velocity:s.v0+(s.v1-s.v0)*blend};
}
const players=Array.from({length:8},(_,i)=>({a:i*TAU/8-Math.PI/2,radius:1}));
const sector=()=>mode==='dribble'&&['basic','advanced'].includes($('pattern').value);
function resetSector(){SectorDrill.reset({advanced:$('pattern').value==='advanced',dead:deadzone(),speed:$('sectorSpeed').value,duration:$('duration').value});}
const spiral=()=>mode==='dribble'&&$('pattern').value==='spiral';
const rule=()=>rules[$('difficulty').value];
const active=()=>state==='running'||state==='paused';
const deadzone=()=>+$('dead').value/100;
const magnitude=v=>Math.min(1,Math.hypot(...v));
function rotationSign(cycle){return $('rotation').value==='reverse'?-1:$('rotation').value==='alternate'&&cycle%2===1?-1:1;}
function difference(a,b){return Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)))*180/Math.PI;}
function bestKey(){if(mode==='freestyle')return `sticklab-freestyle-v1-${$('pursuers').value}-${$('skillPractice').value}-${$('duration').value}-${$('latency').value}-${$('dead').value}-${$('keyboard').checked}`;if(mode==='switch')return `sticklab-switch-sectors-v1-${$('difficulty').value}-${$('duration').value}-${$('dead').value}-${$('latency').value}-${$('keyboard').checked}`;if(sector())return `sticklab-sector-v3-${$('pattern').value}-${$('sectorSpeed').value}-${$('duration').value}-${$('dead').value}-${$('latency').value}-${$('keyboard').checked}`;if(mode==='formation')return `sticklab-l1-right-v3-${$('duration').value}-${$('latency').value}-assist${$('assist').value}-${$('keyboard').checked}`;const variant=mode==='dribble'?$('pattern').value+($('pattern').value==='spiral'?`-${$('tempo').value}-${$('rotation').value}`:''):$('motion').value+($('motion').value==='moving'?`-${$('motionRate').value}-${$('motionDirection').value}`:'');return `sticklab-${spiral()?'v4-band':'v3'}-${mode}-${variant}-${$('difficulty').value}-${$('duration').value}-${$('keyboard').checked?'keys':'pad'}-delay${$('latency').value}`;}
function readBest(){let b;try{b=JSON.parse(localStorage.getItem(bestKey()));}catch{}if(mode==='freestyle'){$('best').textContent=b?b.completed+' 次':'—';$('bestDetail').textContent=b?'完成花式 · 被追上 '+b.contacts+' 次':'完成训练后保存';return;}if(sector()){$('best').textContent=b?b.score+' 分':'—';$('bestDetail').textContent=b?'高亮保持 '+b.insideTime.toFixed(1)+'s':'完成训练后保存';return;}if(mode==='formation'){$('best').textContent=b?b.completed+' 次':'—';$('bestDetail').textContent=b?'限时完成目标 · '+$('latency').value+'ms 延迟':'完成训练后保存';return;}$('best').textContent=b?(spiral()?b.score+' 分':b.accuracy+'%'):'—';$('bestDetail').textContent=b?(spiral()?`带内保持率 ${b.tracking}% · 最长 ${b.longest.toFixed(1)}s`:`${b.hits} 次命中 · ${b.rt}ms 平均反应`):'完成训练后保存';}
// A continuous two-turn route: light circles, spiral out, full tilt, ease back in.
function route(progress){
  const u=((progress%1)+1)%1,light=Math.max(.28,deadzone()+.1),smooth=t=>t*t*(3-2*t);
  let radius=light;
  if(u>=.25&&u<.75)radius=light+(1-light)*smooth((u-.25)/.5);
  else if(u>=.75&&u<.9)radius=1;
  else if(u>=.9)radius=1-(1-light)*smooth((u-.9)/.1);
  const a=-Math.PI/2+rotationSign(Math.floor(progress))*TAU*2*Math.min(u/.9,1);
  return {a,radius,x:Math.cos(a)*radius,y:Math.sin(a)*radius,u};
}
function currentRoute(){return route(simTime/+$('tempo').value);}
function activeBandRange(){
  const progress=simTime/+$('tempo').value,cycle=Math.floor(progress);
  return {start:Math.max(cycle,progress-ACTIVE_WINDOW),end:Math.min(cycle+1,progress+ACTIVE_WINDOW)};
}
function bandDistance(v){
  const mag=Math.hypot(...v),scale=mag>1?1/mag:1,x=v[0]*scale,y=v[1]*scale;
  const range=activeBandRange();let closest=Infinity,a=route(range.start);
  for(let i=1;i<=48;i++){
    const b=route(range.start+(range.end-range.start)*i/48),dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/length)):0;
    closest=Math.min(closest,Math.hypot(x-a.x-dx*t,y-a.y-dy*t));a=b;
  }
  return closest;
}
function updatePlayers(){
  const moving=false,t=simTime,rate=+$('motionRate').value;
  const direction=$('motionDirection').value;
  const angle=direction==='random'?randomRotationAt(t).angle*rate:t*rate*(direction==='counterclockwise'?-1:1);
  players.forEach((p,i)=>{
    // Keep angular order stable to avoid overlapping directional candidates.
    p.a=i*TAU/8-Math.PI/2+(moving?angle:0);
    p.radius=1;
  });
  if(mode==='switch'&&lastDir>=0)target=players[lastDir].a;
}
function next(){let n;do{n=Math.floor(Math.random()*8);}while(n===lastDir);lastDir=n;target=mode==='switch'?players[n].a:n*TAU/8-Math.PI/2;roundAge=0;hold=0;armed=false;}
function stats(){
  $('time').innerHTML=Math.ceil(remaining)+'<span>s</span>';
  if(mode==='freestyle'){freestyleStats();return;}if(sector()){const f=SectorDrill.getState();$('accuracy').textContent=Math.round(f.score);$('reaction').textContent=f.elapsed?Math.round(f.insideTime/f.elapsed*100)+'%':'—';$('streak').textContent=f.continuous.toFixed(1)+'s';return;}if(mode==='formation'){formationStats();return;}$('accuracy').textContent=spiral()?Math.round(trackScore):attempts?Math.round(hits/attempts*100)+'%':'—';
  $('accuracy').style.color=spiral()&&trackScore<0?'#ed897c':'';
  $('reaction').textContent=spiral()?(trackTotal?Math.round(trackedTime/trackTotal*100)+'%':'—'):times.length?Math.round(times.reduce((a,b)=>a+b,0)/times.length)+'ms':'—';
  $('streak').textContent=spiral()?inBandTime.toFixed(1)+'s':streak;
}
function lock(on){for(const id of ['difficulty','duration','mapping','dead','keyboard','pursuers','skillPractice','pattern','sectorSpeed','tempo','motion','rotation','motionRate','motionDirection','latency','assist','pursuers','skillPractice'])$(id).disabled=on;document.querySelectorAll('.mode').forEach(b=>b.disabled=on);}
function begin(){
  if(!$('keyboard').checked&&!padSeen){$('feedback').textContent='请先连接手柄并按一下按键，或开启键盘试练';return;}
  prepareHitAudio();
  state='running';remaining=+$('duration').value;hits=attempts=streak=0;times=[];errors=[];cooldown=simTime=0;
  resetMotionSchedule();
  trackedTime=trackTotal=powerErrorSum=trailClock=trackScore=inBandTime=longestBandTime=0;bandInside=false;lastBandSound=-Infinity;trail=[];
  last=performance.now();delayBuffer.reset(last);resetFormation();resetSector();resetFreestyle();updatePlayers();next();$('overlay').style.display='none';$('result').hidden=true;lock(true);
  $('layout').classList.add('is-playing');$('start').textContent='暂停训练';$('phase').textContent=spiral()?'轻推转圈':'训练中';stats();
}
function toggle(){
  prepareHitAudio();
  if(state==='running'){state='paused';$('start').textContent='继续训练';$('phase').textContent='已暂停';}
  else if(state==='paused'){state='running';last=performance.now();delayBuffer.reset(last);FormationSim.resume();Freestyle.resume();hold=0;armed=false;$('start').textContent='暂停训练';$('phase').textContent='训练中';}
  else begin();
}
function finish(){
  state='done';$('layout').classList.remove('is-playing');lock(false);$('start').textContent='再练一轮 →';$('phase').textContent='训练完成';
  if(mode==='freestyle'){const f=Freestyle.getState();$('result').hidden=false;$('result').innerHTML=`<h2>完成 ${f.completed} 次花式</h2><p>被追上 ${f.contacts} 次 · 指令超时 ${f.missed} 次 · 追击点 ${$('pursuers').value} 个</p>`;try{const old=JSON.parse(localStorage.getItem(bestKey()));if(!old||f.completed>old.completed||(f.completed===old.completed&&f.contacts<old.contacts))localStorage.setItem(bestKey(),JSON.stringify({completed:f.completed,contacts:f.contacts}));}catch{}readBest();return;}
  if(sector()){const f=SectorDrill.getState();$('phase').textContent='训练完成';$('result').hidden=false;$('result').innerHTML=`<h2>本轮训练完成 <span style="color:var(--lime)">${Math.round(f.score)} 分</span></h2><p>训练 ${f.elapsed.toFixed(1)}s · 高亮保持 ${f.insideTime.toFixed(1)}s · 突然变向 ${f.jumpCount} 次 · 最长连续 ${f.longest.toFixed(1)}s</p><p>高亮区域 +100 分/秒；高亮外不加分；每 30 秒随机出现 1–2 次对侧变向。</p>`;try{const old=JSON.parse(localStorage.getItem(bestKey()));if(!old||f.score>old.score)localStorage.setItem(bestKey(),JSON.stringify({score:Math.round(f.score),insideTime:f.insideTime}));}catch{}readBest();return;}
  if(mode==='formation'){const f=FormationSim.getState();$('result').hidden=false;$('result').innerHTML=`<h2>本轮完成 <span style="color:var(--lime)">${f.completed} 次目标</span></h2><p>${$('duration').value} 秒 · ${f.flicks} 次右杆 · ${f.l1Returns} 次 L1 返回 · 额外输入延迟 ${$('latency').value}ms</p><p>右摇杆切点，L1 返回中心；切中黄色目标计 1 次。中心为目标时，L1 返回同样得分。</p>`;try{const old=JSON.parse(localStorage.getItem(bestKey()));if(!old||f.completed>old.completed)localStorage.setItem(bestKey(),JSON.stringify({completed:f.completed}));}catch{}readBest();return;}
  const accuracy=attempts?Math.round(hits/attempts*100):0,rt=times.length?Math.round(times.reduce((a,b)=>a+b,0)/times.length):0;
  const avg=errors.length?(errors.reduce((a,b)=>a+b,0)/errors.length).toFixed(1):'—';
  const tracking=trackTotal?Math.round(trackedTime/trackTotal*100):0,power=trackTotal?(powerErrorSum/trackTotal*100).toFixed(1):'—';
  $('result').hidden=false;
  $('result').innerHTML=`<h2>本轮训练完成 <span style="color:var(--lime)">${spiral()?Math.round(trackScore)+' 分':accuracy+'%'}</span></h2>`+(spiral()
    ?`<p>带内保持率 ${tracking}% · 带内 ${trackedTime.toFixed(1)}s / 出界 ${(trackTotal-trackedTime).toFixed(1)}s · 最长连续带内 ${longestBandTime.toFixed(1)}s</p><p>当前亮色轨道内 +100 分/秒，出界 −100 分/秒；按时间连续计分。沿轨道跟随节奏前进，停在其他路段不会得分。平均力度误差 ${power} 个百分点。</p>`
    :`<p>${attempts} 次目标 · ${hits} 次命中 · 平均反应 ${rt||'—'}ms · 命中平均角度误差 ${avg}°</p><p>${mode==='switch'?'轻拨进入高亮扇形即可；每次拨杆后需要回中。':'反应时间包含 180ms 保持时间。'} 超时计为未命中。</p>`);
  try{const old=JSON.parse(localStorage.getItem(bestKey()));if(!old||(spiral()?trackScore>old.score:accuracy>old.accuracy||(accuracy===old.accuracy&&hits>old.hits)))localStorage.setItem(bestKey(),JSON.stringify({accuracy,hits,rt,tracking,score:Math.round(trackScore),longest:longestBandTime}));}catch{}
  readBest();
}
function score(ok,a){attempts++;if(ok){hits++;streak++;playHitSound();times.push(roundAge*1000);errors.push(difference(a,target));$('feedback').textContent=`命中 +1 · 误差 ${difference(a,target).toFixed(1)}°`;}else{streak=0;$('feedback').textContent='未命中 · 回到中心，准备下一次';}cooldown=.28;hold=0;stats();}
function inputs(){
  let pads=[];try{pads=Array.from(navigator.getGamepads?.()||[]).filter(Boolean);}catch{}
  const p=pads[0];padSeen=!!p;$('connection').textContent=p?'● '+p.id.slice(0,32):$('keyboard').checked?'● 键盘试练模式':'○ 等待手柄连接';$('connection').style.color=(p||$('keyboard').checked)?'#d2f86b':'';
  let left=[0,0],right=[0,0],l1=!!p?.buttons?.[4]?.pressed;
  if(p){const a=p.axes;left=[a[0]||0,a[1]||0];right=$('mapping').value==='alternate'?[a[3]||0,a[4]||0]:[a[2]||0,a[3]||0];if($('mapping').value==='swapped')[left,right]=[right,left];}
  if($('keyboard').checked){left=[+keys.has('d')-+keys.has('a'),+keys.has('s')-+keys.has('w')];right=[+keys.has('ArrowRight')-+keys.has('ArrowLeft'),+keys.has('ArrowDown')-+keys.has('ArrowUp')];for(const v of [left,right]){const m=Math.hypot(...v);if(m>1){v[0]/=m;v[1]/=m;}}const force=keys.has('Shift')?.3:keys.has('Alt')?.6:1;left=left.map(n=>n*force);}
  if($('keyboard').checked)l1=keys.has('q')||qPulse;qPulse=false;return {left,right,l1,l2:$('keyboard').checked?keys.has('e'):!!(p?.buttons?.[6]?.pressed||p?.buttons?.[6]?.value>.5),r2:$('keyboard').checked?keys.has('r'):!!(p?.buttons?.[7]?.pressed||p?.buttons?.[7]?.value>.5)};
}
function mini(id,v){
  const g=$(id).getContext('2d'),x=90,y=80,r=54;g.clearRect(0,0,180,160);g.strokeStyle='#34473b';g.lineWidth=1;
  g.beginPath();g.arc(x,y,r,0,TAU);g.moveTo(x-r-10,y);g.lineTo(x+r+10,y);g.moveTo(x,y-r-10);g.lineTo(x,y+r+10);g.stroke();
  g.fillStyle='#d2f86b0e';g.beginPath();g.arc(x,y,r*deadzone(),0,TAU);g.fill();g.strokeStyle='#d2f86b';g.beginPath();g.moveTo(x,y);g.lineTo(x+v[0]*r,y+v[1]*r);g.stroke();
  g.fillStyle='#d2f86b';g.beginPath();g.arc(x+v[0]*r,y+v[1]*r,5,0,TAU);g.fill();$(id==='leftStick'?'leftRead':'rightRead').textContent=`X ${v[0].toFixed(2)} / Y ${v[1].toFixed(2)}`;
}
function dot(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();}
function draw(v){
  const w=field.clientWidth,h=field.clientHeight,dpr=window.devicePixelRatio||1;if(field.width!==Math.round(w*dpr)||field.height!==Math.round(h*dpr)){field.width=Math.round(w*dpr);field.height=Math.round(h*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);if(mode==='freestyle'){Freestyle.draw(ctx,w,h);return;}if(mode==='switch'){const x=w/2,y=h/2,r=Math.min(w*.4,h*.39),hole=deadzone()*r;for(let i=0;i<8;i++){const a=i*TAU/8-Math.PI/2,on=active()&&i===lastDir;ctx.beginPath();ctx.arc(x,y,r,a-Math.PI/8,a+Math.PI/8);ctx.arc(x,y,hole,a+Math.PI/8,a-Math.PI/8,true);ctx.closePath();ctx.fillStyle=on?'#d2f86b55':'#203629';ctx.fill();ctx.strokeStyle=on?'#d2f86b':'#54705b';ctx.lineWidth=1;ctx.stroke();}ctx.fillStyle='#18291e';ctx.beginPath();ctx.arc(x,y,hole,0,TAU);ctx.fill();const m=Math.hypot(...v),scale=m>1?1/m:1;ctx.strokeStyle='#edf3ea';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+v[0]*scale*r,y+v[1]*scale*r);ctx.stroke();dot(x+v[0]*scale*r,y+v[1]*scale*r,5,'#edf3ea');ctx.font='11px sans-serif';ctx.textAlign='left';ctx.fillStyle='#afc4ae';ctx.fillText('轻拨即可 · 无需推满 · 每次松杆回中',18,25);return;}if(sector()){SectorDrill.draw(ctx,w,h,v);return;}if(mode==='formation'){FormationSim.draw(ctx,w,h,v,active());return;}const x=w/2,y=h/2-6,r=Math.min(w*.32,h*.34);
  ctx.strokeStyle='#20372a';ctx.lineWidth=1;for(let i=20;i<w;i+=32){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,h);ctx.stroke();}for(let j=20;j<h;j+=32){ctx.beginPath();ctx.moveTo(0,j);ctx.lineTo(w,j);ctx.stroke();}
  ctx.strokeStyle='#3a4c3e';ctx.strokeRect(20,20,w-40,h-40);ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.moveTo(x,20);ctx.lineTo(x,h-20);ctx.stroke();
  if(spiral()){
    const cycle=Math.floor(simTime/+$('tempo').value),range=activeBandRange();
    const strokeBand=(start,end,edge,fill)=>{
      ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
      for(let i=0;i<=240;i++){const p=route(start+(end-start)*i/240);if(i===0)ctx.moveTo(x+p.x*r,y+p.y*r);else ctx.lineTo(x+p.x*r,y+p.y*r);}
      ctx.strokeStyle=edge;ctx.lineWidth=rule().track*r*2+2;ctx.stroke();ctx.strokeStyle=fill;ctx.lineWidth=rule().track*r*2;ctx.stroke();
    };
    strokeBand(cycle,cycle+1,'#55745c','#253b2c');
    strokeBand(range.start,range.end,bandInside?'#d2f86b':'#afc891',bandInside?'#435832':'#364830');
    ctx.strokeStyle='#6a8d70';ctx.lineWidth=1;ctx.beginPath();for(let i=0;i<=240;i++){const p=route(cycle+i/240);if(i===0)ctx.moveTo(x+p.x*r,y+p.y*r);else ctx.lineTo(x+p.x*r,y+p.y*r);}ctx.stroke();
    const p=currentRoute();dot(x+p.x*r,y+p.y*r,4,'#d2f86b');
    ctx.strokeStyle='#f0f6ed99';ctx.lineWidth=2;ctx.beginPath();trail.forEach((p,i)=>{if(i===0)ctx.moveTo(x+p[0]*r,y+p[1]*r);else ctx.lineTo(x+p[0]*r,y+p[1]*r);});ctx.stroke();
    ctx.fillStyle='#a1b79d';ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillText('浅绿轨道 · 亮色当前段 · 带内 +100/s · 出界 −100/s',28,40);
  }else{
    const tol=rule().tol*Math.PI/180;
    if(active()&&mode==='dribble'){ctx.fillStyle='#d2f86b22';ctx.beginPath();ctx.moveTo(x,y);ctx.arc(x,y,r+16,target-tol,target+tol);ctx.closePath();ctx.fill();ctx.strokeStyle='#d2f86b';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,r+16,target-tol,target+tol);ctx.stroke();}
    players.forEach((p,i)=>{const on=active()&&i===lastDir,tx=x+Math.cos(p.a)*p.radius*r,ty=y+Math.sin(p.a)*p.radius*r;
      if(mode==='switch'&&$('motion').value==='moving'){ctx.strokeStyle=on?'#d2f86b33':'#405447';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx-Math.sin(p.a)*19,ty+Math.cos(p.a)*19);ctx.stroke();}
      dot(tx,ty,mode==='switch'?17:9,on?'#d2f86b':'#23382a');ctx.strokeStyle=on?'#e2ffab':'#54705b';ctx.lineWidth=1;ctx.stroke();if(mode==='switch'){ctx.fillStyle=on?'#172015':'#9fb4a2';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText(i+1,tx,ty+4);}
    });
  }
  const m=Math.hypot(...v),scale=m>1?1/m:1;ctx.strokeStyle='#edf3ea';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+v[0]*scale*r,y+v[1]*scale*r);ctx.stroke();dot(x+v[0]*scale*r,y+v[1]*scale*r,6,spiral()&&active()?(bandInside?'#d2f86b':'#ed897c'):'#edf3ea');dot(x,y,4,'#73917a');
  if(hold>0){ctx.strokeStyle='#d2f86b';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,24,-Math.PI/2,-Math.PI/2+TAU*hold/.18);ctx.stroke();}
}
function trackStep(v,dt){
  const p=currentRoute(),m=Math.hypot(...v),scale=m>1?1/m:1,good=bandDistance(v)<=rule().track;
  trackTotal+=dt;if(good){trackedTime+=dt;inBandTime+=dt;longestBandTime=Math.max(longestBandTime,inBandTime);}else inBandTime=0;
  trackScore+=(good?SCORE_RATE:-SCORE_RATE)*dt;
  if(good&&!bandInside&&simTime-lastBandSound>=.35){playHitSound();lastBandSound=simTime;}bandInside=good;
  powerErrorSum+=Math.abs(magnitude(v)-p.radius)*dt;
  trailClock+=dt;if(trailClock>=.03){trail.push([v[0]*scale,v[1]*scale]);if(trail.length>75)trail.shift();trailClock=0;}
  const direction=rotationSign(Math.floor(simTime/+$('tempo').value))===1?'正向 ↻':'反向 ↺';
  const stage=p.u<.25?'轻推转圈':p.u<.75?'逐渐推满':p.u<.9?'满杆转向':'平滑收回';$('phase').textContent=direction+' · '+stage;
  $('targetPower').textContent=`目标力度 ${Math.round(p.radius*100)}% · 当前 ${Math.round(magnitude(v)*100)}%`;
  $('trackMetric').textContent=good?'带内 +100 分/秒':'出界 −100 分/秒';$('trackMetric').style.color=good?'#d2f86b':'#ed897c';$('powerError').textContent=`力度误差 ${(powerErrorSum/trackTotal*100).toFixed(1)}pp`;
  $('feedback').textContent=good?'保持在亮色轨道内 · 持续加分':'出界扣分 · 回到当前亮色轨道';
}
function trainingStep(v,dt,l1=false,input=null){
  simTime+=dt;remaining=Math.max(0,remaining-dt);updatePlayers();
  if(mode==='freestyle'){const event=Freestyle.step(input||{left:[0,0],right:[0,0]},dt,deadzone());const f=Freestyle.getState();$('phase').textContent='躲避追击 · 完成花式';$('feedback').textContent=f.message;if(event?.type==='complete')playHitSound();stats();if(remaining<=0)finish();return;}
  if(sector()){const before=SectorDrill.getState().inside,f=SectorDrill.step(v,dt);$('phase').textContent=f.advanced?'方向 + 力度':'方向跟随';$('targetPower').textContent=f.advanced?`目标力度 ${Math.round(f.inner*100)}–${Math.round(f.outer*100)}%`:'基础：方向跟随';$('trackMetric').textContent=f.inside?'高亮内 +100 分/秒':'高亮外不加分';$('powerError').textContent=`当前力度 ${Math.round(magnitude(v)*100)}%`;$('feedback').textContent=f.inside?'保持跟随高亮区域':'跟随高亮 · 留意对侧突然变向';if(f.inside&&!before&&simTime-lastBandSound>.35){playHitSound();lastBandSound=simTime;}stats();if(remaining<=0)finish();return;}
  if(mode==='formation'){const event=FormationSim.step(v,dt,simTime,field.clientWidth,field.clientHeight,deadzone(),l1);$('phase').textContent=FormationSim.getState().goal===0?'目标是起始点 · 按 L1 返回':'右摇杆切向目标';if(event){$('feedback').textContent=event.type==='complete'?'到达目标 +1 · 继续寻找下一个目标':event.type==='return'?'已回到起始点 · 右摇杆切向目标':event.type==='switch'?'已切到 '+event.role+' · 回中后可继续切换':'此方向没有队友 · 回中后再试';if(event.type==='complete')playHitSound();}}
  else if(spiral())trackStep(v,dt);
  else if(cooldown>0){cooldown-=dt;if(cooldown<=0)next();}
  else{roundAge+=dt;const mag=magnitude(v),a=Math.atan2(v[1],v[0]);if(mag<deadzone())armed=true;
    if(mode==='dribble'){if(mag>=Math.max(.45,deadzone())&&difference(a,target)<=rule().tol){hold+=dt;if(hold>=.18)score(true,a);}else hold=0;}
    else if(armed&&mag>=Math.max(.2,deadzone()+.04)){score(difference(a,target)<=22.5,a);armed=false;}
    if(cooldown<=0&&roundAge>rule().timeout)score(false,a);
    if(cooldown<=0)$('feedback').textContent=mode==='switch'?(armed?'轻拨进入高亮扇形，无需推满':'先松杆回中，准备切人'):'推向亮起方向，并短暂保持';
  }
  stats();if(remaining<=0)finish();
}
function frame(now){
  // Substeps preserve timer duration and continuous scoring when a frame is late.
  let elapsed=last?Math.max(0,(now-last)/1000):0;last=now;const raw=inputs();delayBuffer.push(now,raw);const input=delayBuffer.read(now,+$('latency').value),v=input[(mode==='dribble'||mode==='freestyle')?'left':'right'];mini('leftStick',input.left);mini('rightStick',input.right);
  const mag=magnitude(v),a=Math.atan2(v[1],v[0]);$('angle').textContent=`输入 ${Math.round(mag*100)}% · ${mag>deadzone()?Math.round((a*180/Math.PI+90+360)%360):0}°`;
  if(state==='running'){if(!padSeen&&!$('keyboard').checked){toggle();$('phase').textContent='手柄断开，已暂停';}else{elapsed=Math.min(elapsed,remaining);while(elapsed>1e-7&&state==='running'){const dt=Math.min(.025,elapsed);trainingStep(v,dt,input.l1,input);elapsed-=dt;}}}
  draw(v);requestAnimationFrame(frame);
}
function refreshMode(){
  $('layout').classList.toggle('freestyle-layout',mode==='freestyle');$('layout').classList.remove('is-playing');$('freestyleSetting').hidden=mode!=='freestyle';$('skillPrompt').hidden=mode!=='freestyle';$('fullArena').hidden=mode!=='freestyle';
  $('layout').classList.toggle('formation-layout',mode==='formation');
  $('formationSetting').hidden=mode!=='formation';$('formationInfo').hidden=mode!=='formation';$('difficultySetting').hidden=mode!=='switch';
  $('sectorSpeedSetting').hidden=!sector();$('dribbleSetting').hidden=mode!=='dribble';$('tempoSetting').hidden=!spiral();$('rotationSetting').hidden=!spiral();$('motionSetting').hidden=true;$('motionRateSetting').hidden=true;$('motionDirectionSetting').hidden=$('motionRateSetting').hidden;$('motionDirectionHint').hidden=$('motionRateSetting').hidden||$('motionDirection').value!=='random';$('trackInfo').hidden=!(spiral()||sector());
  $('modeTitle').textContent=mode==='dribble'?(spiral()?'左摇杆 · 连续方向与力度':'左摇杆 · 盘带方向'):'右摇杆 · 八方向轻拨切人';
  $('accuracyLabel').textContent=spiral()?'累计得分':'命中率';$('responseLabel').textContent=spiral()?'带内保持率':'平均反应';$('streakLabel').textContent=spiral()?'连续带内':'连续命中';$('overlay').querySelector('h2').textContent=mode==='switch'?'轻拨一下，切准方向。':spiral()?'沿着轨道，稳定控杆。':'找到方向。精准出杆。';
  $('instructions').textContent=mode==='switch'?'先松杆回中，再轻拨进入高亮扇形；不需要推到圆边。':spiral()?`${$('tempo').value} 秒一轮 · 当前亮色带内 +100/s，出界 −100/s。`:'将左摇杆推向亮起的方向，并保持 180ms。';$('keyboardNote').hidden=!$('keyboard').checked;
  state='idle';simTime=0;resetFormation();resetSector();resetFreestyle();delayBuffer.reset(performance.now());lastDir=-1;trail=[];trackScore=trackedTime=trackTotal=inBandTime=longestBandTime=powerErrorSum=0;bandInside=false;resetMotionSchedule();updatePlayers();hits=attempts=streak=0;times=[];remaining=+$('duration').value;
  $('overlay').style.display='flex';$('result').hidden=true;$('start').textContent='开始训练 →';$('phase').textContent='自由试杆';$('targetPower').textContent='目标力度 —';$('trackMetric').textContent='等待开始';$('trackMetric').style.color='';$('powerError').textContent='力度误差 —';$('feedback').textContent='连接手柄，或开启键盘试练';if(mode==='formation'){$('modeTitle').textContent='L1右摇杆结合训练';$('accuracyLabel').textContent='完成目标';$('responseLabel').textContent='平均到达';$('streakLabel').textContent='拨杆次数';$('accuracy').style.color='';$('overlay').querySelector('h2').textContent='右杆切点，L1 回中。';$('instructions').textContent='右摇杆切向黄色目标；L1 返回起始点。中心也可能成为目标。';$('feedback').textContent='每次拨杆后松杆 · L1 / LB 返回中心';}if(sector()){$('modeTitle').textContent=$('pattern').value==='advanced'?'左摇杆 · 进阶精细练习':'左摇杆 · 基础方向练习';$('accuracyLabel').textContent='累计得分';$('responseLabel').textContent='高亮保持率';$('streakLabel').textContent='连续跟随';$('accuracy').style.color='';$('overlay').querySelector('h2').textContent='跟随高亮，应对变向。';$('instructions').textContent='高亮内持续得分 · 每 30 秒随机 1–2 次对侧变向';$('targetPower').textContent=$('pattern').value==='advanced'?'方向与力度':'基础：方向跟随';$('powerError').textContent='回中不计分';}if(mode==='freestyle'){$('modeTitle').textContent='球员花式训练（试验版）';$('accuracyLabel').textContent='完成花式';$('responseLabel').textContent='被追上次数';$('streakLabel').textContent='连续完成';$('accuracy').style.color='';$('overlay').querySelector('h2').textContent='保持移动，完成花式。';$('instructions').textContent='左杆躲避红点 · 按屏幕顺序操作右杆 · L2 / R2 取消';}stats();readBest();
}
$('fullArena').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await field.closest('.arena-panel').requestFullscreen();}catch{$('feedback').textContent='当前浏览器未提供全屏，可直接在大画布训练';}};
$('stop').onclick=()=>{lock(false);refreshMode();};
$('hitSound').onchange=()=>{try{localStorage.setItem('sticklab-hit-sound',$('hitSound').checked?'on':'off');}catch{}if($('hitSound').checked)prepareHitAudio();};
$('start').onclick=toggle;$('reset').onclick=()=>{state='idle';lock(false);begin();};
document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('.mode').forEach(x=>x.classList.toggle('active',x===b));refreshMode();});
$('dead').oninput=()=>{$('deadValue').textContent=$('dead').value+'%';};for(const id of ['difficulty','duration','keyboard','pattern','sectorSpeed','tempo','motion','rotation','motionRate','motionDirection'])$(id).onchange=refreshMode;
$('assist').oninput=()=>{$('assistValue').textContent='±'+$('assist').value+'°';refreshMode();};
$('latency').oninput=()=>{$('latencyValue').textContent=$('latency').value+' ms';delayBuffer.reset(performance.now());try{localStorage.setItem('sticklab-latency',$('latency').value);}catch{}readBest();};
window.addEventListener('keydown',e=>{if(e.target.matches('input,select')||(e.target.matches('button')&&e.key===' '))return;if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)||($('keyboard').checked&&e.key==='Alt'))e.preventDefault();if(e.key===' '&&!e.repeat)toggle();if(e.key.toLowerCase()==='q'&&!e.repeat)qPulse=true;keys.add(e.key.length===1?e.key.toLowerCase():e.key);});
window.addEventListener('keyup',e=>keys.delete(e.key.length===1?e.key.toLowerCase():e.key));window.addEventListener('blur',()=>{keys.clear();qPulse=false;if(state==='running')toggle();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='running')toggle();});refreshMode();requestAnimationFrame(frame);


