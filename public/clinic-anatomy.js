import {GLTFLoader} from '/vendor/three.js';

const BASE='/assets/clinic/blender-candidates/anatomy/';
const prototypes=new Map();

/** Only delivered Blender assets are loaded; each game owns disposable copies. */
export async function loadBlenderAnatomy(caseId) {
  const response=await fetch(BASE+'manifest.json',{cache:'no-cache'});
  if(!response.ok)throw new Error('검사 모형 목록을 준비하지 못했어요.');
  const manifest=await response.json();
  if(!manifest.completedCases?.includes(caseId))return null;
  const metadata=manifest.cases?.[caseId];
  if(!metadata)throw new Error('검사 모형의 조작 정보를 확인해 주세요.');
  const url=metadata.asset||BASE+metadata.file;
  if(!url.startsWith(BASE)||!url.endsWith('.glb')||url.includes('..'))throw new Error('검사 모형 경로가 올바르지 않아요.');
  if(!prototypes.has(url)){
    const request=new GLTFLoader().loadAsync(url).then(gltf=>gltf.scene);
    prototypes.set(url,request);
    request.catch(()=>prototypes.delete(url));
  }
  const original=await prototypes.get(url),root=original.clone(true);
  root.traverse(object=>{
    if(!object.isMesh)return;
    object.geometry=object.geometry.clone();
    object.material=Array.isArray(object.material)?object.material.map(m=>m.clone()):object.material.clone();
    object.castShadow=true;object.receiveShadow=true;
  });
  return{root,metadata:structuredClone(metadata),url};
}

export function applyAnatomyStage(anatomy,stage) {
  const data=anatomy?.metadata;if(!data)return;
  const rule=Array.isArray(data.stages)?data.stages.find(rule=>rule?.id===stage):data.stages?.[stage];
  const show=rule?.show_nodes||data.default_show_nodes||[];
  const hide=rule?.hide_nodes||data.default_hide_nodes||[];
  for(const name of hide){const node=anatomy.root.getObjectByName(name);if(node)node.visible=false;}
  for(const name of show){const node=anatomy.root.getObjectByName(name);if(node)node.visible=true;}
}

export function anatomyTouchTargets(metadata,expanded=false) {
  const targets=metadata.legacyTouch?.[expanded?'expandedTargets':'targets']||metadata[expanded?'expandedTargets':'targets']||[];
  const ids=new Set();
  return targets.map(target=>{
    const pixel=target?.pixel||target;
    const result=Array.isArray(target)
      ?{id:target[0],x:target[1],y:target[2],r:target[3]}
      :{id:target?.id,x:target?.x??pixel?.x??pixel?.[0],y:target?.y??pixel?.y??pixel?.[1],r:target?.r??pixel?.r??target?.r_pixels};
    if(typeof result.id!=='string'||!result.id||ids.has(result.id)||!['x','y','r'].every(key=>Number.isFinite(result[key]))||result.r<=0)
      throw new Error('검사 모형의 관찰 위치를 확인해 주세요.');
    ids.add(result.id);return result;
  });
}
