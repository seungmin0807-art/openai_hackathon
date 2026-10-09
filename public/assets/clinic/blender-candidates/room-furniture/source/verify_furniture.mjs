// Actual Three.js 186 GLTFLoader + world vertex bounds + surface ray contact verification.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const out=path.dirname(fileURLToPath(import.meta.url));
const pub=path.resolve(out,'../../../public/assets/clinic/blender-candidates/room-furniture');
const cases={
  'patient-chair':{size:[2.17,2.48,2.285],contacts:[[0,0,.82],[.65,.3,.82],[0,1.12,.22],[-.965,.4,1.3],[.965,.4,1.3]]},
  'storage-cabinet':{size:[1.4,1.4,.65],contacts:[[0,0,1.4]]},
  'monitor':{size:[1.05,.9,.45],contacts:[]},
  'diagnostic-holder':{size:[.56,1.02,.69],contacts:[[0,.25,.079]]},
  'instrument-workbench':{size:[2.9,.975,3.7],contacts:[]},
  'sink-workcounter':{size:[4.65,null,2.65],contacts:[[0,.55,1.415],[-1.2,.7,1.415],[1.45,-.65,1.415],[.3,-.65,1.415]]}
};
for(const x of [-1.20,0,1.20])for(const z of [-1.55,0,1.55])cases['instrument-workbench'].contacts.push([x,z,.975]);
const results=[];
for(const [id,expect] of Object.entries(cases)){
  const bytes=fs.readFileSync(path.join(pub,id+'.glb'));
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const gltf=await new GLTFLoader().parseAsync(buffer,'');
  gltf.scene.updateMatrixWorld(true);
  let assetRoot,meshCount=0,triangles=0;
  gltf.scene.traverse(o=>{
    if(o.userData.asset_id===id)assetRoot=o;
    if(o.isMesh){meshCount++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
      for(const value of o.geometry.attributes.position.array)if(!Number.isFinite(value))throw new Error('Nonfinite geometry '+id);
    }
  });
  if(!assetRoot||meshCount<1||meshCount>6)throw new Error('Missing metadata/material batch '+id+' '+meshCount);
  const bounds=new T.Box3().setFromObject(gltf.scene,true),size=bounds.getSize(new T.Vector3());
  if(Math.abs(bounds.min.y)>.00002)throw new Error('Floating origin '+id+' '+bounds.min.y);
  for(let k=0;k<3;k++)if(expect.size[k]!==null&&Math.abs(size.getComponent(k)-expect.size[k])>.0002)throw new Error('Incorrect bounds '+id+' axis'+k+' '+size.getComponent(k));
  const raycaster=new T.Raycaster(),contacts=[];
  for(const [x,z,top] of expect.contacts){
    raycaster.set(new T.Vector3(x,4,z),new T.Vector3(0,-1,0));
    const hit=raycaster.intersectObject(gltf.scene,true)[0];
    if(!hit||Math.abs(hit.point.y-top)>.0001)throw new Error('Incorrect real contact surface '+id+' '+[x,z,top]+' hit '+hit?.point.y);
    contacts.push({x,z,expectedTop:top,actualTop:hit.point.y});
  }
  if(id==='sink-workcounter'){
    raycaster.set(new T.Vector3(-1.2,4,-.7),new T.Vector3(0,-1,0));
    const hit=raycaster.intersectObject(gltf.scene,true)[0];
    if(!hit||hit.point.y>1.3)throw new Error('Basin is not recessed');
    contacts.push({x:-1.2,z:-.7,recessedBasinTop:hit.point.y});
  }
  results.push({asset_id:id,bytes:bytes.length,meshCount,triangles,boundsMeters:bounds.min.toArray().concat(bounds.max.toArray()),
    sizeMeters:size.toArray(),contactMetadata:JSON.parse(assetRoot.userData.contact_metadata),
    rootHeightMetadata:{top_m:assetRoot.userData.top_m,seat_top_m:assetRoot.userData.seat_top_m,support_top_m:assetRoot.userData.support_top_m},contacts});
}
const report={loader:'Three.js '+T.REVISION,results,totalGlbBytes:results.reduce((n,r)=>n+r.bytes,0),
  totalMaterialDrawCalls:results.reduce((n,r)=>n+r.meshCount,0)};
fs.writeFileSync(path.join(out,'glb-validation.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(pub,'validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
