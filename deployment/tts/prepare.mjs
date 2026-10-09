// Create a source-only deployment directory. Never copies .env, model caches,
// speech samples, child journals, or virtual environments from the workspace.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const destination=path.resolve(root,'.data/deploy-tts');
const relative=path.relative(root,destination);
if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Deployment path escapes workspace');
const sources=[
 ...['service.py','runtime.py','download_models.py','requirements-lock.txt','SDK-LICENSE.txt','MODEL-LICENSE.txt'].map(name=>['voice/'+name,'voice/'+name]),
 ['deployment/tts/entrypoint.py','deployment/tts/entrypoint.py'],
 ['deployment/tts/Dockerfile.vercel','Dockerfile.vercel'],
 ['deployment/tts/vercel.json','vercel.json'],
];
const generated=new Set([...sources.map(([,target])=>target),'.dockerignore','.vercelignore']);
// Vercel CLI may create these locally after project linking/env pull. Preserve
// them without reading or copying their contents; exclude them from uploads.
const expected=new Set([...generated,'.env.local','.gitignore']);
function list(directory,prefix=''){
 if(!fs.existsSync(directory))return[];
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const name=prefix+entry.name;
  if(name==='.vercel')return[]; // Vercel link metadata; never a source input.
  if(entry.isSymbolicLink())throw new Error('Deployment symlinks are not supported');
  return entry.isDirectory()?list(path.join(directory,entry.name),name+'/'):[name];
 });
}
const unexpected=list(destination).filter(name=>!expected.has(name));
if(unexpected.length)throw new Error('Unexpected existing deployment files: '+unexpected.join(', '));
for(const [source,target] of sources){
 const output=path.join(destination,target);
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.copyFileSync(path.join(root,source),output);
}
fs.writeFileSync(path.join(destination,'.dockerignore'),'.vercel/\n.env\n.env.*\n');
fs.writeFileSync(path.join(destination,'.vercelignore'),'.vercel/\n.env\n.env.*\n.gitignore\n**/__pycache__/\n');
console.log(JSON.stringify({directory:destination,sourceFiles:list(destination).filter(name=>generated.has(name)).length,modelsDownloaded:false,
 secretFilesCopied:false,cloudDeployed:false,entrypoint:'Dockerfile.vercel',
 environment:{PORT:'8080',TTS_THREADS:'2',TTS_VOICE:'F4',TTS_AUTH_TOKEN:'set a new server-only secret'}}));
