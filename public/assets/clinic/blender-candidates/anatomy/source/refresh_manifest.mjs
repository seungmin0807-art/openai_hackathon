// Publish completed per-case manifests incrementally while parallel modeling proceeds.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const folder=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const planned=['ear'];
const cases={};
for(const caseId of planned){
 try{
  const metadata=JSON.parse(await fs.readFile(path.join(folder,caseId+'-manifest.json'),'utf8'));
  await fs.access(path.join(folder,metadata.file||caseId+'.glb'));
  cases[caseId]=metadata;
 }catch(error){if(error.code!=='ENOENT')throw error;}
}
const manifest={schemaVersion:1,date:'2026-10-09',baseUrl:'/assets/clinic/blender-candidates/anatomy/',coordinateSystem:'glTF +Y up, +Z front; points local to the GLB root',completedCases:Object.keys(cases),pendingCases:planned.filter(id=>!cases[id]),cancelledCases:[{caseId:'oxygen',reason:'User cancelled the oxygen/hand model.'},{caseId:'pressure',reason:'User said blood pressure is not a needed feature.'},{caseId:'abdomen',reason:'User cancelled the separate abdomen model; belly examination uses the existing patient.'},{caseId:'blood',reason:'User clarified this is vaccination, not blood sampling.'},{caseId:'throat',reason:'Final game scope excludes throat examination; no further production.'},{caseId:'nose',reason:'Final game scope excludes nose examination; no further production.'}],activeGameCases:['stethoscope','ear','vaccination','temperature','abdomen'],vaccination:{anatomyModelRequired:false,source:'Existing patient arm and syringe; no separate arm, blood sample, or cell model'},renderedCases:Object.keys(cases).filter(id=>cases[id].renderStatus==='rendered and manually reviewed'),cases,assets:cases};
await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({completed:manifest.completedCases,pending:manifest.pendingCases}));
