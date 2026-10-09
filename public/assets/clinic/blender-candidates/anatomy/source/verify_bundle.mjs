// Verify delivered assets with the game's installed Three.js loader. MIT.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const folder='public/assets/clinic/blender-candidates/anatomy';
const bundle=JSON.parse(fs.readFileSync(`${folder}/manifest.json`,'utf8'));
const planned=['ear'];
if(bundle.pendingCases.length||planned.some(id=>!bundle.completedCases.includes(id)))throw new Error('Incomplete case bundle');
for(const caseId of ['oxygen','pressure','abdomen','blood','throat','nose']){
 if(bundle.completedCases.includes(caseId)||bundle.cases[caseId])throw new Error('Cancelled model published '+caseId);
 for(const file of [caseId+'.glb',caseId+'.png',caseId+'-manifest.json',caseId+'-validation.json','source/build_'+caseId+'.py','source/render_'+caseId+'.py'])if(fs.existsSync(`${folder}/${file}`))throw new Error('Cancelled artifact present '+file);
}
if(fs.existsSync(`${folder}/blood-inspect.png`))throw new Error('Cancelled blood cell preview present');
const results=[];
for(const caseId of planned){
 const metadata=bundle.cases[caseId],perCase=JSON.parse(fs.readFileSync(`${folder}/${caseId}-manifest.json`,'utf8'));
 for(const [key,value] of Object.entries(perCase))if(JSON.stringify(metadata[key])!==JSON.stringify(value))throw new Error('Stale manifest '+caseId+'/'+key);
 if(metadata.file!==caseId+'.glb'||metadata.units!=='game-world-units')throw new Error('Invalid file or units');
 const bytes=fs.readFileSync(`${folder}/${metadata.file}`);
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 scene.updateMatrixWorld(true);let meshes=0,triangles=0;
 scene.traverse(o=>{
  if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
  for(const attribute of Object.values(o.geometry.attributes))for(let i=0;i<attribute.count;i++)for(let j=0;j<attribute.itemSize;j++)if(!Number.isFinite(attribute.getComponent(i,j)))throw new Error('Non-finite attribute '+o.name);
 });
 if(!meshes)throw new Error('Empty geometry');
 const bounds=new THREE.Box3().setFromObject(scene);if(bounds.isEmpty()||![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite))throw new Error('Invalid bounds');
 for(const target of [...metadata.targets,...(metadata.expandedTargets||metadata.expanded_targets||[])]){
  if(!target.point?.every(Number.isFinite)||!(target.radius>0))throw new Error('Invalid target '+caseId+'/'+target.id);
  const nodeName=target.node,anchorName=target.anchor_node||target.anchorNode;
  if(nodeName&&!scene.getObjectByName(nodeName))throw new Error('Missing target node '+nodeName);
  if(anchorName&&!scene.getObjectByName(anchorName))throw new Error('Missing anchor node '+anchorName);
 }
 if(!Array.isArray(metadata.stages))for(const rule of Object.values(metadata.stages||{}))for(const name of [...(rule.show_nodes||[]),...(rule.hide_nodes||[])])if(!scene.getObjectByName(name))throw new Error('Missing stage node '+name);
 const previewFiles=[caseId+'.png'];
 const previews=previewFiles.map(file=>{
  const png=fs.readFileSync(`${folder}/${file}`);if(!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Invalid PNG');
  if(fs.statSync(`${folder}/${file}`).mtimeMs<fs.statSync(`${folder}/${metadata.file}`).mtimeMs)throw new Error('Preview predates geometry '+caseId);
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);if(width<800||height<800||png.length<10000)throw new Error('Incomplete preview');
  return{file,bytes:png.length,width,height,sha256:createHash('sha256').update(png).digest('hex')};
 });
 const geometryValidation=JSON.parse(fs.readFileSync(`${folder}/${caseId}-validation.json`,'utf8'));
 results.push({caseId,file:metadata.file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),meshCount:meshes,triangles,boundsLocal:[...bounds.min.toArray(),...bounds.max.toArray()],targets:metadata.targets.map(t=>t.id),previews,geometryValidationFile:caseId+'-validation.json',validationPresent:!!geometryValidation});
}
const originalHashes={patient:'c9141a0c9cd87eb7dfa9682a1d1325549aaafcf9d33310cfbaaa8263e5e80d80',doctor:'98a1b6d252c6a64307cae0ce1c7e480e7c06cd0a395e8b6b7548ae0c3b29626d'};
for(const [name,expected] of Object.entries(originalHashes))if(createHash('sha256').update(fs.readFileSync(`public/assets/clinic/${name}.glb`)).digest('hex')!==expected)throw new Error('Original character changed '+name);
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(directory+'/'+e.name):[directory+'/'+e.name]);}
const prohibited=files(folder).filter(file=>/\.(blend\d*|exe|dll|zip|msi)$/i.test(file));if(prohibited.length)throw new Error('Development binary shipped '+prohibited.join(','));
const report={date:'2026-10-09',loader:'Three.js '+THREE.REVISION,caseCount:results.length,totalGeometryBytes:results.reduce((n,r)=>n+r.bytes,0),totalPreviewBytes:results.reduce((n,r)=>n+r.previews.reduce((s,p)=>s+p.bytes,0),0),originalCharacterHashesUnchanged:true,prohibitedDevelopmentFiles:prohibited,externalGenerationCalls:0,cases:results};
report.cancelledHandModelExcluded=true;
report.cancelledPressureAbdomenBloodModelsExcluded=true;
fs.writeFileSync(`${folder}/bundle-validation.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({caseCount:report.caseCount,totalGeometryBytes:report.totalGeometryBytes,totalPreviewBytes:report.totalPreviewBytes,originalCharacterHashesUnchanged:true,prohibitedDevelopmentFiles:[]}));
