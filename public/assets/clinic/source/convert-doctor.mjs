// Offline-only FBX conversion. No network, generator, or primitive replacement.
import {readFileSync,writeFileSync} from 'node:fs';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {MeshStandardMaterial,DoubleSide} from 'three';
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(v=>{this.result='data:'+blob.type+';base64,'+Buffer.from(v).toString('base64');this.onloadend?.();});}};
const load=p=>{const b=readFileSync(new URL(p,import.meta.url));return new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const model=load('./doctor-source.fbx'),animations=[];
for(const [file,name]of[['./doctor-idle.fbx','Idle'],['./doctor-walk.fbx','Walk']]){const a=load(file).animations[0];a.name=name;animations.push(a);}
const palette={M_Main_2:'#ddb891',M_Face_1:'#343336',M_White:'#fff8e9',M_Brown_1:'#576761',M_Green:'#93bdac',M_Hair_3:'#765139'};
model.traverse(o=>{if(!o.isMesh)return; o.material=o.material.map(m=>new MeshStandardMaterial({name:m.name,color:palette[m.name]||'#dddddd',roughness:1,side:DoubleSide}));o.normalizeSkinWeights();
 const originalGroups=o.geometry.groups.slice(),indices=[],groups=[];
 for(let materialIndex=0;materialIndex<o.material.length;materialIndex++){const start=indices.length;for(const g of originalGroups){if(g.materialIndex!==materialIndex)continue;for(let i=g.start;i<g.start+g.count;i++)indices.push(i);}groups.push({start,count:indices.length-start,materialIndex});}
 o.geometry.setIndex(indices);o.geometry.clearGroups();for(const g of groups)o.geometry.addGroup(g.start,g.count,g.materialIndex);
});
const result=await new GLTFExporter().parseAsync(model,{binary:true,animations,onlyVisible:false});
writeFileSync(new URL('../doctor.glb',import.meta.url),Buffer.from(result));
console.log(JSON.stringify({bytes:result.byteLength,animations:animations.map(a=>a.name)}));

