// Validate generated GLBs with the game's real Three.js GLTFLoader.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const out=path.dirname(fileURLToPath(import.meta.url));
const pub=path.resolve(out,'../../../public/assets/clinic/blender-candidates/instruments');
const results=[];
for(const id of ['otoscope','thermometer','light','instruments-tray']){
  const bytes=fs.readFileSync(path.join(pub,id+'.glb'));
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const gltf=await new GLTFLoader().parseAsync(buffer,'');
  gltf.scene.updateMatrixWorld(true);
  const toolIds=new Set(),meshes=[];
  let triangles=0;
  gltf.scene.traverse(o=>{
    if(o.userData.tool_id)toolIds.add(o.userData.tool_id);
    if(o.isMesh){
      meshes.push(o.name);
      triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
      for(const v of o.geometry.attributes.position.array)if(!Number.isFinite(v))throw new Error('Nonfinite geometry in '+id);
    }
  });
  const box=new T.Box3().setFromObject(gltf.scene,true),size=box.getSize(new T.Vector3());
  if(!meshes.length||size.length()===0)throw new Error('Empty export '+id);
  if(id!=='instruments-tray'&&(toolIds.size!==1||!toolIds.has(id)))throw new Error('Missing exact tool_id '+id);
  if(id==='instruments-tray')for(const toolId of ['otoscope','thermometer','light'])if(!toolIds.has(toolId))throw new Error('Missing set member '+toolId);
  if(id!=='instruments-tray'&&Math.max(...size.toArray())>.24)throw new Error('Incorrect handheld scale '+id);
  const contact=[];
  if(id==='instruments-tray')gltf.scene.traverse(o=>{
    if(o.userData.tool_id){
      const toolBox=new T.Box3().setFromObject(o,true);
      contact.push({tool_id:o.userData.tool_id,min_y:toolBox.min.y,bounds:toolBox.min.toArray().concat(toolBox.max.toArray())});
      if(Math.abs(toolBox.min.y-.0193)>.001)throw new Error('Unexpected tray contact '+o.userData.tool_id+' '+toolBox.min.y);
    }
  });
  results.push({file:id+'.glb',bytes:bytes.length,meshCount:meshes.length,triangles,
    tool_ids:[...toolIds],sizeMeters:size.toArray(),boundsMeters:box.min.toArray().concat(box.max.toArray()),contact});
}
const report={loader:'Three.js '+T.REVISION,results};
fs.writeFileSync(path.join(out,'glb-validation.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(pub,'validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
