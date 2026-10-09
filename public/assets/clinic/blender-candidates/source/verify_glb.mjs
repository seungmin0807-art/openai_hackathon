// Read the exported GLBs using the same Three.js dependency as the game.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const candidates=path.resolve(process.argv[2]??'public/assets/clinic/blender-candidates');
const results=[];
for(const name of ['clinic-station','stethoscope','clinic-chair','trolley/trolley','instruments/instruments-tray','instruments/otoscope','instruments/thermometer','instruments/light']){
  const bytes=fs.readFileSync(path.join(candidates,name+'.glb'));
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const gltf=await new GLTFLoader().parseAsync(buffer,'');
  gltf.scene.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(gltf.scene),size=box.getSize(new T.Vector3());
  const meshes=[];let triangles=0,hasToolMetadata=false;const toolIds=new Set();
  gltf.scene.traverse(o=>{if(o.userData.selectable_tool==='stethoscope')hasToolMetadata=true;if(o.userData.tool_id)toolIds.add(o.userData.tool_id);if(o.isMesh){meshes.push(o.name);triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const v of o.geometry.attributes.position.array)if(!Number.isFinite(v))throw new Error('Non-finite geometry');}});
  if(meshes.length===0||size.length()===0)throw new Error('Empty export');
  if(name==='clinic-station'&&(size.x>4||size.y>3||size.z>1.5))throw new Error('Unexpected station scale');
  if(name==='stethoscope'&&(size.x>1||size.y>.06||size.z>.5))throw new Error('Unexpected tool scale or pose');
  if(['clinic-station','stethoscope'].includes(name)&&!hasToolMetadata)throw new Error('Missing stethoscope metadata');
  if(name==='clinic-chair'&&(size.y>1.5||Math.abs(box.min.y)>.002))throw new Error('Unexpected chair scale or floor contact');
  if(name==='trolley/trolley'&&(size.y>1.2||Math.abs(box.min.y)>.002))throw new Error('Unexpected trolley scale or floor contact');
  if(name.startsWith('instruments/')&&name!=='instruments/instruments-tray'&&!toolIds.has(name.split('/')[1]))throw new Error('Missing tool_id');
  results.push({name,bytes:bytes.length,meshCount:meshes.length,triangles,sizeMeters:size.toArray(),boundsMeters:box.min.toArray().concat(box.max.toArray()),hasToolMetadata,toolIds:[...toolIds]});
}
fs.writeFileSync(path.join(candidates,'glb-validation.json'),JSON.stringify({loader:'Three.js '+T.REVISION,results},null,2));
console.log(JSON.stringify(results,null,2));
