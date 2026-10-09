import * as THREE from '/vendor/three.js';
import {mergeGeometries} from './vendor/geometry-utils.js';
import {CLINIC_FURNITURE_ASSETS,CLINIC_FURNITURE_LAYOUT,CLINIC_SUPPORT_HEIGHTS} from './clinic-furniture-layout.js';

const prototypes=new Map();let pending;
function named(root,name){return root.getObjectByName(name)||root.getObjectByName(name.replace(/\s/g,'_'))}
export async function preloadClinicFurniture(){
  if(prototypes.size===Object.keys(CLINIC_FURNITURE_ASSETS).length)return;
  if(!pending)pending=Promise.all(Object.entries(CLINIC_FURNITURE_ASSETS).map(async([id,url])=>{
    if(prototypes.has(id))return;
    const {scene}=await new THREE.GLTFLoader().loadAsync(url);
    scene.updateMatrixWorld(true);
    if(new THREE.Box3().setFromObject(scene).isEmpty())throw new Error('빈 진료실 가구: '+id);
    prototypes.set(id,scene);
  })).catch(error=>{pending=null;throw error});
  return pending;
}

function ownMeshes(root){
  root.traverse(object=>{if(object.isMesh){
    object.geometry=object.geometry.clone();
    object.material=Array.isArray(object.material)?object.material.map(m=>m.clone()):object.material.clone();
    object.castShadow=true;object.receiveShadow=true;
  }});
  return root;
}
function batchMeshes(root){
  root.updateMatrixWorld(true);const buckets=new Map();
  root.traverse(object=>{if(object.isMesh){
    if(Array.isArray(object.material))throw new Error('가구 배치에 여러 재질 그룹이 남았습니다');
    const material=object.material,geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);
    // Authored furniture has solid PBR colors and no image maps.
    for(const key of Object.keys(geometry.attributes))if(!['position','normal'].includes(key))geometry.deleteAttribute(key);
    if(!geometry.attributes.normal)geometry.computeVertexNormals();
    if(!geometry.index)geometry.setIndex(Array.from({length:geometry.attributes.position.count},(_,i)=>i));
    if(!buckets.has(material))buckets.set(material,[]);buckets.get(material).push(geometry);
  }});
  const batched=new THREE.Group();
  for(const [material,geometries]of buckets){
    const geometry=mergeGeometries(geometries);
    geometries.forEach(g=>g.dispose());
    if(!geometry)throw new Error('가구 표면을 합치지 못했습니다');
    const mesh=new THREE.Mesh(geometry,material.clone());mesh.name=material.name;
    mesh.castShadow=true;mesh.receiveShadow=true;batched.add(mesh);
  }
  return batched;
}
function itemFor(spec){
  let root=prototypes.get(spec.id).clone(true);
  for(const name of spec.omit||[])named(root,name)?.removeFromParent();
  root=batchMeshes(root);root.name=spec.instance||spec.id;
  root.userData.furnitureId=root.name;root.userData.source=CLINIC_FURNITURE_ASSETS[spec.id];
  root.userData.environmentOnly=true;
  root.position.set(...spec.position);root.scale.setScalar(spec.scale||1);root.rotation.y=spec.rotationY||0;
  return root;
}
function architecture(){
  const root=new THREE.Group();root.name='Clinic architecture';root.userData.architecture=true;
  const colors={wall:'#a8c9b6',floor:'#f5efdb',wood:'#cda575',joint:'#e4dfcf'};
  const mats=Object.fromEntries(Object.entries(colors).map(([key,color])=>[key,new THREE.MeshStandardMaterial({color,roughness:.82})]));
  const box=(name,w,h,d,mat,x,y,z)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mats[mat]);mesh.name=name;mesh.position.set(x,y,z);mesh.receiveShadow=true;root.add(mesh);};
  box('Clinic floor',42,.2,42,'floor',0,-.1,0);
  box('Back wall',42,16,.22,'wall',0,8,-5.1);
  box('Side wall',.22,16,40,'wall',-9,8,0);
  box('Back baseboard',42,.15,.10,'wood',0,.075,-4.94);
  box('Side baseboard',.10,.15,40,'wood',-8.84,.075,0);
  for(let x=-8;x<9;x+=2)box('Quiet floor joint',.008,.002,14,'joint',x,.001,2);
  for(let z=-4;z<10;z+=2)box('Quiet floor joint',18,.002,.008,'joint',0,.001,z);
  return root;
}

export function createClinicFurnitureRoom({includeArchitecture=true}={}){
  if(prototypes.size!==Object.keys(CLINIC_FURNITURE_ASSETS).length)return null;
  const root=new THREE.Group();root.name='Blender clinic furniture';
  for(const spec of CLINIC_FURNITURE_LAYOUT)root.add(itemFor(spec));
  // The station's pedal bin gets its own floor position. Decorative instrument
  // meshes are omitted above, so every visible instrument still has one pick target.
  const binSource=named(prototypes.get('preparation'),'Waste bin');
  if(binSource){
    const bin=ownMeshes(binSource.clone(true));bin.name='wasteBin';
    bin.scale.setScalar(1.2);bin.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(bin),center=bounds.getCenter(new THREE.Vector3());
    bin.position.add(new THREE.Vector3(-center.x,-bounds.min.y,-center.z));
    const placed=new THREE.Group();placed.name='wasteBin';placed.userData.furnitureId='wasteBin';placed.userData.environmentOnly=true;
    placed.add(bin);placed.position.set(6.15,0,-.75);root.add(placed);
  }
  root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root);
  root.userData.fitBounds=[...bounds.min.toArray(),...bounds.max.toArray()];
  root.userData.furnitureAssets=root.children.map(o=>o.userData.furnitureId);
  root.userData.supportHeights={...CLINIC_SUPPORT_HEIGHTS};
  if(includeArchitecture)root.add(architecture());
  return root;
}
