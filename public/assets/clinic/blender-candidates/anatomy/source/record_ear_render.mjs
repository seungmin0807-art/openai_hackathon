// Record only a completed, manually reviewed PNG matching the exported scene. MIT.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const folder='public/assets/clinic/blender-candidates/anatomy';
const evidence=JSON.parse(fs.readFileSync('artifacts/blender-mcp/anatomy/ear/mcp-render.json','utf8'));
const text=evidence.call.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
const proof=JSON.parse(text.match(/EAR_RENDER=(\{[^\n]+\})/)[1]);
if(proof.case_id!=='ear'||!proof.render_performed)throw new Error('No completed ear render');
if(fs.statSync(`${folder}/ear.png`).mtimeMs<fs.statSync(`${folder}/ear.glb`).mtimeMs)throw new Error('Preview predates current GLB');
const png=fs.readFileSync(`${folder}/ear.png`),validation=JSON.parse(fs.readFileSync(`${folder}/ear-validation.json`,'utf8'));
validation.renderPerformed=true;
validation.render={...proof,png:'ear.png',bytes:png.length,sha256:createHash('sha256').update(png).digest('hex'),manuallyReviewed:true,review:'Original long white/pink rabbit pinna, clean closed base, small horizontal lavender canal and curved mint membrane; no extraction fragments.'};
fs.writeFileSync(`${folder}/ear-validation.json`,JSON.stringify(validation,null,2)+'\n');
const metadata=JSON.parse(fs.readFileSync(`${folder}/ear-manifest.json`,'utf8'));
metadata.preview='ear.png';metadata.renderStatus='rendered and manually reviewed';
fs.writeFileSync(`${folder}/ear-manifest.json`,JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify(validation.render));
