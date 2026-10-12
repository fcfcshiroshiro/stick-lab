const InputDevices=(()=>{
let selected=null,missing=false,error='',lastDraw=0,signature='';
function scan(){try{if(!navigator.getGamepads){error='当前浏览器未提供手柄接口，请使用新版 Chrome / Edge。';return [];}const pads=Array.from(navigator.getGamepads()).filter(p=>p&&p.connected!==false);error='';return pads;}catch(e){error='浏览器未允许读取手柄。请使用 HTTPS 页面，并在独立浏览器中打开。';return [];}}
function choose(pads){if(selected===null){const candidates=pads.filter(p=>p.axes.length>=4&&p.buttons.length>=4);if(candidates.length===1){selected={index:candidates[0].index,id:candidates[0].id};}}
const pad=selected&&pads.find(p=>p.index===selected.index&&p.id===selected.id);if(!pad&&selected)missing=true;return missing?null:pad||null;}
function select(index){const pad=scan().find(p=>p.index===index);if(!pad)return false;selected={index:pad.index,id:pad.id};missing=false;return true;}
function poll(){const pads=scan(),pad=choose(pads);render(pads,pad);return pad;}
function render(pads,pad,force=false){const dialog=document.getElementById('deviceDialog');if(!dialog?.open)return;const now=performance.now();if(!force&&now-lastDraw<100)return;lastDraw=now;
const selectBox=document.getElementById('deviceList'),sig=pads.map(p=>p.index+':'+p.id).join('|');if(sig!==signature||force){signature=sig;selectBox.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='请选择要使用的手柄';selectBox.append(placeholder);for(const p of pads){const option=document.createElement('option');option.value=p.index;option.textContent='设备 '+(p.index+1)+' · '+p.id;selectBox.append(option);}selectBox.value=pad?String(pad.index):'';}
document.getElementById('deviceStatus').textContent=error||(pad?'正在使用：'+pad.id:missing?'所选设备已断开，请重新选择设备。':pads.length?'检测到 '+pads.length+' 个设备，请手动选择。':'暂未检测到手柄：点击此页面，再按手柄上的按键。');
document.getElementById('deviceMeta').textContent=pad?'编号 '+(pad.index+1)+' · '+pad.axes.length+' 个轴 · '+pad.buttons.length+' 个按键 · '+(pad.mapping==='standard'?'标准映射':'非标准映射，可尝试下方备选映射'):'';
document.getElementById('deviceAxes').textContent=pad?pad.axes.map((a,i)=>'轴 '+i+': '+Number(a).toFixed(2)).join('   '):'等待输入';document.getElementById('deviceButtons').textContent=pad?'当前按下：'+(pad.buttons.map((b,i)=>b.pressed||b.value>.5?'B'+i:null).filter(Boolean).join('、')||'无'):'按一下按键，检查这里是否有变化';}
function open(){const d=document.getElementById('deviceDialog');d.showModal();signature='';render(scan(),choose(scan()),true);}
return {poll,select,open,scan};})();
