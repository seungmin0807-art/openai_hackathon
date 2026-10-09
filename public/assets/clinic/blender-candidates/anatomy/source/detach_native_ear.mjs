// Reuse the game's existing native-ear extraction and bake its existing skin pose.
// The original patient GLB is only read. No invented replacement pinna is generated.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../../..');
const work=path.join(workspace,'artifacts/blender-mcp/anatomy/ear');
await fs.mkdir(work,{recursive:true});
const source=await fs.readFile(path.join(workspace,'public/ear-game.js'),'utf8');
const vendor=await fs.readFile(path.join(workspace,'vendor/three-entry.js'),'utf8');
await build({stdin:{contents:source+'\nexport {detachedRabbitEar};',resolveDir:path.join(workspace,'public')},outfile:path.join(work,'ear-extractor.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'local-three',setup(b){b.onResolve({filter:/^\/vendor\/three\.js$/},()=>({path:'vendor',namespace:'adapter'}));b.onLoad({filter:/.*/,namespace:'adapter'},()=>({contents:vendor,resolveDir:workspace,loader:'js'}));}}]});
const {detachedRabbitEar}=await import(pathToFileURL(path.join(work,'ear-extractor.mjs')));
const bytes=await fs.readFile(path.join(workspace,'public/assets/clinic/patient.glb'));
const originalHash=createHash('sha256').update(bytes).digest('hex');
const {scene,animations}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const mixer=new T.AnimationMixer(scene),sitting=animations.find(a=>a.name==='Sitting_Idle');
if(sitting){mixer.clipAction(sitting).play();mixer.update(.0001);}
scene.updateMatrixWorld(true);let head;scene.traverse(o=>{if(o.isBone&&o.name==='Head')head=o;});
const headPosition=head.getWorldPosition(new T.Vector3());
const ear=detachedRabbitEar(scene,headPosition.clone().add(new T.Vector3(-1,0,0)),.18);
ear.name='NativeRabbitPinna';
ear.userData.source_asset='patient.glb';ear.userData.source_sha256=originalHash;ear.userData.license='CC0-1.0';
ear.userData.derivative_attribution='Quaternius Rabbit_Bald; see clinic/LICENSE-attribution.txt';
ear.updateMatrixWorld(true);
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(buffer=>{this.result=buffer;this.onloadend?.();});}};
const glb=await new GLTFExporter().parseAsync(ear,{binary:true,onlyVisible:true,animations:[]});
await fs.writeFile(path.join(work,'native-ear.glb'),Buffer.from(glb));
const bounds=new T.Box3().setFromObject(ear);
const report={source:'public/assets/clinic/patient.glb',sourceSha256:originalHash,method:'Existing detachedRabbitEar from ear-game.js, original Sitting_Idle skinned vertex positions and colors',side:'left',triangles:ear.userData.triangles,boundsGltf:[...bounds.min.toArray(),...bounds.max.toArray()],license:'CC0-1.0',attribution:'Quaternius, Rabbit_Bald, Sushi Restaurant Kit'};
await fs.writeFile(path.join(work,'native-ear-extraction.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
