// Verify with the actual Three.js dependency used by the game.
// Original code, MIT license.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const dir=path.dirname(fileURLToPath(import.meta.url));
const results=[];
for(const name of ['window-curtains','eye-chart','plant']){
  const data=fs.readFileSync(path.join(dir,name+'.glb'));
  const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
  gltf.scene.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3());
  let meshes=0,triangles=0,license=false,assetId=false;
  gltf.scene.traverse(obj=>{
    if(obj.userData.license==='CC0-1.0')license=true;
    if(obj.userData.asset_id===name)assetId=true;
    if(!obj.isMesh)return;
    meshes++;triangles+=(obj.geometry.index?.count??obj.geometry.attributes.position.count)/3;
    for(const value of obj.geometry.attributes.position.array)if(!Number.isFinite(value))throw new Error(name+' contains non-finite positions');
  });
  if(!meshes||!license||!assetId)throw new Error(name+' missing geometry or metadata');
  if(Math.abs(bounds.min.y)>.003)throw new Error(name+' bottom origin is not on y=0');
  if(name==='window-curtains'&&(Math.abs(size.x-4.6)>.03||size.y>3.1))throw new Error('Unexpected curtain/frame dimensions');
  if(name==='eye-chart'&&(Math.abs(size.x-1.15)>.02||Math.abs(size.y-.7)>.02||size.z>.15))throw new Error('Unexpected poster dimensions');
  if(name==='plant'&&(size.y>1.35||size.y<1.25||size.x>1.0))throw new Error('Unexpected plant dimensions');
  results.push({asset:name,bytes:data.length,mesh_count:meshes,triangles,size_meters:size.toArray(),bounds_meters:[...bounds.min.toArray(),...bounds.max.toArray()],license:'CC0-1.0'});
}
fs.writeFileSync(path.join(dir,'glb-validation.json'),JSON.stringify({loader:'Three.js '+THREE.REVISION,results},null,2));
console.log(JSON.stringify(results,null,2));
