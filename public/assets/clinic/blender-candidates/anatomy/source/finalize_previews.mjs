// Run after manual review of every case's actual rendered PNG. MIT.
import fs from 'node:fs';
const folder='public/assets/clinic/blender-candidates/anatomy';
for(const caseId of ['ear']){
 const filename=`${folder}/${caseId}-manifest.json`,metadata=JSON.parse(fs.readFileSync(filename,'utf8'));
 const previews=[caseId+'.png'];
 for(const preview of previews){
  const image=fs.statSync(`${folder}/${preview}`),geometry=fs.statSync(`${folder}/${metadata.file}`);
  if(image.mtimeMs<geometry.mtimeMs)throw new Error('Render predates current GLB '+preview);
 }
 metadata.preview=caseId+'.png';metadata.renderStatus='rendered and manually reviewed';
 fs.writeFileSync(filename,JSON.stringify(metadata,null,2)+'\n');
}
console.log('Ear preview record finalized; unused anatomy models excluded.');
