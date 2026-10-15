const DefenseSim=(()=>{
let team=[],selected=0,goal=1,ball={},completed=0,flicks=0,l1Returns=0,targetTime=0,completionTimes=[],ready=false,l1Ready=false,cooldown=0,shape='4312';
const project=(x,y,w,h)=>({x:w*(.5+(x-.5)*(.82+.36*y)+.012*(y-.5)),y:h*(.065+.87*y)});
function question(){
 const bases=[[.27,.16,'左后卫'],[.23,.38,'左中卫'],[.23,.62,'右中卫'],[.27,.84,'右后卫'],...(shape==='4312'?[[.56,.25,'左中场'],[.53,.5,'中场'],[.56,.75,'右中场']]:[[.54,.35,'左后腰'],[.54,.65,'右后腰']])];
 team=bases.map(([x,y,role],id)=>({id,role,x:x+(Math.random()-.5)*.055,y:y+(Math.random()-.5)*.06}));
 selected=Math.floor(Math.random()*team.length);do{goal=Math.floor(Math.random()*team.length);}while(goal===selected);
 const near=team[Math.floor(Math.random()*team.length)],a=Math.random()*Math.PI*2;ball={x:Math.max(Math.max(...team.slice(0,4).map(p=>p.x))+.045,near.x+Math.cos(a)*.085),y:Math.max(.08,Math.min(.92,near.y+Math.sin(a)*.075))};targetTime=0;ready=l1Ready=false;
}
function reset(unused,options={}){shape=options.shape==='4213'?'4213':'4312';completed=flicks=l1Returns=cooldown=0;completionTimes=[];question();}
function positions(w,h){return team.map(p=>({...p,...project(p.x,p.y,w,h)}));}
function nearest(){return team.reduce((a,p)=>Math.hypot(p.x-ball.x,p.y-ball.y)<Math.hypot(a.x-ball.x,a.y-ball.y)?p:a).id;}
function pick(v,w,h){const ps=positions(w,h),o=ps[selected],a=Math.atan2(v[1],v[0]);let best=Infinity,id=-1;for(const p of ps){if(p.id===selected)continue;const dx=p.x-o.x,dy=p.y-o.y,error=Math.abs(Math.atan2(Math.sin(Math.atan2(dy,dx)-a),Math.cos(Math.atan2(dy,dx)-a)));if(error>25*Math.PI/180)continue;const d=Math.hypot(dx,dy);if(d<best){best=d;id=p.id;}}return id;}
function step(v,dt,t,w,h,dead=.15,l1=false){if(cooldown>0){cooldown-=dt;if(cooldown<=0)question();return null;}targetTime+=dt;if(!l1)l1Ready=true;if(Math.hypot(...v)<dead)ready=true;let id=-1,type='switch';if(l1&&l1Ready){l1Ready=false;ready=false;l1Returns++;id=nearest();type='ball';}else if(!l1&&ready&&Math.hypot(...v)>=Math.max(.2,dead+.04)){ready=false;flicks++;id=pick(v,w,h);if(id<0)return {type:'empty'};}else return null;selected=id;if(id===goal){completed++;completionTimes.push(targetTime);cooldown=.35;return {type:'complete'};}return {type,role:team[id].role};}
function resume(){ready=l1Ready=false;}
function getState(){return {team,selected,goal,ball,completed,flicks,l1Returns,targetTime,completionTimes,flow:shape+' · 第 '+(completed+1)+' 题'};}
function draw(ctx,w,h,v,playing){
 ctx.fillStyle='#568336';ctx.fillRect(0,0,w,h);
 function path(points,fill){ctx.beginPath();points.forEach(([x,y],i)=>{const p=project(x,y,w,h);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});if(fill){ctx.closePath();ctx.fillStyle=fill;ctx.fill();}else ctx.stroke();}
 for(let i=-2;i<14;i++)path([[i/12,0],[(i+1)/12,0],[(i+1)/12,1],[i/12,1]],i%2?'#5a8838':'#65943e');
 ctx.strokeStyle='#e6efe0a0';ctx.lineWidth=2;path([[0,0],[1,0],[1,1],[0,1],[0,0]]);path([[.82,0],[.82,1]]);path([[0,.22],[.15,.22],[.15,.78],[0,.78]]);const circle=[];for(let i=0;i<=80;i++){const a=i*Math.PI/40;circle.push([.82+.16*Math.cos(a),.5+.15*Math.sin(a)]);}path(circle);
 const ps=positions(w,h),r=Math.max(10,Math.min(w/65,h/25));for(const p of ps){const current=p.id===selected,target=p.id===goal;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=current?'#ef4444':'#123567';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=current?'#ffd4d4':'#b4cee7';ctx.stroke();ctx.textAlign='center';ctx.font='bold 12px sans-serif';ctx.fillStyle='#fff';ctx.fillText(p.id+1,p.x,p.y+4);if(target){ctx.save();ctx.strokeStyle='#fff';ctx.lineWidth=2.5;ctx.shadowColor='#102318';ctx.shadowBlur=3;const d=r+7,l=8;for(const sx of [-1,1])for(const sy of [-1,1]){ctx.beginPath();ctx.moveTo(p.x+sx*(d-l),p.y+sy*d);ctx.lineTo(p.x+sx*d,p.y+sy*d);ctx.lineTo(p.x+sx*d,p.y+sy*(d-l));ctx.stroke();}for(let i=0;i<4;i++){const a=i*Math.PI/2;ctx.beginPath();ctx.moveTo(p.x+Math.cos(a)*(r+4),p.y+Math.sin(a)*(r+4));ctx.lineTo(p.x+Math.cos(a)*(r+11),p.y+Math.sin(a)*(r+11));ctx.stroke();}ctx.restore();}if(current){ctx.fillStyle='#ef4444';ctx.fillRect(p.x-24,p.y-r-31,48,20);ctx.fillStyle='#fff';ctx.fillText('当前',p.x,p.y-r-17);}}
 const b=project(ball.x,ball.y,w,h);ctx.beginPath();ctx.arc(b.x,b.y,7,0,Math.PI*2);ctx.fillStyle='#080b0b';ctx.fill();ctx.strokeStyle='#eee';ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle='#102617d9';ctx.fillRect(12,12,Math.min(w-24,440),30);ctx.fillStyle='#fff';ctx.textAlign='left';ctx.font='13px sans-serif';ctx.fillText(shape+' · 准星目标 / 红色当前 · L1 切到距球最近队员',23,32);
 if(playing){const o=ps[selected];ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(o.x+v[0]*45,o.y+v[1]*45);ctx.strokeStyle='#ffffffaa';ctx.stroke();}
}
return {reset,resume,getState,positions,pick,nearest,step,draw};})();
