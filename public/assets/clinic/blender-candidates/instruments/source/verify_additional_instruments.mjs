// Validate the real exported GLBs with the game's installed Three.js loader.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const folder=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workspace=path.resolve(folder,'../../../../..');
const evidence=JSON.parse(await fs.readFile(path.join(workspace,'artifacts/blender-mcp/additional-instruments/mcp-build.json'),'utf8'));
const resultText=evidence.call.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
const marker='ADDITIONAL_INSTRUMENTS_PROOF=';
const jsonLine=resultText.slice(resultText.indexOf(marker)+marker.length).split('\n')[0];
assert.ok(resultText.includes(marker),'MCP geometry proof not found');
const modelAudit=JSON.parse(jsonLine);
const results=[];
for(const id of ['syringe','spatula']){
 const bytes=await fs.readFile(path.join(folder,id+'.glb'));
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 gltf.scene.updateMatrixWorld(true);
 let pickup;const meshes=[];let triangles=0;
 gltf.scene.traverse(o=>{
  if(o.userData.tool_id===id)pickup=o;
  if(o.isMesh){meshes.push(o);triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const value of o.geometry.attributes.position.array)assert.ok(Number.isFinite(value));}
 });
 assert.ok(pickup,'Missing selectable metadata: '+id);assert.equal(pickup.userData.selectable_tool,id);
 assert.equal(pickup.userData.license,'CC0-1.0');
 assert.deepEqual(pickup.userData.grip_point_gltf,[0,0,0]);
 assert.deepEqual(pickup.userData.long_axis_gltf,[0,1,0]);
 const bounds=new T.Box3().setFromObject(gltf.scene),size=bounds.getSize(new T.Vector3());
 assert.ok(meshes.length>0);assert.ok(bounds.containsPoint(new T.Vector3()),'Grip lies outside tool');
 const contact=pickup.userData.contact_point_gltf;
 assert.ok(Math.abs(contact[1]-bounds.max.y)<.0008,'Working end does not match contact point');
 assert.equal(contact[0],0);assert.equal(contact[2],0);
 const expectedBounds=modelAudit.exports.find(e=>e.tool_id===id).bounds_gltf_m;
 const actualBounds=[...bounds.min.toArray(),...bounds.max.toArray()];
 for(let n=0;n<6;n++)assert.ok(Math.abs(expectedBounds[n]-actualBounds[n])<.00001,'Export changed audited bounds');
 if(id==='syringe'){
  assert.equal(pickup.userData.spring_present,false);
  assert.ok(meshes.every(m=>!/(spring|helix|coil)/i.test(m.name)),'Spring geometry present');
  for(const part of ['hollow_barrel','solid_plunger_shaft','fitted_piston','finger_flange','thumb_pad','steel_tip'])assert.ok(meshes.some(m=>m.name.includes(part)),'Missing syringe part: '+part);
  const barrel=meshes.find(m=>m.name.includes('hollow_barrel'));
  const radialRadii=[];const p=barrel.geometry.attributes.position;
  for(let i=0;i<p.count;i++)radialRadii.push(Math.hypot(p.getX(i),p.getZ(i)));
  assert.ok(Math.min(...radialRadii)<.009&&Math.max(...radialRadii)>.0125,'Barrel lacks its inner/outer walls');
  assert.ok(meshes.some(m=>m.material.opacity<.5),'Plunger visibility material missing');
  assert.ok(size.y>.22&&size.y<.23,'Syringe longitudinal dimension');
 }else{
  assert.ok(Math.abs(size.x-.024)<.0001,'Depressor width');
  assert.ok(Math.abs(size.y-.15)<.0001,'Depressor length');
  assert.ok(size.z>=.0035&&size.z<.0038,'Depressor physical thickness');
  assert.ok(meshes.some(m=>m.name.includes('continuous_rounded_wooden_body')),'Missing continuous wooden body');
 }
 results.push({tool_id:id,file:id+'.glb',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),meshCount:meshes.length,triangles,boundsMeters:actualBounds,sizeMeters:size.toArray(),gripPointGltf:pickup.userData.grip_point_gltf,contactPointGltf:contact,longAxisGltf:pickup.userData.long_axis_gltf,frontAxisGltf:pickup.userData.front_axis_gltf,springPresent:id==='syringe'?false:null});
}
for(const part of modelAudit.parts_audit){assert.equal(part.connected_components,1);assert.equal(part.non_manifold_edges,0);}
for(const asset of modelAudit.exports){asset.bytes=(await fs.stat(asset.file)).size;}
await fs.writeFile(path.join(folder,'additional-instruments-model-audit.json'),JSON.stringify(modelAudit,null,2)+'\n');
const proof={date:'2026-10-09',loader:'Three.js '+T.REVISION,mcpPort:9880,localMcpInitializeVerified:!!evidence.initialize,externalGenerationCalls:0,renderPerformed:false,licenseGeometry:'CC0-1.0',licenseSource:'MIT',results,manufacturedPartCount:modelAudit.parts_audit.length,allPartsConnectedAndClosed:true};
await fs.writeFile(path.join(folder,'additional-instruments-validation.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify(proof,null,2));
