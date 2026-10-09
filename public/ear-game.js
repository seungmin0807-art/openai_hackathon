import * as THREE from '/vendor/three.js';
import {createMedicalTool} from './tool-selector.js';

// Symbolic ear examination: an otoscope's light lets a clinician look at the
// canal and eardrum (NIDCD, https://www.nidcd.nih.gov/health/ear-infections-children).
// This cutaway is teaching art, not standard anatomy or an insertion protocol.
const V=(x,y,z=0)=>new THREE.Vector3(x,y,z);
const clamp=THREE.MathUtils.clamp;
const material=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.76,...options});
function dispose(root){const gs=new Set(),ms=new Set();root.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])ms.add(m);});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
function smoothSculpt(source,deform){
 // Densify cap triangles before curving them, then weld the seam positions.
 // Merely changing shading would leave broad planar facets on the ear surface.
 let triangles=[];const p=source.attributes.position,indices=source.index?.array;
 for(let i=0;i<(indices?.length||p.count);i+=3)triangles.push([0,1,2].map(j=>V().fromBufferAttribute(p,indices?indices[i+j]:i+j)));
 for(let round=0;round<2;round++){const next=[];for(const [a,b,c]of triangles){const ab=a.clone().lerp(b,.5),bc=b.clone().lerp(c,.5),ca=c.clone().lerp(a,.5);next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}triangles=next;}
 const vertices=[],faces=[],weld=new Map();for(const tri of triangles)for(const original of tri){const vertex=original.clone();deform(vertex);const key=vertex.toArray().map(n=>Math.round(n*1e6)).join(',');if(!weld.has(key)){weld.set(key,vertices.length/3);vertices.push(...vertex.toArray());}faces.push(weld.get(key));}
 const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));result.setIndex(faces);result.computeVertexNormals();source.dispose();return result;
}
function canal(radius=.12){
 // A single thick curved shell with a camera-facing cutaway; all inner/outer
 // walls, lip edges and end rims share topology. No toggled tissue layers.
 const curve=new THREE.CatmullRomCurve3([V(-.55,-.02,.015),V(-.32,.025,-.025),V(0,.04,-.065),V(.26,.015,-.05),V(.52,0,0)]),rings=56,radial=28,positions=[],indices=[],inner=radius,outer=radius*1.23;
 const points=[];for(let i=0;i<=rings;i++){const u=i/rings,c=curve.getPointAt(u),t=curve.getTangentAt(u).normalize(),up=V(0,1,0).addScaledVector(t,-t.y).normalize(),depth=t.clone().cross(up).normalize();points.push({c,up,depth});
  for(const r of [inner,outer])for(let j=0;j<=radial;j++){const a=Math.PI+j/radial*Math.PI,p=c.clone().addScaledVector(up,Math.cos(a)*r).addScaledVector(depth,Math.sin(a)*r);positions.push(...p.toArray());}}
 const n=2*(radial+1),idx=(i,wall,j)=>i*n+wall*(radial+1)+j,quad=(a,b,c,d)=>indices.push(a,b,d,b,c,d);
 for(let i=0;i<rings;i++){for(let j=0;j<radial;j++){quad(idx(i,0,j),idx(i+1,0,j),idx(i+1,0,j+1),idx(i,0,j+1));quad(idx(i,1,j+1),idx(i+1,1,j+1),idx(i+1,1,j),idx(i,1,j));}for(const j of [0,radial])quad(idx(i,0,j),idx(i,1,j),idx(i+1,1,j),idx(i+1,0,j));}
 for(const i of [0,rings])for(let j=0;j<radial;j++)quad(idx(i,0,j),idx(i,0,j+1),idx(i,1,j+1),idx(i,1,j));
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();const m=new THREE.Mesh(g,material('#b6a4bf',{side:THREE.DoubleSide}));m.receiveShadow=true;m.castShadow=true;return m;
}
function eardrum(){
 const s=new THREE.Shape();s.moveTo(-.10,-.26);s.bezierCurveTo(-.28,-.19,-.24,.18,-.04,.26);s.bezierCurveTo(.20,.27,.27,-.16,.10,-.26);s.quadraticCurveTo(0,-.30,-.10,-.26);
 const g=smoothSculpt(new THREE.ExtrudeGeometry(s,{depth:.035,bevelEnabled:true,bevelSize:.026,bevelThickness:.02,bevelSegments:7,curveSegments:42}),p=>{p.z-=.042*Math.cos(p.x*5)*Math.cos(p.y*5);});
 const m=new THREE.Mesh(g,material('#a8cdce',{side:THREE.DoubleSide,roughness:.46}));m.scale.set(.7,.7,.7);m.position.set(.52,0,.015);m.rotation.y=-.25;m.receiveShadow=true;return m;
}

// Bake one existing GLB ear at its current skinned pose. Positions, UVs, colors
// and smooth normals come from the rabbit asset; no replacement pinna is drawn.
function clipEarBase(source){
 const names=Object.keys(source.attributes),arrays=Object.fromEntries(names.map(n=>[n,[]])),read=id=>Object.fromEntries(names.map(n=>[n,Array.from({length:source.attributes[n].itemSize},(_,j)=>source.attributes[n].getComponent(id,j))]));
 const mix=(a,b,t)=>Object.fromEntries(names.map(n=>[n,a[n].map((v,j)=>v+(b[n][j]-v)*t)]));
 for(let i=0;i<source.index.count;i+=3){const polygon=[0,1,2].map(j=>read(source.index.getX(i+j))),clipped=[];for(let j=0;j<3;j++){const a=polygon[j],b=polygon[(j+1)%3],inside=a.position[1]>=0,nextInside=b.position[1]>=0;if(inside)clipped.push(a);if(inside!==nextInside)clipped.push(mix(a,b,-a.position[1]/(b.position[1]-a.position[1])));}for(let j=1;j<clipped.length-1;j++)for(const vertex of [clipped[0],clipped[j],clipped[j+1]]){const n=vertex.normal,length=Math.hypot(...n)||1;vertex.normal=n.map(v=>v/length);for(const name of names)arrays[name].push(...vertex[name]);}}
 const geometry=new THREE.BufferGeometry();for(const name of names)geometry.setAttribute(name,new THREE.Float32BufferAttribute(arrays[name],source.attributes[name].itemSize));source.dispose();return geometry;
}
function detachedRabbitEar(patient,anchor,sceneScale){
 if(!patient)throw new Error('The rabbit model is required to detach its ear.');
 patient.updateMatrixWorld(true);const meshes=[];let head;
 patient.traverse(o=>{if(o.isMesh)meshes.push(o);if(o.isBone&&/^head$/i.test(o.name))head=o;});
 const height=new THREE.Box3().setFromObject(patient).getSize(V()).y,headPoint=head?.getWorldPosition(V())||anchor,side=anchor.x<headPoint.x?-1:1,floor=headPoint.y+height*.18,bounds=new THREE.Box3(),records=[];
 for(const mesh of meshes){mesh.skeleton?.update();const attrs=mesh.geometry.attributes,count=attrs.position.count,points=Array.from({length:count},(_,i)=>mesh.getVertexPosition(i,V()).applyMatrix4(mesh.matrixWorld)),triangles=[],index=mesh.geometry.index;
  for(let i=0;i<(index?.count||count);i+=3){const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),p=ids.map(j=>points[j]);if(p.some(v=>v.y>floor)&&p.reduce((sum,v)=>sum+(v.x-headPoint.x)*side,0)/3>height*.045){triangles.push(ids);p.forEach(v=>bounds.expandByPoint(v));}}
  if(triangles.length)records.push({mesh,attrs,points,triangles});
 }
 if(bounds.isEmpty())throw new Error('The existing rabbit ear has no selectable surface.');
 const base=bounds.getCenter(V());base.y=floor;const factor=.23/Math.max(.01,bounds.max.y-floor)/sceneScale,root=new THREE.Group();root.name='detached-native-rabbit-ear';root.position.set(-.55,-.02,.02);
 for(const {mesh,attrs,points,triangles}of records){const remap=new Map(),faces=[],vertices=[],normals=[],names=Object.keys(attrs).filter(n=>!['position','normal','skinIndex','skinWeight','tangent'].includes(n)),copied=Object.fromEntries(names.map(n=>[n,[]])),boneMatrix=new THREE.Matrix4(),skinMatrix=new THREE.Matrix4(),transform=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3();
  for(const tri of triangles)for(const id of tri){if(!remap.has(id)){remap.set(id,vertices.length/3);vertices.push(...points[id].clone().sub(base).multiplyScalar(factor).toArray());
    if(mesh.isSkinnedMesh){skinMatrix.elements.fill(0);for(let j=0;j<4;j++){const weight=attrs.skinWeight.getComponent(id,j);if(!weight)continue;boneMatrix.fromArray(mesh.skeleton.boneMatrices,attrs.skinIndex.getComponent(id,j)*16);for(let k=0;k<16;k++)skinMatrix.elements[k]+=boneMatrix.elements[k]*weight;}transform.copy(mesh.matrixWorld).multiply(mesh.bindMatrixInverse).multiply(skinMatrix).multiply(mesh.bindMatrix);}else transform.copy(mesh.matrixWorld);
    normalMatrix.getNormalMatrix(transform);normals.push(...V().fromBufferAttribute(attrs.normal,id).applyMatrix3(normalMatrix).normalize().toArray());for(const name of names)for(let j=0;j<attrs[name].itemSize;j++)copied[name].push(attrs[name].getComponent(id,j));
   }faces.push(remap.get(id));}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));for(const name of names)geometry.setAttribute(name,new THREE.Float32BufferAttribute(copied[name],attrs[name].itemSize));geometry.setIndex(faces);
  const originalMaterials=Array.isArray(mesh.material)?mesh.material:[mesh.material],materials=originalMaterials.map(m=>{const copy=m.clone();copy.opacity=1;copy.transparent=false;copy.side=THREE.DoubleSide;return copy;});
  const ear=new THREE.Mesh(clipEarBase(geometry),Array.isArray(mesh.material)?materials:materials[0]);ear.name='native-rabbit-ear-surface';ear.castShadow=true;ear.receiveShadow=true;root.add(ear);
 }
 root.userData.source='patient-glb-skinned-surface-bake';root.userData.triangles=root.children.reduce((sum,m)=>sum+m.geometry.attributes.position.count/3,0);return root;
}

export class EarGame{
 constructor({scene,camera,renderer,patient,anatomy=null,anchor=new THREE.Vector3(),regions,onHint=()=>{},onEvent=()=>{},heldTool,reducedMotion=false}){
  Object.assign(this,{scene,camera,renderer,patient,anatomy,regions,onHint,onEvent,heldTool,reducedMotion});
  const authoredRoot=anatomy?.root?.getObjectByName(anatomy.metadata.rootNode||'EarAnatomy');
  const scale=anatomy?(anatomy.metadata.sceneScale||anatomy.metadata.recommendedSceneScale||authoredRoot?.userData.recommended_scene_scale||.18):.18;
  this.group=new THREE.Group();this.group.name='ear-canal-and-eardrum-examination';this.group.position.copy(anchor);this.group.scale.setScalar(scale);scene.add(this.group);
  if(anatomy){
   this.ear=anatomy.root.getObjectByName(anatomy.metadata.nodes?.ear||'NativeRabbitPinna');this.canal=anatomy.root.getObjectByName(anatomy.metadata.nodes?.canal);this.drum=anatomy.root.getObjectByName(anatomy.metadata.nodes?.eardrum);
   anatomy.root.traverse(o=>{if(o.isMesh&&/^EarCanal/i.test(o.name)&&!this.canal)this.canal=o;if(o.isMesh&&/^Eardrum/i.test(o.name)&&!this.drum)this.drum=o;});
   if(!this.ear||!this.canal||!this.drum)throw new Error('귀 모형의 귓길과 고막을 확인해 주세요.');
   this.group.add(anatomy.root);
  }else{this.ear=detachedRabbitEar(patient,anchor,scale);this.canal=canal(.12);this.drum=eardrum();this.group.add(this.ear,this.canal,this.drum);}
  this.group.updateMatrixWorld(true);
  const assetPoint=(id,fallback)=>{if(!anatomy)return fallback;const target=anatomy.metadata.targets?.find(t=>t.id===id),name=id==='entrance'?anatomy.metadata.entrance?.node:id==='toolHome'?anatomy.metadata.toolHomeNode:target?.anchor_node;const node=anatomy.root.getObjectByName(name||'Anchor_'+id);if(!node)throw new Error('귀 모형의 조작 위치를 확인해 주세요.');return this.group.worldToLocal(node.getWorldPosition(V()));};
  this.group.userData.examinationFraming={target:anchor.clone().add(V(-.055,.03,0)),size:V(.42,.35,.25),minSpan:.21,fitPadding:.52,cameraOffset:V(0,.03,6)};
  this.tool=new THREE.Group();this.tool.name='draggable-otoscope';this.model=createMedicalTool('otoscope');
  // The Blender speculum points along +Z. Turn the complete model (including
  // its fitted translation) toward the +X canal instead of mirroring its skin.
  const orientation=new THREE.Group();orientation.rotation.y=this.model.userData.authoredInBlender?Math.PI/2:Math.PI;orientation.add(this.model);this.tool.add(orientation);
  const toolScale=.075/scale;this.tool.scale.setScalar(toolScale);this.group.add(this.tool);this.group.updateMatrixWorld(true);
  let grip=this.model.userData.grip.clone();this.model.traverse(o=>{if(o.isMesh&&/connected.*ribbed.*grip/i.test(o.name))grip=this.model.worldToLocal(new THREE.Box3().setFromObject(o).getCenter(V()));});
  this.tipOffset=this.tool.worldToLocal(this.model.localToWorld(this.model.userData.contact.clone())).multiply(this.tool.scale);
  this.gripOffset=this.tool.worldToLocal(this.model.localToWorld(grip)).multiply(this.tool.scale);
  this.speculumAxis=V(this.model.userData.authoredInBlender?0:-1,0,this.model.userData.authoredInBlender?1:0).applyQuaternion(orientation.quaternion).normalize();
  this.entrance=assetPoint('entrance',V(-.55,-.02,.015));this.dragDepth=this.entrance.z;this.home=assetPoint('toolHome',V(-1.25,-.28,this.dragDepth));this.tool.position.copy(this.home.clone().sub(this.tipOffset));this.home.copy(this.tool.position);this.docked=this.entrance.clone().sub(this.tipOffset);
  this.light=new THREE.SpotLight('#fff2cb',5,3,.40,.72,1.25);this.light.castShadow=false;this.light.position.copy(this.entrance.clone().add(V(-.13,0,.07)));this.lightTarget=new THREE.Object3D();this.group.add(this.light,this.lightTarget);this.light.intensity=0;
  this.sites=[{id:'canal',name:'귓길',point:assetPoint('canal',V(-.15,.035,-.06)),radius:anatomy?.metadata.targets?.find(t=>t.id==='canal')?.radius|| (anatomy ? .16 : .20),result:'귓길이 보이네!'},{id:'eardrum',name:'고막',point:assetPoint('eardrum',V(.52,0,.015)),radius:anatomy?.metadata.targets?.find(t=>t.id==='eardrum')?.radius|| (anatomy ? .16 : .20),result:'고막도 살펴봤어!'}];this.aim=this.sites[0].point.clone();this.lightTarget.position.copy(this.aim);this.light.target=this.lightTarget;
  this.aimBounds={minX:Math.min(...this.sites.map(s=>s.point.x))-.17,maxX:Math.max(...this.sites.map(s=>s.point.x))+.10,minY:Math.min(...this.sites.map(s=>s.point.y))-.16,maxY:Math.max(...this.sites.map(s=>s.point.y))+.16};
  this.stage='align';this.checked=new Set();this.complete=false;this.active=false;this.paused=false;this.pointer=null;this.travel=0;this.dwell=0;this.clockStart=0;this.currentSite=null;this.alignStart=0;this.elapsed=0;this.ray=new THREE.Raycaster();this.plane=new THREE.Plane();this.abort=new AbortController();this.toolMeshes=[];this.tool.traverse(o=>{if(o.isMesh)this.toolMeshes.push(o);});
  const canvas=renderer.domElement,options={signal:this.abort.signal};canvas.addEventListener('pointerdown',e=>this.down(e),options);canvas.addEventListener('pointermove',e=>this.move(e),options);canvas.addEventListener('pointerup',e=>this.up(e),options);canvas.addEventListener('pointercancel',()=>this.cancel(),options);canvas.addEventListener('lostpointercapture',()=>{if(this.pointer!==null)this.cancel();},options);
 }
 begin(){if(this.active)return;this.active=true;if(this.heldTool)this.heldTool.visible=false;this.onHint('이경 끝을 귀 입구에 맞춰 볼까?');this.emit('stage',{stage:'align'});}
 emit(type,extra={}){this.onEvent({type,input:'3d_touch',assessment:'not_assessed',...extra});}
 rayFrom(e){const r=this.renderer.domElement.getBoundingClientRect();this.ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);}
 point(e){this.rayFrom(e);this.group.updateMatrixWorld(true);this.plane.setFromNormalAndCoplanarPoint(V(0,0,1).applyQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion())),this.group.localToWorld(V(0,0,this.dragDepth)));const p=this.ray.ray.intersectPlane(this.plane,new THREE.Vector3());return p?this.group.worldToLocal(p):null;}
 down(e){if(!this.active||this.paused||this.complete||this.pointer!==null||e.button>0)return;this.rayFrom(e);if(!this.ray.intersectObjects(this.toolMeshes,false).length)return;const p=this.point(e);if(!p)return;this.pointer=e.pointerId;this.offset=p.clone().sub(this.tool.position);this.startPoint=p.clone();this.startAim=this.aim.clone();this.travel=0;this.renderer.domElement.setPointerCapture(e.pointerId);e.preventDefault();}
 move(e){if(e.pointerId!==this.pointer||this.paused)return;const p=this.point(e);if(!p)return;const previous=this.tool.position.clone();if(this.stage==='align'){this.tool.position.set(clamp(p.x-this.offset.x,this.home.x-.35,this.docked.x+.3),clamp(p.y-this.offset.y,this.home.y-.3,this.docked.y+.3),this.docked.z);this.travel+=previous.distanceTo(this.tool.position);}
  else{const delta=p.clone().sub(this.startPoint),first=this.sites[0].point,last=this.sites[1].point;this.aim.x=clamp(this.startAim.x+delta.x*1.65,this.aimBounds.minX,this.aimBounds.maxX);this.aim.y=clamp(this.startAim.y+delta.y*.5,this.aimBounds.minY,this.aimBounds.maxY);const mix=clamp((this.aim.x-first.x)/(last.x-first.x),0,1);this.aim.z=THREE.MathUtils.lerp(first.z,last.z,mix);this.tool.rotation.z=clamp(delta.y*.23,-.17,.17);this.tool.position.copy(this.docked).add(V(clamp(delta.x*.055,-.04,.04),clamp(delta.y*.06,-.035,.035),0));this.lightTarget.position.copy(this.aim);this.travel+=p.distanceTo(this.startPoint);}
  e.preventDefault();
 }
 up(e){if(e.pointerId!==this.pointer)return;this.cancel();}
 cancel(){const id=this.pointer;this.pointer=null;this.dwell=0;this.clockStart=0;this.alignStart=0;this.currentSite=null;const canvas=this.renderer.domElement;if(id!==null&&canvas.hasPointerCapture?.(id)){try{canvas.releasePointerCapture(id);}catch{}}if(this.stage==='align')this.tool.position.copy(this.home);else{this.tool.position.copy(this.docked);this.tool.rotation.z=0;}this.light.intensity=this.stage==='inspect'&&!this.paused?4:0;}
 get tip(){return this.tool.position.clone().add(this.tipOffset.clone().applyQuaternion(this.tool.quaternion));}
 update(dt){if(!this.active||this.paused||this.complete)return;this.elapsed+=Math.min(dt,.1);const now=performance.now();if(this.stage==='align'){
   const distance=this.tip.distanceTo(this.entrance),near=this.pointer!==null&&distance<.32&&this.travel>.08;this.canal.material.emissive.set(near?'#5b9278':'#000000');this.canal.material.emissiveIntensity=near?.13:0;
   if(near){this.alignStart||=now;if(now-this.alignStart>=350){this.tool.position.copy(this.docked);this.stage='inspect';this.cancel();this.onHint('손잡이를 움직여 빛을 비춰 봐!');this.emit('stage',{stage:'inspect'});}}else this.alignStart=0;
   return;
  }
  const site=this.pointer!==null?this.sites.filter(s=>this.aim.distanceTo(s.point)<s.radius).sort((a,b)=>this.aim.distanceTo(a.point)-this.aim.distanceTo(b.point))[0]:null;
  this.light.intensity=this.pointer!==null?7:4;
  if(site){if(this.currentSite!==site.id){this.currentSite=site.id;this.clockStart=now;}this.dwell=(now-this.clockStart)/1000;if(this.dwell>=.9&&!this.checked.has(site.id)){this.checked.add(site.id);const mesh=site.id==='canal'?this.canal:this.drum;mesh.material.color.set(site.id==='canal'?'#b4c9b1':'#93c4b5');this.onHint(site.result);this.emit('check',{targetId:site.id,result:site.result});if(site.id==='eardrum'&&!this.complete){this.complete=true;this.cancel();this.emit('complete',{checked:[...this.checked]});}}}else{this.currentSite=null;this.clockStart=0;this.dwell=0;}
 }
 setPaused(value){this.paused=!!value;if(value)this.cancel();else this.light.intensity=this.stage==='inspect'?4:0;}
 screen(local){const p=this.group.localToWorld(local.clone()).project(this.camera),r=this.renderer.domElement.getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
 get snapshot(){this.group.updateMatrixWorld(true);return{mode:'3d-ear',stage:this.stage,active:this.active,paused:this.paused,held:this.pointer!==null,complete:this.complete,checked:[...this.checked],dwell:this.dwell,aim:this.aim.toArray(),aimGain:{x:1.65,y:.5},tool:this.tool.position.toArray(),contact:this.tip.toArray(),contactPickPoint:this.screen(this.tip),dragBasis:{origin:this.screen(V(0,0,this.dragDepth)),x:this.screen(V(1,0,this.dragDepth)),y:this.screen(V(0,1,this.dragDepth))},pickPoint:this.screen(this.tool.position.clone().add(this.gripOffset.clone().applyQuaternion(this.tool.quaternion))),entrance:{point:this.entrance.toArray(),pickPoint:this.screen(this.entrance)},targets:this.sites.map(s=>({id:s.id,name:s.name,point:s.point.toArray(),pickPoint:this.screen(s.point),radius:s.radius})),source:this.anatomy?'blender-native-rabbit-ear-with-symbolic-interior':'detached-rabbit-ear-with-symbolic-interior',asset:this.anatomy?.url||null,nativeEarTriangles:this.ear.userData.triangles,patientVisible:!!this.patient?.visible,assessment:'not_assessed'};}
 destroy(){this.active=false;this.cancel();this.abort.abort();if(this.heldTool)this.heldTool.visible=true;dispose(this.group);this.group.removeFromParent();}
}
export default EarGame;




