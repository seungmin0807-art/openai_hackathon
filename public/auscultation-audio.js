// Locally synthesized teaching examples, not clinical recordings or diagnoses.
const HEART_BEAT=.74;
const CYCLES={heart:HEART_BEAT*4,breath:2.8,bowel:2.8};
const GURGLES=[[.05,230,85,.26],[.44,140,310,.2],[.77,260,95,.32],[1.5,170,340,.24],[2.15,240,95,.29]];
const bump=(time,center,width)=>Math.exp(-Math.pow((time-center)/width,2));

/** The same timing drives sound and the patient's material, never a diagnosis. */
export function auscultationEnvelope(kind,elapsed){
 if(!Number.isFinite(elapsed)||elapsed<0||!CYCLES[kind])return 0;
 const t=elapsed%CYCLES[kind];
 if(kind==='heart'){const beat=t%HEART_BEAT;return Math.min(1,bump(beat,.035,.065)+.72*bump(beat,.245,.055));}
 if(kind==='breath')return Math.max(0,t<1.3?Math.sin(t/1.3*Math.PI):Math.sin((t-1.3)/1.5*Math.PI)*.7);
 return Math.min(1,Math.max(...GURGLES.map(([start,,,duration])=>t<start||t>start+duration?0:Math.sin((t-start)/duration*Math.PI))));
}

export class AuscultationAudio{
 constructor(){this.nodes=[];this.kind=null;this.cyclesStarted=0;}
 async unlock(){try{this.context??=new AudioContext();await this.context.resume();return this.context.state==='running';}catch{return false;}}
 stop(){for(const n of this.nodes){try{n.stop();}catch{}try{n.disconnect();}catch{}}this.nodes=[];this.kind=null;this.startedAt=null;this.until=0;}
 play(kind){
  const c=this.context;if(!CYCLES[kind]||!c||c.state!=='running')return false;
  if(this.kind===kind&&c.currentTime<this.until)return true;
  this.stop();this.kind=kind;const start=c.currentTime;this.startedAt=start;this.until=start+CYCLES[kind];this.cyclesStarted++;
  const tone=(hz,time,duration,volume=.11,end=hz)=>{const s=c.createOscillator(),g=c.createGain();s.type='sine';s.frequency.setValueAtTime(hz,time);s.frequency.exponentialRampToValueAtTime(end,time+duration);g.gain.setValueAtTime(.0001,time);g.gain.exponentialRampToValueAtTime(volume,time+.018);g.gain.exponentialRampToValueAtTime(.0001,time+duration);s.connect(g);g.connect(c.destination);s.start(time);s.stop(time+duration+.01);this.nodes.push(s,g);};
  if(kind==='heart'){
   // Retain the low double beat while adding its upper harmonics. The previous
   // 44–82 Hz fundamentals largely vanished through a small-speaker band.
   const beat=(hz,time,duration,volume,end)=>{tone(hz,time,duration,volume,end);for(const [n,gain]of [[2,.35],[3,.65],[4,.55],[5,.35],[6,.22]])tone(hz*n,time,duration,volume*gain,end*n);};
   for(let i=0;i<4;i++){beat(82,start+i*HEART_BEAT,.18,.14,48);beat(67,start+i*HEART_BEAT+.21,.17,.11,44);}
  }else if(kind==='breath'){
   const length=CYCLES.breath,b=c.createBuffer(1,Math.ceil(c.sampleRate*length),c.sampleRate),a=b.getChannelData(0);let brown=0;
   for(let i=0;i<a.length;i++){brown=.94*brown+(Math.random()*2-1)*.07;a[i]=brown*auscultationEnvelope('breath',i/c.sampleRate);}
   const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=b;f.type='bandpass';f.frequency.value=620;f.Q.value=.65;g.gain.value=.55;s.connect(f);f.connect(g);g.connect(c.destination);s.start(start);this.nodes.push(s,f,g);
  }else GURGLES.forEach(([t,hz,end,d])=>{tone(hz,start+t,d,.16,end);tone(hz*2,start+t,d,.064,end*2);tone(hz*3,start+t,d,.024,end*3);});
  return true;
 }
 get feedback(){const playing=!!this.kind&&this.context?.state==='running'&&this.context.currentTime<this.until,elapsed=playing?this.context.currentTime-this.startedAt:0;return{kind:this.kind,playing,phase:playing?elapsed/CYCLES[this.kind]:0,level:playing?auscultationEnvelope(this.kind,elapsed):0,cyclesStarted:this.cyclesStarted};}
 destroy(){this.stop();this.context?.close().catch(()=>{});}
}
