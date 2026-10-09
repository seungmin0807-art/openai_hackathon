import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {get,put,list} from '@vercel/blob';

const keyPath=key=>{
  if(typeof key!=='string'||!/^care\/[a-zA-Z0-9_/-]+$/.test(key)||key.includes('..'))throw new TypeError('Invalid storage key');
  return `${key}.json`;
};
export class CareRepository {
  constructor({env=process.env,directory=path.resolve('.data','care')}={}){
    this.env=env;this.directory=directory;this.cloud=env.VERCEL==='1'||!!env.BLOB_READ_WRITE_TOKEN||!!env.BLOB_STORE_ID;
  }
  options(){return{access:'private',...(this.env.BLOB_READ_WRITE_TOKEN?{token:this.env.BLOB_READ_WRITE_TOKEN}:{}),...(this.env.BLOB_STORE_ID?{storeId:this.env.BLOB_STORE_ID}:{})};}
  async get(key){
    const name=keyPath(key);
    if(this.cloud){const result=await get(name,{...this.options(),useCache:false});if(!result)return null;if(result.statusCode!==200)throw new Error('Private storage unavailable');return JSON.parse(await new Response(result.stream).text());}
    try{return JSON.parse(await readFile(path.join(this.directory,name),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
  }
  async put(key,value){
    const name=keyPath(key),body=JSON.stringify(value);
    if(this.cloud){await put(name,body,{...this.options(),addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:0});return;}
    const file=path.join(this.directory,name);await mkdir(path.dirname(file),{recursive:true,mode:0o700});const temp=`${file}.${randomUUID()}.tmp`;
    await writeFile(temp,body,{mode:0o600,flag:'wx',flush:true});await rename(temp,file);
  }
  async list(prefix){
    keyPath(prefix.replace(/\/$/,''));
    if(this.cloud){const keys=[];let cursor;do{const page=await list({...this.options(),prefix,limit:1000,...(cursor?{cursor}:{})});keys.push(...page.blobs.filter(b=>b.pathname.endsWith('.json')).map(b=>b.pathname.slice(0,-5)));cursor=page.hasMore?page.cursor:undefined;}while(cursor&&keys.length<5000);return keys;}
    const keys=[];
    const walk=async(dir)=>{let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}for(const e of entries){const file=path.join(dir,e.name);if(e.isDirectory())await walk(file);else if(e.name.endsWith('.json')){const key=path.relative(this.directory,file).replaceAll('\\','/').slice(0,-5);if(key.startsWith(prefix))keys.push(key);}}};
    await walk(this.directory);return keys;
  }
}
