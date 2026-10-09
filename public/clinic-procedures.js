import * as THREE from '/vendor/three.js';
import {Reflector} from '/vendor/three.js';
import {TouchSession} from './touch-engine.js';
import {TOUCH_CASES} from './touch-cases.js';
import {forCase} from './tool-challenges.js';
import {createMedicalTool} from './tool-selector.js';
import {applyAnatomyStage,anatomyTouchTargets} from './clinic-anatomy.js';
import {showExamToolInFront} from './exam-tool-display.js';
import {SurfaceTints} from './mesh-tints.js';

const UNIT=.0032, V=(x,y,z=0)=>new THREE.Vector3((x-500)*UNIT,(325-y)*UNIT,z);
const PALETTE={skin:'#f5d8b1',wall:'#d2c5e5',tongue:'#e1b9d0',air:'#544369',lung:'#b4d9df',heart:'#e5b9c7',mint:'#aacdbd',cream:'#fff4d7'};
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.72,...extra});

// Connected Bezier contours are extruded, bevelled and curved in depth. These
// form actual shaded meshes, rather than raster/SVG objects or sphere assemblies.
function contour(path){
 const tokens=path.match(/[MLCQZ]|-?\d*\.?\d+/g),shape=new THREE.Shape();let i=0;
 const point=()=>{const p=V(Number(tokens[i++]),Number(tokens[i++]));return[p.x,p.y];};
 while(i<tokens.length){const c=tokens[i++];if(c==='M')shape.moveTo(...point());else if(c==='L')shape.lineTo(...point());else if(c==='Q')shape.quadraticCurveTo(...point(),...point());else if(c==='C')shape.bezierCurveTo(...point(),...point(),...point());else if(c==='Z')shape.closePath();else throw new Error('Unsupported contour command');}
 return shape;
}
function sculpt(path,color,depth=.2,bulge=.065){
 const g=new THREE.ExtrudeGeometry(contour(path),{depth,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:5,curveSegments:28,steps:2});
 g.computeBoundingBox();const b=g.boundingBox,p=g.attributes.position;
 for(let i=0;i<p.count;i++){const u=(p.getX(i)-b.min.x)/Math.max(.001,b.max.x-b.min.x),v=(p.getY(i)-b.min.y)/Math.max(.001,b.max.y-b.min.y);p.setZ(i,p.getZ(i)+bulge*Math.sin(Math.PI*u)*Math.sin(Math.PI*v));}
 p.needsUpdate=true;g.computeVertexNormals();const m=new THREE.Mesh(g,mat(color));m.castShadow=true;m.receiveShadow=true;return m;
}
function pipe(points,r,color){const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>V(...p))),64,r,16,false),m=new THREE.Mesh(g,mat(color));m.castShadow=true;return m;}
function dispose(root){const gs=new Set(),ms=new Set();root.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])ms.add(m);if(o.isReflector)o.getRenderTarget().dispose();});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}

export function createClinicProcedure(options){return options.caseId==='abdomen'?new PatientAbdomenProcedure(options):new ClinicProcedure(options);}
export class ClinicProcedure{
 constructor({scene,camera,renderer,caseId,anatomy=null,anchor=new THREE.Vector3(),onEvent=()=>{},onHint=()=>{},reducedMotion=false}){
  Object.assign(this,{scene,camera,renderer,onEvent,onHint,reducedMotion,anatomy});const source=TOUCH_CASES.find(c=>c.id===caseId);if(!source)throw new Error('Unknown procedure');
  this.caseId=caseId;this.data=structuredClone(source);if(caseId==='throat')this.data.targets=[{id:'upper-view',x:680,y:258,r:42,result:'거울에 위쪽 목이 비쳐 보여!'},{id:'lower-view',x:685,y:368,r:44,result:'아래쪽 목도 살펴봤어!'}];
  this.group=new THREE.Group();this.group.name='clinic-procedure-'+caseId;this.group.position.copy(anchor);scene.add(this.group);this.body=new THREE.Group();this.group.add(this.body);this.markerGroup=new THREE.Group();this.group.add(this.markerGroup);this.toolGroup=new THREE.Group();this.group.add(this.toolGroup);
  if(anatomy){for(const expanded of [false,true]){const key=expanded?'expandedTargets':'targets',mapped=anatomyTouchTargets(anatomy.metadata,expanded);if(mapped.length)this.data[key]=mapped.map(t=>({...this.data[key]?.find(old=>old.id===t.id),...t}));}}
  this.session=new TouchSession(this.data,e=>{if(e.type==='stage'){applyAnatomyStage(this.anatomy,e.stage);this.refreshTool(e.stage);}if(e.type==='check'){this.onHint(e.result);this.checkSound.play().catch(()=>{});}if(e.type==='complete')this.onHint(this.data.purpose);this.onEvent(e);});
  this.checkSound=new Audio('/assets/touch/check.wav');this.checkSound.volume=.4;this.pointer=null;this.position={x:caseId==='throat'?565:820,y:caseId==='throat'?310:465};this.travel=0;this.paused=false;this.active=false;this.elapsed=0;this.raycaster=new THREE.Raycaster();this.plane=new THREE.Plane(new THREE.Vector3(0,0,1),0);this.lastStage=null;this.buildBody();this.refreshTool(this.session.stage);this.positionTool();
  this.abort=new AbortController();const o={signal:this.abort.signal},canvas=renderer.domElement;canvas.addEventListener('pointerdown',e=>this.down(e),o);canvas.addEventListener('pointermove',e=>this.move(e),o);canvas.addEventListener('pointerup',e=>this.up(e),o);canvas.addEventListener('pointercancel',()=>this.cancel(),o);canvas.addEventListener('lostpointercapture',()=>{if(this.pointer!==null)this.cancel();},o);
 }
 add(path,color,z=0,depth=.2){const m=sculpt(path,color,depth);m.position.z=z;this.body.add(m);return m;}
 buildBody(){
  this.body.clear();const c=PALETTE,id=this.caseId;
  if(this.anatomy){this.body.add(this.anatomy.root);applyAnatomyStage(this.anatomy,this.data.stages?.[0]?.id||'play');return;}
  if(id==='throat'){
   this.add('M350 66 Q579 19 754 122 Q810 178 789 293 L780 568 L624 568 Q616 469 553 421 Q406 450 260 385 L207 351 L151 331 Q124 310 164 296 L191 280 L150 263 Q119 246 121 227 L166 212 Q194 115 279 80 Q310 65 350 66 Z',c.skin,-.32,.42);
   this.add('M173 279 Q348 224 482 240 Q557 236 582 209 Q651 180 697 236 L711 564 L650 564 Q653 444 602 397 Q495 359 260 356 L156 325 Z',c.air,.15,.06);
   this.add('M184 273 Q353 219 500 237 Q552 240 577 211 L578 255 Q572 282 551 276 Q534 270 535 251 Q370 238 198 289 Z',c.wall,.25,.2);
   this.add('M184 334 Q236 298 296 317 Q431 313 541 370 Q562 409 513 421 Q346 415 240 376 Q197 366 184 334 Z',c.tongue,.27,.24);
   this.add('M629 395 Q640 350 660 367 Q681 400 676 460 L691 565 L641 565 Q645 446 629 395 Z',c.mint,.24,.16);
   this.add('M200 266 L236 259 L237 280 L199 287 Z',c.cream,.41,.13);this.add('M200 340 L232 342 L234 361 L211 358 Z',c.cream,.41,.13);
   this.add('M669 235 Q697 232 707 260 Q706 290 680 285 Q666 265 669 235 Z',c.wall,.35,.23);
   this.add('M672 346 Q698 335 707 359 Q708 389 687 394 Q663 380 672 346 Z',c.wall,.35,.21);
  }else if(id==='stethoscope'){
   this.add('M298 140 Q281 196 218 200 L161 420 Q380 515 680 420 L620 201 Q564 194 533 140 Z',c.skin,-.1,.28);
   this.lungL=this.add('M302 174 Q212 218 229 351 Q256 388 337 358 Q362 278 323 207 Q317 183 302 174 Z',c.lung,.28,.27);
   this.lungR=this.add('M530 174 Q619 214 607 352 Q573 390 504 359 Q479 273 515 207 Q520 184 530 174 Z',c.lung,.28,.27);
   this.body.add(pipe([[415,133,.4],[415,205,.43],[315,240,.46]],.036,c.cream),pipe([[415,205,.43],[525,240,.46]],.036,c.cream));
   this.heart=this.add('M420 385 C323 327 345 254 388 263 Q411 270 420 285 Q438 244 475 262 C535 299 466 360 420 385 Z',c.heart,.57,.27);
  }else if(['vaccination','pressure','blood','oxygen'].includes(id)){
   const path=id==='oxygen'?'M180 416 Q164 340 224 288 Q265 257 306 310 L471 255 Q625 210 681 265 Q700 340 630 365 L325 440 Q260 470 180 416 Z':'M175 232 Q241 185 332 230 L654 331 Q735 362 690 435 Q675 477 610 465 L245 357 Q171 336 175 232 Z';
   this.arm=this.add(path,c.skin,0,.38);if(id==='pressure')this.body.add(pipe([[245,271,.46],[617,392,.46]],.025,c.tongue));
  }else if(id==='ear'){
   this.add('M252 155 Q155 141 140 261 Q106 330 202 371 Q216 477 314 451 Q383 445 385 344 Q471 210 350 155 Q302 135 252 155 Z',c.skin,0,.38);
   this.body.add(pipe([[262,195,.45],[202,249,.48],[250,283,.52],[278,300,.53],[246,360,.48]],.035,c.wall));
   this.body.add(pipe([[299,325,.31],[386,343,.27],[459,316,.25],[536,285,.2]],.11,c.wall));
   this.add('M538 235 Q571 250 573 285 Q575 324 542 334 Q526 289 538 235 Z',c.lung,.39,.15);
  }else if(id==='nose'){
   this.add('M400 130 Q285 175 270 315 Q180 390 310 435 Q390 470 450 425 Q525 470 610 430 Q715 385 620 305 Q600 170 485 130 Z',c.skin,0,.37);
   this.add('M333 249 Q284 295 297 391 Q337 448 369 390 Q374 315 356 269 Q345 247 333 249 Z',c.wall,.38,.16);
   this.add('M519 247 Q477 307 488 392 Q525 443 557 390 Q568 309 539 266 Q529 246 519 247 Z',c.wall,.38,.16);
   this.body.add(pipe([[450,212,.55],[450,384,.55]],.037,c.cream));
  }else if(id==='temperature'){
   this.add('M220 430 L220 300 Q220 155 445 145 Q665 155 665 300 L665 430 Z',c.skin,0,.37);
   this.add('M230 197 Q274 124 435 145 Q555 105 648 198 Q535 182 443 203 Q315 184 230 197 Z',c.cream,.45,.23);
  }else if(id==='abdomen'){
   this.add('M305 125 Q300 185 215 195 Q146 330 226 491 Q445 550 651 491 Q740 345 650 195 Q585 185 565 125 Z',c.skin,0,.4);
   this.add('M423 340 Q439 334 445 350 Q443 367 425 365 Q417 354 423 340 Z',c.cream,.43,.025);
  }
 }
 refreshTool(stage){
  if(this.lastStage===stage)return;this.cancel();dispose(this.toolGroup);this.toolGroup.clear();this.lastStage=stage;
  if(this.caseId==='throat'){
   const m=mat('#c8d5df',{metalness:.88,roughness:.2});const rod=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,1.48,24),m);rod.rotation.z=Math.PI/2;rod.position.set(-.74,0,.46);this.toolGroup.add(rod);
   const grip=new THREE.Mesh(new THREE.CylinderGeometry(.038,.044,.31,24),m);grip.rotation.z=Math.PI/2;grip.position.set(-1.35,0,.46);this.toolGroup.add(grip);
   this.mirror=new Reflector(new THREE.CircleGeometry(.086,48),{textureWidth:512,textureHeight:512,color:0xd6dbe0});this.mirror.position.set(0,0,.46);this.mirror.rotation.y=Math.PI/4;this.toolGroup.add(this.mirror);
   const rim=new THREE.Mesh(new THREE.TorusGeometry(.087,.012,12,48),m);rim.position.copy(this.mirror.position);rim.rotation.copy(this.mirror.rotation);this.toolGroup.add(rim);
  }else{
   const byStage={wipe:'cotton',observe:'cotton',bandage:'bandage',position:'cuff',pump:'cuff',sample:'tube',inspect:'magnifier'};const model=createMedicalTool(byStage[stage]||forCase(this.caseId).correctToolId);const wrapper=new THREE.Group();wrapper.add(model);wrapper.scale.setScalar(.42);const box=new THREE.Box3().setFromObject(wrapper),center=box.getCenter(new THREE.Vector3());model.position.sub(center.clone().divideScalar(.42));this.toolGroup.add(wrapper);this.toolGroup.position.z=.75;
  }
  showExamToolInFront(this.toolGroup);this.toolMeshes=[];this.toolGroup.traverse(o=>{if(o.isMesh)this.toolMeshes.push(o);});
 }
 get contact(){if(this.caseId!=='throat')return{...this.position};const a=(this.position.y-310)*1.15*Math.PI/180;return{x:this.position.x+122*Math.cos(a),y:this.position.y+122*Math.sin(a)};}
 positionTool(){const p=V(this.position.x,this.position.y,this.caseId==='throat'?0:.78);this.toolGroup.position.copy(p);if(this.mirror)this.mirror.rotation.x=(this.position.y-310)*.014;}
 begin(){this.active=true;this.onHint(this.caseId==='throat'?'거울 손잡이를 위아래로 살짝 움직여 볼까?':this.data.hint);}
 pointerRay(e){const r=this.renderer.domElement.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);}
 pointerPoint(e){this.pointerRay(e);const normal=new THREE.Vector3(0,0,1).applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion())),origin=this.group.localToWorld(new THREE.Vector3(0,0,.75));this.plane.setFromNormalAndCoplanarPoint(normal,origin);const p=this.raycaster.ray.intersectPlane(this.plane,new THREE.Vector3());if(!p)return null;this.group.worldToLocal(p);return{x:p.x/UNIT+500,y:325-p.y/UNIT};}
 down(e){if(!this.active||this.paused||this.pointer!==null||e.button>0)return;this.pointerRay(e);if(!this.raycaster.intersectObjects(this.toolMeshes,false).length)return;const p=this.pointerPoint(e);if(!p)return;this.pointer=e.pointerId;this.offset={x:p.x-this.position.x,y:p.y-this.position.y};this.renderer.domElement.setPointerCapture(e.pointerId);this.session.begin();this.session.update({point:this.contact,held:true,dt:0});e.preventDefault();}
 move(e){if(e.pointerId!==this.pointer||this.paused)return;const p=this.pointerPoint(e);if(!p)return;const old=this.contact;this.position={x:Math.max(this.caseId==='throat'?530:120,Math.min(this.caseId==='throat'?615:910,p.x-this.offset.x)),y:Math.max(this.caseId==='throat'?275:100,Math.min(this.caseId==='throat'?346:570,p.y-this.offset.y))};this.positionTool();this.travel+=Math.hypot(old.x-this.contact.x,old.y-this.contact.y);e.preventDefault();}
 up(e){if(e.pointerId!==this.pointer)return;this.session.update({point:this.contact,held:false,dt:0});this.pointer=null;}
 cancel(){this.pointer=null;this.travel=0;this.session?.cancel();}
 update(dt){if(!this.active||this.paused)return;this.elapsed+=dt;if(this.pointer!==null){this.session.update({point:this.contact,held:true,dt:Math.min(100,dt*1000),distance:this.travel});this.travel=0;}
  if(this.heart)this.heart.scale.setScalar(1+Math.sin(this.elapsed*6)*.02);if(this.lungL){this.lungL.scale.x=1+Math.sin(this.elapsed*2.4)*.012;this.lungR.scale.x=this.lungL.scale.x;}
  const s=this.session.snapshot();if(s.stage!==this.lastStage){this.refreshTool(s.stage);this.positionTool();this.onHint(this.data.stages?.find(v=>v.id===s.stage)?.hint||this.data.hint);}
  if(!this.anatomy&&this.caseId==='blood'&&s.stage==='inspect'&&!this.cellsBuilt){this.cellsBuilt=true;dispose(this.body);this.body.clear();const colors=[PALETTE.heart,PALETTE.lung,PALETTE.wall];this.data.expandedTargets.forEach((t,i)=>{const r=i===2?18:43;this.add(`M${t.x-r} ${t.y} Q${t.x-r} ${t.y-r} ${t.x} ${t.y-r} Q${t.x+r} ${t.y-r} ${t.x+r} ${t.y} Q${t.x+r} ${t.y+r} ${t.x} ${t.y+r} Q${t.x-r} ${t.y+r} ${t.x-r} ${t.y} Z`,colors[i],.3,.16);});}
  const key=s.checked.join('|');if(key!==this.markerKey){this.markerKey=key;dispose(this.markerGroup);this.markerGroup.clear();for(const id of s.checked){const target=[...this.data.targets,...(this.data.expandedTargets||[])].find(t=>t.id===id);if(target)this.markerGroup.add(pipe([[target.x-13,target.y,.68],[target.x-3,target.y+11,.68],[target.x+20,target.y-17,.68]],.012,'#509376'));}}
 }
 setPaused(value){this.paused=value;this.session.setPaused(value);if(value)this.cancel();}
 get snapshot(){
  const r=this.renderer.domElement.getBoundingClientRect(),screen=(x,y,z=.75)=>{const p=this.group.localToWorld(V(x,y,z)).project(this.camera);return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};};
  const metadata=this.anatomy?.metadata,rules=metadata?(Array.isArray(metadata.stages)?metadata.stages:Object.values(metadata.stages||{})):[];
  const names=new Set([...(metadata?.default_show_nodes||[]),...(metadata?.default_hide_nodes||[]),...rules.flatMap(rule=>[...(rule?.show_nodes||[]),...(rule?.hide_nodes||[])])]);
  const nodeVisibility=Object.fromEntries([...names].map(name=>[name,this.anatomy.root.getObjectByName(name)?.visible??null]));
  return{...this.session.snapshot(),mode:'3d-'+this.caseId,tool:{...this.position},contact:this.contact,pickPoint:screen(this.position.x,this.position.y,.8),targets:this.data.targets,
   targetPickPoints:this.data.targets.map(t=>({id:t.id,...screen(t.x,t.y)})),expandedTargetPickPoints:(this.data.expandedTargets||[]).map(t=>({id:t.id,...screen(t.x,t.y)})),
   anatomy:this.anatomy?{url:this.anatomy.url,stage:this.session.stage,nodeVisibility}:null,meshCount:this.body.children.length};
 }
 destroy(){this.active=false;this.abort.abort();this.checkSound.pause();dispose(this.group);this.group.removeFromParent();}
}

// Palpation familiarization on the same rigged patient. The character is owned
// by the clinic; this game never clones, reparents, disposes or reshapes it.
export class PatientAbdomenProcedure {
 constructor({scene,camera,renderer,patient,patientMeshes,heldTool,regions,onEvent=()=>{},onHint=()=>{},reducedMotion=false}) {
  if(!patient)throw new Error('복부 진찰에는 진료실 환자 모형이 필요해요.');
  Object.assign(this,{scene,camera,renderer,patient,heldTool,onEvent,onHint,reducedMotion});
  this.meshes=patientMeshes?.length?[...patientMeshes]:[];if(!this.meshes.length)patient.traverse(o=>{if(o.isMesh)this.meshes.push(o);});
  patient.visible=true;patient.updateMatrixWorld(true);patient.traverse(o=>{if(o.isSkinnedMesh)o.computeBoundingBox();});
  const bounds=new THREE.Box3().setFromObject(patient),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());this.height=size.y;
  const base=regions?.abdomen?.clone()||new THREE.Vector3(center.x,bounds.min.y+size.y*.40,center.z);
  // The seated Body bone sits near the garment hem; raise the patch cluster so
  // its lower middle press stays on the torso, above the seated upper legs.
  base.y+=size.y*.045;
  this.target=this.surface(base)?.point.clone()||base;
  const definitions=[['abdomen-left',-size.x*.13,0,'배 한쪽'],['abdomen-middle',0,-size.y*.045,'배 가운데'],['abdomen-right',size.x*.13,0,'배 다른 쪽']];
  this.sites=definitions.map(([id,x,y,name])=>{const raw=this.target.clone().add(new THREE.Vector3(x,y,0)),hit=this.surface(raw);if(!hit)throw new Error('환자의 배 표면 위치를 확인해 주세요.');return{id,name,point:hit.point.clone(),radius:Math.max(.045,size.x*.070)};});
  for(const site of this.sites){const nearest=Math.min(...this.sites.filter(v=>v!==site).map(v=>Math.hypot(v.point.x-site.point.x,v.point.y-site.point.y)));site.radius=Math.min(site.radius,nearest*.43);}
  this.group=new THREE.Group();this.group.name='patient-abdomen-exam';scene.add(this.group);
  this.toolGroup=new THREE.Group();this.group.add(this.toolGroup);this.model=createMedicalTool('hand');this.toolGroup.add(this.model);
  const toolSize=new THREE.Box3().setFromObject(this.model).getSize(new THREE.Vector3());this.toolGroup.scale.setScalar(size.y*.13/Math.max(toolSize.x,toolSize.y,toolSize.z));
  this.group.updateMatrixWorld(true);
  const point=this.model.userData.contact?.clone()||new THREE.Vector3(0,.2,0),grip=this.model.userData.grip?.clone()||new THREE.Vector3();
  this.tipOffset=this.model.localToWorld(point).sub(this.toolGroup.getWorldPosition(new THREE.Vector3()));
  this.gripOffset=this.model.localToWorld(grip).sub(this.toolGroup.getWorldPosition(new THREE.Vector3()));
  this.home=this.target.clone().add(new THREE.Vector3(size.x*.38,-size.y*.06,.16));this.contact=this.home.clone();this.setContact(this.home,false);
  showExamToolInFront(this.toolGroup);this.toolMeshes=[];this.toolGroup.traverse(o=>{if(o.isMesh)this.toolMeshes.push(o);});
  this.ray=new THREE.Raycaster();this.plane=new THREE.Plane(new THREE.Vector3(0,0,1),-this.home.z);this.tints=new SurfaceTints(patient);
  this.data=structuredClone(TOUCH_CASES.find(c=>c.id==='abdomen'));this.data.hint='밝아진 배에 손을 살짝 대고, 잠깐 누른 뒤 떼 볼까?';
  this.data.targets=this.sites.map(s=>({id:s.id,name:s.name,x:s.point.x/UNIT,y:s.point.y/UNIT,r:s.radius/UNIT,result:'선생님은 배에 불편한 곳이 있는지 살펴봐요.'}));
  this.checkSound=new Audio('/assets/touch/check.wav');this.checkSound.volume=.3;
  this.session=new TouchSession(this.data,e=>{if(e.type==='check'){this.checkSound.play().catch(()=>{});const next=this.sites.find(s=>!this.session.checked.has(s.id));this.onHint(next?'좋아! 다른 밝은 곳에도 손을 살짝 대 볼까?':'배를 살살 살펴봤어. 불편한 곳은 선생님께 알려줘.');}if(e.type==='complete')this.onHint('배를 살살 살펴봤어. 불편한 곳은 선생님께 알려줘.');this.onEvent({...e,assessment:'not_assessed'});});
  this.active=false;this.paused=false;this.pointer=null;this.onBody=false;this.travel=0;this.pressLevel=0;
  if(heldTool){this.heldToolWasVisible=heldTool.visible;heldTool.visible=false;}
  this.abort=new AbortController();const opts={signal:this.abort.signal},canvas=renderer.domElement;
  canvas.addEventListener('pointerdown',e=>this.down(e),opts);canvas.addEventListener('pointermove',e=>this.move(e),opts);canvas.addEventListener('pointerup',e=>this.up(e),opts);canvas.addEventListener('pointercancel',()=>this.cancel(),opts);canvas.addEventListener('lostpointercapture',()=>{if(this.pointer!==null)this.cancel();},opts);this.refreshTint();
 }
 surface(p){return new THREE.Raycaster(new THREE.Vector3(p.x,p.y,p.z+8),new THREE.Vector3(0,0,-1)).intersectObjects(this.meshes,false)[0]||null;}
 setContact(point,onBody){this.contact.copy(point);this.onBody=onBody;this.toolGroup.position.copy(point).sub(this.tipOffset);if(onBody)this.toolGroup.position.z+=.012;}
 rayFrom(e){const r=this.renderer.domElement.getBoundingClientRect();this.ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);}
 pointerPoint(e){this.rayFrom(e);return this.ray.ray.intersectPlane(this.plane,new THREE.Vector3());}
 get pixelContact(){return this.onBody?{x:this.contact.x/UNIT,y:this.contact.y/UNIT}:{x:100000,y:100000};}
 begin(){this.active=true;if(this.heldTool)this.heldTool.visible=false;this.onHint(this.data.hint);}
 down(e){if(!this.active||this.paused||this.session.complete||this.pointer!==null||e.button>0)return;this.rayFrom(e);const toolHit=this.ray.intersectObjects(this.toolMeshes,false)[0],bodyHit=this.ray.intersectObjects(this.meshes,false)[0];
  if(!toolHit&&!bodyHit)return;const p=this.pointerPoint(e);if(!p)return;
  if(!toolHit){const near=this.sites.some(s=>Math.hypot(bodyHit.point.x-s.point.x,bodyHit.point.y-s.point.y)<s.radius*1.5&&Math.abs(bodyHit.point.z-s.point.z)<.18);if(!near)return;this.setContact(bodyHit.point,true);}
  this.pointer=e.pointerId;this.offset=p.clone().sub(this.contact);this.renderer.domElement.setPointerCapture(e.pointerId);this.session.begin();this.session.update({point:this.pixelContact,held:true,dt:0});e.preventDefault();
 }
 move(e){if(e.pointerId!==this.pointer||this.paused)return;const p=this.pointerPoint(e);if(!p)return;p.sub(this.offset);const before=this.contact.clone(),hit=this.surface(p);this.setContact(hit?.point||p,!!hit);this.travel+=before.distanceTo(this.contact)/UNIT;e.preventDefault();}
 up(e){if(e.pointerId!==this.pointer)return;this.session.update({point:this.pixelContact,held:false,dt:0});const id=this.pointer;this.pointer=null;if(this.renderer.domElement.hasPointerCapture?.(id)){try{this.renderer.domElement.releasePointerCapture(id);}catch{}}this.travel=0;this.pressLevel=0;this.refreshTint();}
 cancel(){const id=this.pointer;this.pointer=null;this.session.cancel();this.travel=0;this.pressLevel=0;this.onBody=false;if(id!==null&&this.renderer.domElement.hasPointerCapture?.(id)){try{this.renderer.domElement.releasePointerCapture(id);}catch{}}this.setContact(this.home,false);this.refreshTint();}
 update(dt){if(!this.active||this.paused)return;if(this.pointer!==null){this.session.update({point:this.pixelContact,held:true,dt:Math.min(100,Math.max(0,dt)*1000),distance:this.travel});this.travel=0;}const state=this.session.snapshot();this.pressLevel=this.pointer===null?0:Math.min(1,state.dwell/450);if(this.onBody&&!this.reducedMotion)this.toolGroup.position.z=this.contact.z-this.tipOffset.z+.012-this.pressLevel*.006;this.refreshTint();}
 refreshTint(){if(!this.tints)return;this.tints.setPatches(this.sites.map(s=>({position:s.point,radius:s.radius,color:this.session?.checked.has(s.id)?'#62b68c':'#ffd58a',strength:.85+(this.session?.dwellTarget===s.id?this.pressLevel*.1:0)})));}
 setPaused(value){this.paused=!!value;this.session.setPaused(value);if(value){this.cancel();this.checkSound.pause();}}
 screen(p){const v=p.clone().project(this.camera),r=this.renderer.domElement.getBoundingClientRect();return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};}
 get snapshot(){const state=this.session.snapshot();return{...state,mode:'3d-abdomen',patientBased:true,patientVisible:this.patient.visible,active:this.active,anatomy:null,assessment:'not_assessed',clinicalReading:null,meshCount:this.meshes.length,pickPoint:this.screen(this.toolGroup.position.clone().add(this.gripOffset)),contact:this.contact.toArray(),onBody:this.onBody,pressLevel:this.pressLevel,targets:this.sites.map(s=>({id:s.id,name:s.name,point:s.point.toArray(),radius:s.radius,pickPoint:this.screen(s.point)})),targetPickPoints:this.sites.map(s=>({id:s.id,...this.screen(s.point)})),expandedTargetPickPoints:[]};}
 destroy(){this.active=false;this.cancel();this.abort.abort();this.checkSound.pause();this.tints.dispose();if(this.heldTool)this.heldTool.visible=this.heldToolWasVisible;dispose(this.group);this.group.removeFromParent();}
}
