import * as THREE from '/vendor/three.js';

// Color the animated mesh itself: world-space surface patches follow its lighting.
// No floating discs, outlines, SVG overlays, or replacement body geometry.
export class SurfaceTints {
 constructor(root){
  this.uniforms={clinicPositions:{value:Array.from({length:4},()=>new THREE.Vector3())},clinicColors:{value:Array.from({length:4},()=>new THREE.Color())},clinicRadii:{value:[0,0,0,0]},clinicStrengths:{value:[0,0,0,0]}};
  this.originals=[];this.clones=new Map();
  const clone=original=>{
   if(this.clones.has(original))return this.clones.get(original);
   const material=original.clone(),previous=original.onBeforeCompile;
   material.onBeforeCompile=(shader,renderer)=>{
    previous?.call(material,shader,renderer);Object.assign(shader.uniforms,this.uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vClinicSurface;').replace('#include <project_vertex>','vClinicSurface = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vClinicSurface;\nuniform vec3 clinicPositions[4];\nuniform vec3 clinicColors[4];\nuniform float clinicRadii[4];\nuniform float clinicStrengths[4];').replace('#include <color_fragment>',`#include <color_fragment>
     for (int i = 0; i < 4; i++) {
      float radius = max(clinicRadii[i], 0.001);
      float distanceOnSkin = length((vClinicSurface.xy - clinicPositions[i].xy) / radius);
      float edge = 1.0 - smoothstep(0.42, 1.0, distanceOnSkin);
      float front = 1.0 - smoothstep(0.07, 0.17, abs(vClinicSurface.z - clinicPositions[i].z));
      diffuseColor.rgb = mix(diffuseColor.rgb, clinicColors[i], edge * front * clinicStrengths[i]);
     }`);
   };
   material.customProgramCacheKey=()=>`${original.customProgramCacheKey?.()||''}:clinic-surface-tints-v1`;
   this.clones.set(original,material);return material;
  };
  root.traverse(mesh=>{if(!mesh.isMesh||!mesh.material)return;this.originals.push([mesh,mesh.material]);mesh.material=Array.isArray(mesh.material)?mesh.material.map(clone):clone(mesh.material);});
 }
 setPatches(patches=[]){for(let i=0;i<4;i++){const p=patches[i];this.uniforms.clinicStrengths.value[i]=p?Math.max(0,Math.min(1,p.strength??.75)):0;if(!p)continue;this.uniforms.clinicPositions.value[i].copy(p.position);this.uniforms.clinicColors.value[i].set(p.color);this.uniforms.clinicRadii.value[i]=p.radius;}}
 dispose(){for(const [mesh,material] of this.originals)mesh.material=material;for(const m of this.clones.values())m.dispose();this.originals=[];this.clones.clear();}
}
