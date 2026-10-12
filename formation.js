const FormationSim=(()=>{
let clock=0;
let team=[],selected=0,goal=1,completed=0,flicks=0,targetTime=0,completionTimes=[],ready=false,l1Ready=false,assist=25,l1Returns=0;
function reset(unused,options={}){assist=Number(options.assist??25);selected=completed=flicks=targetTime=l1Returns=0;completionTimes=[];ready=l1Ready=false;team=[{id:0,role:'起始点',x:.5,y:.5}];for(let i=0;i<10;i++){const a=(i<4?i*Math.PI/2:(i-4)*Math.PI/3)+(Math.random()-.5)*.12,r=(i<4?.20:.40)+Math.random()*.015;team.push({id:i+1,role:(i<4?'内圈 ':'外圈 ')+(i+1),baseX:.5+Math.cos(a)*r,baseY:.5+Math.sin(a)*r,phase:Math.random()*Math.PI*2,rate:.7+Math.random()*.6});}update(0);chooseGoal();}
function chooseGoal(){const others=team.filter(p=>p.id!==selected&&p.id!==0);goal=selected!==0&&Math.random()<.28?0:others[Math.floor(Math.random()*others.length)].id;targetTime=0;}
function update(t){clock=t;for(const p of team){if(!p.id)continue;p.x=p.baseX+.024*Math.sin(t*p.rate+p.phase)+.012*Math.sin(t*1.9+p.phase*2);p.y=p.baseY+.024*Math.sin(t*p.rate*.83+p.phase+1)+.012*Math.cos(t*1.6+p.phase);}}
function project(x,y,w,h){return {x:w*(.5+(x-.5)*(.82+.36*y)+.012*(y-.5)),y:h*(.065+.87*y)};}
function positions(w,h){return team.map(p=>({...p,...project(p.x,p.y,w,h),scale:(.72+p.y*.5)*Math.min(w/1100,h/620)}));}
function pick(v,w,h,tolerance=assist){const ps=positions(w,h),o=ps[selected],angle=Math.atan2(v[1],v[0]);let best=Infinity,id=-1;for(const p of ps){if(p.id===selected)continue;const dx=p.x-o.x,dy=p.y-o.y,a=Math.atan2(dy,dx),error=Math.abs(Math.atan2(Math.sin(a-angle),Math.cos(a-angle)))*180/Math.PI;if(error>tolerance)continue;const distance=Math.hypot(dx,dy);if(distance<best){best=distance;id=p.id;}}return id;}
function select(id,type){selected=id;if(id!==goal)return {type,role:team[id].role};completed++;completionTimes.push(targetTime);chooseGoal();return {type:'complete',count:completed};}
function step(v,dt,t,w,h,dead=.15,l1=false){update(t);targetTime+=dt;if(!l1)l1Ready=true;if(l1){ready=false;if(!l1Ready)return null;l1Ready=false;l1Returns++;return select(0,'return');}const mag=Math.hypot(...v);if(mag<dead)ready=true;if(!ready||mag<Math.max(.6,dead))return null;ready=false;flicks++;const id=pick(v,w,h);return id<0?{type:'empty'}:select(id,'switch');}
function resume(){ready=l1Ready=false;}
function getState(){return {team,selected,goal,completed,flicks,targetTime,completionTimes,ready,l1Returns,flow:'L1 返回 '+l1Returns+' 次'};}
function draw(ctx,w,h,v,playing){
ctx.fillStyle='#517f32';ctx.fillRect(0,0,w,h);
function line(points,fill){ctx.beginPath();points.forEach((p,i)=>{const q=project(p[0],p[1],w,h);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});if(fill){ctx.closePath();ctx.fillStyle=fill;ctx.fill();}else ctx.stroke();}
for(let i=-2;i<14;i++)line([[i/12,-.1],[(i+1)/12,-.1],[(i+1)/12,1.12],[i/12,1.12]],i%2?'#5a8838':'#65943e');
// Deterministic fine grass texture, no assets or network dependencies.
ctx.globalAlpha=.1;for(let i=0;i<2000;i++){const x=((i*7919)%10007)/10007*w,y=((i*3571)%10009)/10009*h;ctx.fillStyle=i%2?'#16320f':'#dded9a';ctx.fillRect(x,y,2,1);}ctx.globalAlpha=1;
const shade=ctx.createLinearGradient(0,0,0,h);shade.addColorStop(0,'#112c191f');shade.addColorStop(1,'#e2eaaa0c');ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
ctx.strokeStyle='#e6efe0b8';ctx.lineWidth=Math.max(1.3,w/650);line([[-.1,0],[1.1,0]]);line([[-.1,1],[1.1,1]]);line([[.58,0],[.58,1]]);
const circle=[];for(let i=0;i<=100;i++){const a=i*Math.PI/50;circle.push([.58+.195*Math.cos(a),.46+.148*Math.sin(a)]);}line(circle);const mid=project(.58,.46,w,h);ctx.fillStyle='#e6efe0';ctx.beginPath();ctx.arc(mid.x,mid.y,2,0,Math.PI*2);ctx.fill();
const ps=positions(w,h),o=ps[selected];
if(playing&&Math.hypot(...v)>.15){ctx.strokeStyle='#ffffff80';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(o.x+v[0]*48,o.y+v[1]*48);ctx.stroke();}
for(const p of [...ps].sort((a,b)=>a.y-b.y)){
const current=p.id===selected,target=p.id===goal,k=Math.max(.55,p.scale),phase=clock*(p.rate||.8)*7+(p.phase||0),stride=p.id?Math.sin(phase)*5:Math.sin(clock*2)*.6;
ctx.save();ctx.translate(p.x,p.y);ctx.scale(k,k);
ctx.fillStyle='#182b2260';ctx.beginPath();ctx.ellipse(9,2,14,4,-.3,0,Math.PI*2);ctx.fill();
if(target||current){ctx.strokeStyle=target?'#ffe780':'#93efff';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,0,11,4,0,0,Math.PI*2);ctx.stroke();}
ctx.lineCap='round';ctx.lineWidth=4;ctx.strokeStyle='#f2f3e6';ctx.beginPath();ctx.moveTo(-3,-15);ctx.lineTo(-4-stride*.4,-7);ctx.lineTo(-5+stride,0);ctx.moveTo(3,-15);ctx.lineTo(4+stride*.4,-7);ctx.lineTo(5-stride,0);ctx.stroke();
ctx.strokeStyle='#202725';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-5+stride,0);ctx.lineTo(-2+stride,1);ctx.moveTo(5-stride,0);ctx.lineTo(8-stride,1);ctx.stroke();
ctx.fillStyle='#253540';ctx.fillRect(-5,-20,10,7);ctx.fillStyle=p.id===0?'#a9d4e0':'#f5f4ec';ctx.beginPath();ctx.moveTo(-6,-33);ctx.lineTo(6,-33);ctx.lineTo(5,-20);ctx.lineTo(-5,-20);ctx.closePath();ctx.fill();
ctx.strokeStyle='#d6b99d';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-6,-31);ctx.lineTo(-9,-24+stride*.5);ctx.lineTo(-8,-20+stride);ctx.moveTo(6,-31);ctx.lineTo(9,-24-stride*.5);ctx.lineTo(8,-20-stride);ctx.stroke();
ctx.fillStyle='#d6b99d';ctx.beginPath();ctx.arc(0,-38,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#242622';ctx.beginPath();ctx.arc(-.5,-40,3.6,Math.PI,Math.PI*2);ctx.fill();
ctx.fillStyle='#344239';ctx.font='bold 7px sans-serif';ctx.textAlign='center';ctx.fillText(p.id+1,0,-24);
if(current||target||p.id===0){ctx.fillStyle=target?'#ffe36c':current?'#8fe9ff':'#dbe5e0';ctx.strokeStyle='#15251d';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-5,-53);ctx.lineTo(5,-53);ctx.lineTo(0,-45);ctx.closePath();ctx.fill();ctx.stroke();ctx.font='bold 10px sans-serif';ctx.fillText(target?'目标':current?'当前': 'L1',0,-59);}
ctx.restore();}
ctx.fillStyle='#13281eaa';ctx.fillRect(12,12,Math.min(w-24,330),29);ctx.font='12px sans-serif';ctx.textAlign='left';ctx.fillStyle='#f1f4e7';ctx.fillText('右杆切人 · L1 回起始球员 · 黄色为目标',23,31);
}
return {reset,update,positions,pick,step,resume,getState,draw};})();
class InputDelayBuffer {constructor(){this.reset(0);}reset(time){this.samples=[{time:time-1000,left:[0,0],right:[0,0],l1:false,l2:false,r2:false}];}push(time,input){this.samples.push({time,left:[...input.left],right:[...input.right],l1:!!input.l1,l2:!!input.l2,r2:!!input.r2});while(this.samples.length>2&&this.samples[1].time<time-500)this.samples.shift();}read(time,delay){const at=time-Math.max(0,Math.min(60,delay));let result=this.samples[0];for(const sample of this.samples){if(sample.time>at)break;result=sample;}return {left:[...result.left],right:[...result.right],l1:result.l1,l2:result.l2,r2:result.r2};}}


const SectorDrill=(()=>{
const PI=Math.PI,TAU=PI*2,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
let advanced=false,dead=.15,half=.46,angle=0,elapsed=0,score=0,insideTime=0,continuous=0,longest=0,inside=false,inner=.15,outer=1,speed=1,velocity=.8,direction=1,nextTurn=2,jumps=[],jumpCount=0;
function reset(options={}){advanced=options.advanced;dead=options.dead??.15;half=advanced?.28:.46;speed=Number(options.speed)||1;direction=Math.random()<.5?-1:1;velocity=1.3*speed*direction;nextTurn=1.2+Math.random()*1.6;angle=Math.random()*TAU;elapsed=score=insideTime=continuous=longest=jumpCount=0;inside=false;jumps=[];const duration=Number(options.duration)||30;for(let start=0;start<duration;start+=30){const count=Math.random()<.5?1:2;const times=count===1?[5+Math.random()*20]:[5+Math.random()*6,18+Math.random()*7];for(const t of times)if(start+t<duration)jumps.push(start+t);}update(0);}
function update(dt){elapsed+=dt;if(elapsed>=nextTurn){direction=-direction;nextTurn=elapsed+Math.max(.9,(1.4+Math.random()*1.8)/Math.sqrt(speed));}velocity+=(direction*1.3*speed-velocity)*(1-Math.exp(-dt/.22));angle=wrap(angle+velocity*dt);while(jumpCount<jumps.length&&elapsed>=jumps[jumpCount]){angle=wrap(angle+PI);jumpCount++;continuous=0;}if(advanced){const center=Math.max(dead+.15,.43)+.38*(.5-.5*Math.cos(elapsed*.8*speed));inner=center-.14;outer=Math.min(1,center+.14);}else{inner=dead;outer=1;}}
function step(v,dt){update(dt);const mag=Math.min(1,Math.hypot(...v)),a=Math.atan2(v[1],v[0]);inside=mag>dead&&mag>=inner&&mag<=outer&&Math.abs(wrap(a-angle))<=half;if(inside){score+=100*dt;insideTime+=dt;continuous+=dt;longest=Math.max(longest,continuous);}else continuous=0;return getState();}
function getState(){return {advanced,dead,half,angle,elapsed,score,insideTime,continuous,longest,inside,inner,outer,speed,velocity,direction,jumpCount,jumps:[...jumps]};}
function draw(ctx,w,h,v){const x=w/2,y=h/2,r=Math.min(w*.40,h*.39);ctx.fillStyle='#132219';ctx.fillRect(0,0,w,h);
function sector(a,half,lo,hi,fill,stroke){ctx.beginPath();ctx.arc(x,y,r*hi,a-half,a+half);ctx.arc(x,y,r*lo,a+half,a-half,true);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
ctx.strokeStyle='#49614d';ctx.lineWidth=1;for(const radius of advanced?[.33,.66,1]:[1]){ctx.beginPath();ctx.arc(x,y,r*radius,0,TAU);ctx.stroke();}
sector(angle,half,inner,outer,inside?'#d2f86b66':'#d2f86b35','#d2f86b');

ctx.fillStyle='#1e3024';ctx.beginPath();ctx.arc(x,y,dead*r,0,TAU);ctx.fill();ctx.fillStyle='#829584';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText('回中',x,y+3);
const m=Math.hypot(...v),scale=m>1?1/m:1;ctx.strokeStyle='#edf3ea';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+v[0]*scale*r,y+v[1]*scale*r);ctx.stroke();ctx.fillStyle='#edf3ea';ctx.beginPath();ctx.arc(x+v[0]*scale*r,y+v[1]*scale*r,5,0,TAU);ctx.fill();
ctx.textAlign='left';ctx.fillStyle='#a9bba8';ctx.font='11px sans-serif';ctx.fillText('亮区 +100 分/秒 · 圈内自由移动 · 留意突然变向',18,25);}
return {reset,update,step,getState,draw};})();
