import * as THREE from '/vendor/three.js';
import {createMedicalTool} from './tool-selector.js';
import {SurfaceTints} from './mesh-tints.js';
import {showExamToolInFront} from './exam-tool-display.js';

const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
// Digital contact thermometer preparation, not a measured clinical value.
// https://www.nhs.uk/baby/health/how-to-take-your-babys-temperature/
export class TemperatureGame {
  constructor({scene,camera,renderer,patient,patientMeshes,heldTool,regions,onHint=()=>{},onEvent=()=>{}}){
    Object.assign(this,{scene,camera,renderer,patient,heldTool,onHint,onEvent});if(heldTool)heldTool.visible=false;
    this.meshes=patientMeshes||[];if(!this.meshes.length)patient.traverse(o=>{if(o.isMesh)this.meshes.push(o);});
    patient.visible=true;patient.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(patient),size=bounds.getSize(V()),center=bounds.getCenter(V());this.height=size.y;
    const arms={};patient.traverse(o=>{if(!o.isBone)return;if(/upperarm[._]?l|leftupperarm|leftarm/i.test(o.name))arms.left=o;if(/upperarm[._]?r|rightupperarm|rightarm/i.test(o.name))arms.right=o;});
    this.radius=size.y*.065;
    this.targets=['left','right'].map((side,index)=>{
      const raw=arms[side]?arms[side].getWorldPosition(V()):regions.chest.clone().add(V(size.x*.24*(index? -1:1),0,0));
      raw.x=THREE.MathUtils.lerp(raw.x,center.x,.20);raw.y-=size.y*.025;
      // Match each actual visible skin/clothing surface, not a screen overlay.
      return{id:`axillary-temperature-${side}`,side,point:this.surface(raw)?.point.clone()||raw};
    });
    this.target=this.targets[0].point; // Existing camera/home integrations use this anchor.
    this.group=new THREE.Group();this.group.name='patient-temperature';scene.add(this.group);
    this.tool=new THREE.Group();this.model=createMedicalTool('thermometer');this.tool.add(this.model);this.group.add(this.tool);
    const toolSize=new THREE.Box3().setFromObject(this.model).getSize(V());this.tool.scale.setScalar(size.y*.18/Math.max(toolSize.x,toolSize.y,toolSize.z));
    this.tool.rotation.z=-Math.PI/2;this.tool.updateMatrixWorld(true);
    this.tip=this.model.userData.contact?.clone()||V(0,.68,0);this.grip=this.model.userData.grip?.clone()||V();
    this.tipOffset=this.tool.worldToLocal(this.model.localToWorld(this.tip.clone())).multiply(this.tool.scale);
    this.gripOffset=this.tool.worldToLocal(this.model.localToWorld(this.grip.clone())).multiply(this.tool.scale);
    this.home=this.target.clone().add(V(-size.y*.22,-size.y*.075,.12));
    this.homePosition=this.home.clone().sub(this.tipOffset.clone().applyQuaternion(this.tool.quaternion));this.tool.position.copy(this.homePosition);
    this.contact=this.home.clone();this.ray=new THREE.Raycaster();this.plane=new THREE.Plane(V(0,0,1),-this.home.z);
    showExamToolInFront(this.tool);this.toolMeshes=[];this.tool.traverse(o=>{if(o.isMesh)this.toolMeshes.push(o);});
    this.tints=new SurfaceTints(patient);this.active=false;this.paused=false;this.complete=false;this.pointer=null;this.dwell=0;this.holdStarted=null;this.holdSite=null;this.checkedSite=null;this.onBody=false;
    this.checkAudio=new Audio('/assets/touch/check.wav');this.checkAudio.volume=.3;
    this.abort=new AbortController();const opts={signal:this.abort.signal},canvas=renderer.domElement;
    canvas.addEventListener('pointerdown',e=>this.down(e),opts);canvas.addEventListener('pointermove',e=>this.move(e),opts);canvas.addEventListener('pointerup',e=>{if(e.pointerId===this.pointer)this.cancel();},opts);canvas.addEventListener('pointercancel',()=>this.cancel(),opts);canvas.addEventListener('lostpointercapture',()=>{if(this.pointer!==null)this.cancel();},opts);
    this.refresh();
  }
  surface(p){return new THREE.Raycaster(p.clone().add(V(0,0,8)),V(0,0,-1)).intersectObjects(this.meshes,false)[0]||null;}
  rayFrom(e){const r=this.renderer.domElement.getBoundingClientRect();this.ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);}
  point(e){this.rayFrom(e);return this.ray.ray.intersectPlane(this.plane,V());}
  begin(){this.active=true;if(this.heldTool)this.heldTool.visible=false;this.onHint('체온계 끝을 겨드랑이에 살짝 대 볼까?');}
  down(e){if(!this.active||this.paused||this.complete||this.pointer!==null||e.button>0)return;this.rayFrom(e);if(!this.ray.intersectObjects(this.toolMeshes,false).length)return;const p=this.point(e);if(!p)return;this.pointer=e.pointerId;this.offset=p.clone().sub(this.tool.position);this.renderer.domElement.setPointerCapture(e.pointerId);e.preventDefault();}
  move(e){if(e.pointerId!==this.pointer||this.paused)return;const p=this.point(e);if(!p)return;this.tool.position.copy(p.sub(this.offset));this.contact.copy(this.tool.position).add(this.tipOffset.clone().applyQuaternion(this.tool.quaternion));const hit=this.surface(this.contact);this.onBody=!!hit;if(hit){this.contact.copy(hit.point);this.tool.position.z=this.contact.z+.018-this.tipOffset.clone().applyQuaternion(this.tool.quaternion).z;}if(this.siteAtContact()?.id!==this.holdSite){this.holdStarted=null;this.holdSite=null;this.dwell=0;}e.preventDefault();}
  siteAtContact(){if(this.pointer===null||!this.onBody)return null;return this.targets.filter(site=>Math.hypot(this.contact.x-site.point.x,this.contact.y-site.point.y)<this.radius&&Math.abs(this.contact.z-site.point.z)<.18).sort((a,b)=>this.contact.distanceToSquared(a.point)-this.contact.distanceToSquared(b.point))[0]||null;}
  atTarget(){return!!this.siteAtContact();}
  cancel(){const id=this.pointer;this.pointer=null;if(id!==null&&this.renderer.domElement.hasPointerCapture?.(id)){try{this.renderer.domElement.releasePointerCapture(id);}catch{}}this.dwell=0;this.holdStarted=null;this.holdSite=null;this.onBody=false;if(!this.complete){this.tool.position.copy(this.homePosition);this.contact.copy(this.home);}}
  update(){if(!this.active||this.paused||this.complete)return;const site=this.siteAtContact();if(site){const now=performance.now();if(this.holdSite!==site.id||this.holdStarted===null){this.holdSite=site.id;this.holdStarted=now;this.dwell=0;}this.dwell=(now-this.holdStarted)/1000;if(this.dwell>=1.6){this.complete=true;this.checkedSite=site.id;this.cancel();this.checkAudio.play().catch(()=>{});this.onHint('삐! 체온계는 몸의 온도를 재는 거야.');this.onEvent({type:'check',targetId:site.id,assessment:'not_assessed'});this.onEvent({type:'complete',checked:[site.id]});}}else{this.holdStarted=null;this.holdSite=null;this.dwell=0;}this.refresh();}
  refresh(){this.tints.setPatches(this.targets.map(site=>({position:site.point,radius:this.radius,color:this.checkedSite===site.id?'#b3d7bd':'#fff0c7',strength:.52+(this.holdSite===site.id?Math.min(1,this.dwell/1.6)*.18:0)})));}
  setPaused(value){this.paused=!!value;if(value){this.cancel();this.checkAudio.pause();}}
  screen(p){const v=p.clone().project(this.camera),r=this.renderer.domElement.getBoundingClientRect();return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};}
  get snapshot(){const grip=this.gripOffset.clone().applyQuaternion(this.tool.quaternion),tip=this.tipOffset.clone().applyQuaternion(this.tool.quaternion);return{mode:'3d-temperature',active:this.active,paused:this.paused,complete:this.complete,held:this.pointer!==null,dwell:this.dwell,holdSite:this.holdSite,patientVisible:this.patient.visible,checked:this.checkedSite?[this.checkedSite]:[],pickPoint:this.screen(this.tool.position.clone().add(grip)),dropPoint:this.screen(this.target.clone().add(grip).sub(tip)),targets:this.targets.map(site=>({id:site.id,side:site.side,pickPoint:this.screen(site.point),dropPoint:this.screen(site.point.clone().add(grip).sub(tip)),point:site.point.toArray()})),assessment:'not_assessed',clinicalReading:null};}
  destroy(){this.active=false;this.cancel();this.abort.abort();this.checkAudio.pause();this.tints.dispose();if(this.heldTool)this.heldTool.visible=true;const gs=new Set(),ms=new Set();this.group.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])ms.add(m);});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());this.group.removeFromParent();}
}
