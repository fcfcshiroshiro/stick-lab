// Directional drills follow the user's specified sequences, relative to movement.
const Freestyle=(()=>{
  const PI=Math.PI,TAU=PI*2,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const names={mcgeady:'麦基迪',cancel:'麦基迪取消',ballroll:'ballroll转身'};
  let player,enemies,elapsed,heading,command,completed,contacts,streak,missed,invulnerable,nextCommand,count,practice,bag,rightReady,lastRight,bothBefore,message;
  const near=(a,b)=>Math.abs(wrap(a-b))<=25*PI/180;
  function reset(options={}){
    count=Math.max(1,Math.min(3,Number(options.count)||1));practice=options.practice||'mixed';player={x:0,y:0};elapsed=completed=contacts=streak=missed=invulnerable=0;heading=-PI/2;command=null;nextCommand=1.2;bag=[];rightReady=false;lastRight=null;bothBefore=false;message='左摇杆移动，准备接收花式指令';enemies=[];
    for(let i=0;i<count;i++){const a=i*TAU/count+PI/4;enemies.push({x:Math.cos(a)*.85,y:Math.sin(a)*.85,vx:0,vy:0});}
  }
  function newCommand(){
    if(!bag.length)bag=['mcgeady','cancel','ballroll'].sort(()=>Math.random()-.5);
    const type=practice==='mixed'?bag.pop():practice;
    command={type,stage:0,reference:null,age:0,stepAge:0,cancelReleased:false,cancelActivated:false};rightReady=false;lastRight=null;message='按提示操作右摇杆，同时保持移动';
  }
  function fail(text){rightReady=false;lastRight=null;streak=0;command.stage=0;command.reference=null;command.stepAge=0;command.cancelReleased=false;command.cancelActivated=false;message=text+' · 松开右杆，从第一步重做';}
  function success(){completed++;streak++;command=null;nextCommand=elapsed+1.1;message='花式完成 +1';return {type:'complete'};}
  function step(input,dt,dead=.15){
    elapsed+=dt;invulnerable=Math.max(0,invulnerable-dt);
    const l=input.left||[0,0],r=input.right||[0,0],lm=Math.hypot(...l),rm=Math.hypot(...r),both=!!input.l2&&!!input.r2;
    if(lm>dead){heading=Math.atan2(l[1],l[0]);const scale=Math.min(1,lm)/lm;player.x+=l[0]*scale*.62*dt;player.y+=l[1]*scale*.62*dt;}
    const pm=Math.hypot(player.x,player.y);if(pm>.965){player.x*=.965/pm;player.y*=.965/pm;}
    for(const e of enemies){const dx=player.x-e.x,dy=player.y-e.y,m=Math.hypot(dx,dy)||1,speed=.23+(count-1)*.025,blend=1-Math.exp(-dt/.36);e.vx+=(dx/m*speed-e.vx)*blend;e.vy+=(dy/m*speed-e.vy)*blend;e.x+=e.vx*dt;e.y+=e.vy*dt;}
    if(!invulnerable&&enemies.some(e=>Math.hypot(e.x-player.x,e.y-player.y)<.073)){
      contacts++;invulnerable=1.2;message='被追上 · 继续躲避';enemies.forEach((e,i)=>{const a=Math.atan2(player.y,player.x)+PI+i*TAU/count;e.x=Math.cos(a)*.86;e.y=Math.sin(a)*.86;e.vx=e.vy=0;});
    }
    if(!command&&elapsed>=nextCommand)newCommand();
    let event=null;
    if(command){
      command.age+=dt;command.stepAge+=dt;
      if(command.age>=7){missed++;streak=0;command=null;nextCommand=elapsed+.8;message='指令超时 · 准备下一项';}
      else{
        if(command.stage>0&&command.stepAge>(command.type==='ballroll'?.8:1.2))fail('衔接超时');
        if(command.stage===2){
          if(rm<dead){rightReady=true;lastRight=null;}
          const cancelAngle=Math.atan2(r[1],r[0]);
          const extraFlick=rm>=Math.max(.25,dead+.04)&&(rightReady||(lastRight!==null&&Math.abs(wrap(cancelAngle-lastRight))>=50*PI/180));
          if(extraFlick){fail('取消步骤不需要再次拨右杆');bothBefore=both;return null;}
          if(!both)command.cancelReleased=true;
          if(command.cancelReleased&&both&&!bothBefore)command.cancelActivated=true;
          if(command.cancelActivated&&both&&lm>dead)event=success();
        }else{
          if(rm<dead){rightReady=true;lastRight=null;}
          const angle=Math.atan2(r[1],r[0]);
          // A neutral-separated flick OR a clear new direction during a sweep.
          const fresh=rm>=Math.max(.25,dead+.04)&&(rightReady||(lastRight!==null&&Math.abs(wrap(angle-lastRight))>=50*PI/180));
          if(fresh){rightReady=false;lastRight=angle;const ref=command.reference??heading,parallel=near(angle,ref),perpendicular=near(angle,ref+PI/2)||near(angle,ref-PI/2);
            const correct=command.type==='ballroll'?(command.stage===0?perpendicular:parallel):(command.stage===0?parallel:perpendicular);
            if(!correct)fail('方向不符');
            else if(command.stage===0){command.reference=ref;command.stage=1;command.stepAge=0;message='第一步完成 · 接下一方向';}
            else if(command.type==='cancel'){command.stage=2;command.stepAge=0;command.cancelReleased=!both;message='接 L2 + R2，同时推左摇杆';}
            else event=success();
          }
        }
      }
    }
    bothBefore=both;return event;
  }
  function resume(){rightReady=false;lastRight=null;bothBefore=true;if(command){command.stage=0;command.reference=null;command.stepAge=0;command.cancelReleased=false;command.cancelActivated=false;}message='继续移动 · 花式从第一步开始';}
  const arrow=a=>['→','↘','↓','↙','←','↖','↑','↗'][((Math.round(a/(PI/4))%8)+8)%8];
  function info(){if(!command)return {name:'准备下一项',steps:[],age:0};const ref=command.reference??heading,same='右杆 '+arrow(ref),perp='右杆 '+arrow(ref+PI/2)+' / '+arrow(ref-PI/2);return {name:names[command.type],steps:command.type==='ballroll'?[perp,same]:command.type==='cancel'?[same,perp,'L2 + R2 + 左杆任意方向']:[same,perp],stage:command.stage,age:command.age};}
  function guide(){if(!command)return [];const ref=command.reference??heading;if(command.stage===2)return [];const perpendicular=command.type==='ballroll'?command.stage===0:command.stage===1;return perpendicular?[ref+PI/2,ref-PI/2]:[ref];}
  function drawGuide(ctx,w,h){if(!command)return;const radius=Math.max(42,Math.min(80,w*.115,h*.19)),cx=w-radius-22,cy=h*.5;ctx.save();ctx.globalAlpha=.5;ctx.fillStyle='#182b21';ctx.strokeStyle='#afc5ad';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,radius,0,TAU);ctx.fill();ctx.stroke();for(let i=0;i<8;i++){const a=i*PI/4;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*12,cy+Math.sin(a)*12);ctx.lineTo(cx+Math.cos(a)*radius,cy+Math.sin(a)*radius);ctx.stroke();}ctx.restore();
    for(const a of guide()){ctx.save();ctx.globalAlpha=.9;ctx.fillStyle='#d2f86b';ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,radius-2,a-25*PI/180,a+25*PI/180);ctx.closePath();ctx.fill();ctx.restore();}ctx.fillStyle='#111e17';ctx.beginPath();ctx.arc(cx,cy,12,0,TAU);ctx.fill();ctx.textAlign='center';ctx.fillStyle='#dce7d6';ctx.font='12px sans-serif';ctx.fillText('右摇杆 · 当前步骤',cx,cy-radius-16);ctx.fillText(command.stage===2?'L2 + R2 + 左杆':guide().length===2?'任选一个高亮方向':'推向高亮方向',cx,cy+radius+22);
  }
  function getState(){return {player,enemies,elapsed,heading,command,completed,contacts,streak,missed,invulnerable,message,directions:guide(),...info()};}
  function draw(ctx,w,h){const x=w/2,y=h/2,r=Math.min(w*.46,h*.43);ctx.fillStyle='#111e17';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#526d56';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();ctx.strokeStyle='#273d2c';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,r*.5,0,TAU);ctx.moveTo(x-r,y);ctx.lineTo(x+r,y);ctx.moveTo(x,y-r);ctx.lineTo(x,y+r);ctx.stroke();
    for(const e of enemies){ctx.fillStyle='#e07870';ctx.beginPath();ctx.arc(x+e.x*r,y+e.y*r,Math.max(8,r*.039),0,TAU);ctx.fill();}
    const px=x+player.x*r,py=y+player.y*r;ctx.fillStyle=invulnerable?'#b1d4ca':'#d2f86b';ctx.beginPath();ctx.arc(px,py,Math.max(7,r*.03),0,TAU);ctx.fill();ctx.strokeStyle='#eef8e2';ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+Math.cos(heading)*22,py+Math.sin(heading)*22);ctx.stroke();
    const data=info();ctx.textAlign='center';ctx.font='bold 16px sans-serif';ctx.fillStyle='#e7efdf';ctx.fillText(data.name,x,27);ctx.font='12px sans-serif';ctx.fillStyle='#afc5ad';ctx.fillText('左杆移动 · 躲避红点 · 右杆做花式',x,h-16);drawGuide(ctx,w,h);
  }
  return {reset,step,resume,getState,draw};
})();
