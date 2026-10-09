// Load the production room builder and medical-tool geometry without a browser.
// Only GLTFLoader's URL transport is adapted to local files; scene code is unchanged.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import * as T from 'three';

const workspace=path.resolve(import.meta.dirname,'..');
const output=path.join(workspace,'artifacts/blender-mcp/clinic-furniture-node.mjs');
await fs.mkdir(path.dirname(output),{recursive:true});
const vendor=await fs.readFile(path.join(workspace,'vendor/three-entry.js'),'utf8');
const adapter=vendor.replace("export { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';",`
import {GLTFLoader as BaseLoader} from 'three/addons/loaders/GLTFLoader.js';
import fs from 'node:fs/promises';
import path from 'node:path';
export class GLTFLoader extends BaseLoader {
 async loadAsync(url){
  const bytes=await fs.readFile(path.join(${JSON.stringify(workspace)},'public',url));
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 }
}`);
await build({stdin:{contents:"export * from './public/clinic-furniture.js'; export {createMedicalTool,ToolSelector} from './public/tool-selector.js'; export * from './public/clinic-furniture-layout.js';",resolveDir:workspace},outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{
 name:'browser-vendor-to-node',setup(builder){
  builder.onResolve({filter:/^\/vendor\/three\.js$/},()=>({path:'three-adapter',namespace:'adapter'}));
  builder.onLoad({filter:/.*/,namespace:'adapter'},()=>({contents:adapter,loader:'js',resolveDir:workspace}));
 }
}]});
const production=await import(pathToFileURL(output));
await production.preloadClinicFurniture();
const room=production.createClinicFurnitureRoom();
assert.equal(room.userData.furnitureAssets.length,17);
const furniture=room.children.filter(child=>child.userData.furnitureId);
const scene=new T.Scene();scene.add(room);scene.updateMatrixWorld(true);
const reports=furniture.map(item=>{
 const bounds=new T.Box3().setFromObject(item);let meshes=0,triangles=0;
 item.traverse(object=>{if(object.isMesh){meshes++;triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;for(const n of object.geometry.attributes.position.array)assert.ok(Number.isFinite(n));}});
 assert.ok(meshes>0);assert.ok(bounds.min.y>=-0.002,item.name+' below floor');
 return {id:item.name,meshes,triangles,bounds:[...bounds.min.toArray(),...bounds.max.toArray()]};
});
// Rebuilding may dispose the previous room. Cached prototypes must stay usable.
const rebuilt=production.createClinicFurnitureRoom({includeArchitecture:false});
assert.equal(rebuilt.children.length,17);
for(const item of furniture){
 let first;item.traverse(o=>{if(o.isMesh&&!first)first=o;});
 let second;rebuilt.getObjectByName(item.name).traverse(o=>{if(o.isMesh&&!second)second=o;});
 assert.notEqual(first.geometry,second.geometry,item.name+' shares disposable geometry');
 assert.notEqual(first.material,second.material,item.name+' shares disposable material');
}
assert.ok(!room.getObjectByName('Stethoscope'),'Decorative duplicate instrument');
const selectorSource=await fs.readFile(path.join(workspace,'public/tool-selector.js'),'utf8');
const slots=Object.fromEntries([...selectorSource.matchAll(/(\w+):\{position:\[([^\]]+)\],support:'([^']+)'/g)].map(match=>[match[1],{position:match[2].split(',').map(Number),support:match[3]}]));
const active=['stethoscope','thermometer','spatula','otoscope','flashlight','syringe','cotton','hand'];
const contact=[];const ray=new T.Raycaster();
for(const id of active){
 const {position:[x,y,z],support}=slots[id];
 const target=support==='bedside-tray'?'instrumentWorkbench':support==='wall-holder'?(id==='otoscope'?'otoscopeHolder':'lightHolder'):'sinkCounter';
 ray.set(new T.Vector3(x,y+.06,z),new T.Vector3(0,-1,0));
 const hit=ray.intersectObject(room.getObjectByName(target),true)[0];
 assert.ok(hit,id+' lacks a supporting surface');
 assert.ok(Math.abs(hit.point.y-y)<.002,id+' changed its support height: '+hit.point.y);
 contact.push({id,support:target,expectedHeight:y,actualHeight:hit.point.y});
}
ray.set(new T.Vector3(1.3,1,-1.42),new T.Vector3(0,-1,0));
assert.ok(Math.abs(ray.intersectObject(room.getObjectByName('patientChair'),true)[0].point.y-.82)<.002,'Patient sitting height');
ray.set(new T.Vector3(3.24,1.3,-4.23),new T.Vector3(0,-1,0));
assert.ok(Math.abs(ray.intersectObject(room.getObjectByName('preparation'),true)[0].point.y-1.2584)<.002,'Monitor support height');

// Exercise the production raycast visibility getter against the real new room.
const models=active.slice(0,6).map(id=>{
 const model=production.createMedicalTool(id),display=new T.Group();
 model.rotation.x=-Math.PI/2;model.scale.setScalar(.78);
 if(['otoscope','flashlight'].includes(id))model.rotation.set(0,0,0);
 model.updateMatrixWorld(true);const box=new T.Box3().setFromObject(model),center=box.getCenter(new T.Vector3());
 model.position.add(new T.Vector3(-center.x,-box.min.y+.003,-center.z));
 display.add(model);display.position.set(...slots[id].position);scene.add(display);
 return {id,model,display};
});
const camera=new T.OrthographicCamera(-6.9,6.9,3.88125,-3.88125,.01,100);
camera.position.set(.3,8.55,14);camera.lookAt(0,2.55,.7);camera.updateMatrixWorld(true);
const fixture={ready:true,visible:true,scene,camera,models,renderer:{domElement:{getBoundingClientRect:()=>({x:0,y:0,width:1280,height:720})}},_visibleToolHit:production.ToolSelector.prototype._visibleToolHit};
const pickPoints=Object.getOwnPropertyDescriptor(production.ToolSelector.prototype,'pickPoints').get.call(fixture);
for(const point of pickPoints)assert.ok(point.visible,point.id+' is occluded by furniture');
const characterHashes={};
for(const [name,expected] of Object.entries({patient:'c9141a0c9cd87eb7dfa9682a1d1325549aaafcf9d33310cfbaaa8263e5e80d80',doctor:'98a1b6d252c6a64307cae0ce1c7e480e7c06cd0a395e8b6b7548ae0c3b29626d'})){
 const bytes=await fs.readFile(path.join(workspace,'public/assets/clinic',name+'.glb'));
 characterHashes[name]=createHash('sha256').update(bytes).digest('hex');
 assert.equal(characterHashes[name],expected,'Original '+name+' character changed');
}
const report={loader:'Three.js '+T.REVISION,productionModule:'public/clinic-furniture.js',placements:reports,contact,pickPoints,characterModelsPreserved:true,characterHashes};
await fs.writeFile(path.join(workspace,'public/assets/clinic/blender-candidates/room-integration-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({placements:reports.length,meshes:reports.reduce((sum,r)=>sum+r.meshes,0),supportContacts:contact.length,visibleToolIds:pickPoints.map(p=>p.id)},null,2));
