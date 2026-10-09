// Actual exported topology, original character hash, named anchors and contact checks.
// Original verification code: MIT. Geometry: CC0-1.0.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const folder='public/assets/clinic/blender-candidates/anatomy';
const work='artifacts/blender-mcp/anatomy/ear';
const evidence=JSON.parse(fs.readFileSync(`${work}/mcp-build.json`,'utf8'));
const output=evidence.call.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
const proof=JSON.parse(output.match(/EAR_PROOF=(\{[^\n]+\})/)[1]);
const extraction=JSON.parse(fs.readFileSync(`${work}/native-ear-extraction.json`,'utf8'));
const patientHash=createHash('sha256').update(fs.readFileSync('public/assets/clinic/patient.glb')).digest('hex');
if(patientHash!==extraction.sourceSha256)throw new Error('Original patient changed');
const bytes=fs.readFileSync(`${folder}/ear.glb`);
const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
scene.updateMatrixWorld(true);
const root=scene.getObjectByName('EarAnatomy'),pinna=scene.getObjectByName('NativeRabbitPinna');
if(!root||!pinna||pinna.userData.source_sha256!==patientHash)throw new Error('Missing original pinna attribution');
const meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o);});
if(meshes.length!==3)throw new Error('Unexpected anatomy geometry');
function audit(mesh){
 const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index;
 const welded=new Map(),map=[],adjacency=[],edges=new Map();let triangles=0,degenerate=0;
 for(let i=0;i<position.count;i++){
  const values=[position.getX(i),position.getY(i),position.getZ(i)];
  if(!values.every(Number.isFinite))throw new Error('Non-finite coordinate');
  const key=values.map(v=>Math.round(v*1e6)).join(',');
  if(!welded.has(key)){welded.set(key,welded.size);adjacency.push(new Set());}
  map.push(welded.get(key));
 }
 const count=index?.count??position.count;
 for(let i=0;i<count;i+=3){
  const ids=[0,1,2].map(j=>map[index?index.getX(i+j):i+j]);
  if(new Set(ids).size!==3){degenerate++;continue;}
  triangles++;
  for(let j=0;j<3;j++){
   const a=ids[j],b=ids[(j+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
   edges.set(key,(edges.get(key)||0)+1);adjacency[a].add(b);adjacency[b].add(a);
  }
 }
 const remaining=new Set(adjacency.map((_,i)=>i));let components=0;
 while(remaining.size){components++;const stack=[remaining.values().next().value];remaining.delete(stack[0]);
  while(stack.length)for(const n of adjacency[stack.pop()])if(remaining.delete(n))stack.push(n);
 }
 const nonManifold=[...edges.values()].filter(n=>n!==2).length;
 if(nonManifold||components!==1||degenerate)throw new Error(`${mesh.name}: topology ${components}/${nonManifold}/${degenerate}`);
 return{node:mesh.name,triangles,weldedVertices:welded.size,connectedComponents:components,nonManifoldEdges:nonManifold,degenerateTriangles:degenerate};
}
const topology=meshes.map(audit),anchors={};
for(const [name,point] of Object.entries(proof.anchors)){
 const node=scene.getObjectByName('Anchor_'+name);if(!node)throw new Error('Missing anchor '+name);
 const actual=node.getWorldPosition(new THREE.Vector3());
 if(actual.distanceTo(new THREE.Vector3(...point))>1e-5)throw new Error('Anchor mismatch '+name);
 if(new THREE.Vector3(...node.userData.point_gltf).distanceTo(actual)>1e-5)throw new Error('Anchor extras mismatch '+name);
 anchors[name]=actual.toArray();
}
if(Math.abs(anchors.entrance[2]-anchors.toolHome[2])>1e-6)throw new Error('Tool docking planes differ');
const native=meshes.find(m=>m.userData.source_asset==='patient.glb'),colors=native.geometry.attributes.color;
if(!colors)throw new Error('Original pinna vertex colors missing');
let pinkVertices=0;
for(let i=0;i<colors.count;i++)if(colors.getX(i)>colors.getY(i)+.03&&colors.getX(i)>colors.getZ(i)+.01)pinkVertices++;
if(!pinkVertices)throw new Error('Original pink inner ear missing');
const canal=meshes.find(m=>m.name.startsWith('EarCanal')),drum=meshes.find(m=>m.name.startsWith('Eardrum'));
const ray=new THREE.Raycaster();
function surface(node,point){
 ray.set(new THREE.Vector3(point[0],point[1],2),new THREE.Vector3(0,0,-1));
 const hits=ray.intersectObject(node,true);if(!hits.length)throw new Error('Target misses geometry '+node.name);
 return hits[0].point.toArray();
}
const targets=[['canal','귓길',canal,.14],['eardrum','고막',drum,.14]].map(([id,name,node,radius])=>({id,name,node:node.name,anchor_node:'Anchor_'+id,point:anchors[id],aimPoint:anchors[id],surfacePoint:surface(node,anchors[id]),radius,result:id==='canal'?'귓길이 보이네!':'고막도 살펴봤어!'}));
const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
const manifest={caseId:'ear',file:'ear.glb',asset:'/assets/clinic/blender-candidates/anatomy/ear.glb',units:'game-world-units',frontAxis:[0,0,1],rootNode:root.name,sceneScale:.18,scale:.18,
 nodes:{ear:pinna.name,pinna:pinna.name,canal:canal.name,eardrum:drum.name},
 entrance:{point:anchors.entrance,node:'Anchor_entrance',workingAxis:[1,0,0]},toolHome:anchors.toolHome,toolHomeNode:'Anchor_toolHome',toolHomeMeaning:'tool contact/tip position; subtract transformed contact offset to obtain tool root position',
 alignmentPlaneZ:anchors.entrance[2],dragDepth:anchors.entrance[2],
 toolId:'otoscope',toolOrientation:{rotationY:Math.PI/2,rotationRadians:[0,Math.PI/2,0],sourceWorkingAxis:[0,0,1],workingAxis:[1,0,0],scaleSigns:[1,1,1],note:'Rotate the complete handle and speculum together around +Y. Keep all scale components positive.'},
 toolScale:.075/.18,targets,stages:{align:{show_nodes:[pinna.name,canal.name,drum.name],hide_nodes:[]},inspect:{show_nodes:[pinna.name,canal.name,drum.name],hide_nodes:[]}},
 boundsLocal:[...bounds.min.toArray(),...bounds.max.toArray()],framing:{center:bounds.getCenter(new THREE.Vector3()).toArray(),size:size.toArray()},symbolic:true,
 source:{asset:'../../patient.glb',sha256:patientHash,author:'Quaternius',model:'Rabbit_Bald, Sushi Restaurant Kit',license:'CC0-1.0',method:extraction.method,originalCharacterModified:false,baseClosure:'Extraction attachment fragments below local glTF Y=.105 trimmed; retained ear translated down .125 and cut base capped. Retained source surface shape and vertex colors unchanged.',baseCutY:.105,retainedPinnaTranslation:[0,-.125,0]},
 license:'CC0-1.0',sourceLicense:'MIT',renderStatus:'camera-ready; waiting for serial CPU render'};
const validation={caseId:'ear',loader:'Three.js '+THREE.REVISION,bytes:bytes.length,meshCount:meshes.length,triangles:topology.reduce((n,m)=>n+m.triangles,0),finitePositions:true,sourceCharacterHashUnchanged:true,originalPinkVertices:pinkVertices,topology,anchors,targets,boundsLocal:manifest.boundsLocal,blenderProof:proof,externalGenerationCalls:0,renderPerformed:false};
fs.writeFileSync(`${folder}/ear-manifest.json`,JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(`${folder}/ear-validation.json`,JSON.stringify(validation,null,2)+'\n');
fs.writeFileSync(`${work}/geometry-proof.json`,JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({bytes:bytes.length,triangles:validation.triangles,topology,anchors,sourceCharacterHashUnchanged:true,originalPinkVertices:pinkVertices}));
