// Read raster alpha for geometry and pointer hit-testing. No image pixels are modified.
const cache = new Map();
export function analyzeSprite(src) {
  if(cache.has(src))return cache.get(src);
  const promise=(async()=>{
    const image=new Image();image.src=src;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let x0=canvas.width,y0=canvas.height,x1=-1,y1=-1,opaque=0;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(rgba[(y*canvas.width+x)*4+3]>16){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);opaque++;}
    if(x1<0)throw new Error('이미지가 완전히 투명해요.');
    return {width:canvas.width,height:canvas.height,rgba,bounds:{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1},occupancy:opaque/(canvas.width*canvas.height)};
  })();cache.set(src,promise);promise.catch(()=>cache.delete(src));return promise;
}
function drawRect(img){const r=img.getBoundingClientRect(),m=img.__sprite;if(!m)return null;const scale=Math.min(r.width/m.width,r.height/m.height);return {r,scale,x:r.left+(r.width-m.width*scale)/2,y:r.top+(r.height-m.height*scale)/2};}
export function rasterHit(img,clientX,clientY){const d=drawRect(img),m=img.__sprite;if(!d)return false;const x=Math.floor((clientX-d.x)/d.scale),y=Math.floor((clientY-d.y)/d.scale);return x>=0&&y>=0&&x<m.width&&y<m.height&&m.rgba[(y*m.width+x)*4+3]>16;}
export async function prepareSprites(root){
  const abort=new AbortController();let dead=false;
  const images=[...root.querySelectorAll('img[data-sprite]')];
  await Promise.allSettled(images.map(async img=>{
    const metadata=await analyzeSprite(img.src);if(dead)return;img.__sprite=metadata;img.dataset.occupancy=metadata.occupancy.toFixed(3);
    // Native alpha controls selection. The image retains its original safe padding.
    img.dataset.spriteReady='true';
    const host=img.closest('button,[data-sprite-host]')||img;
    const rejectBlank=e=>{if(e.type==='click'&&e.detail===0)return;if(!rasterHit(img,e.clientX,e.clientY)){e.preventDefault();e.stopImmediatePropagation();}};
    host.addEventListener('pointerdown',rejectBlank,{capture:true,signal:abort.signal});host.addEventListener('click',rejectBlank,{capture:true,signal:abort.signal});
  }));
  return ()=>{dead=true;abort.abort();};
}
export function spriteHitInLayer(layer,metadata,point){
  const angle=-(layer.rotation||0)*Math.PI/180,dx=point.x-layer.x,dy=point.y-layer.y;
  const localX=dx*Math.cos(angle)-dy*Math.sin(angle)+layer.width/2,localY=dx*Math.sin(angle)+dy*Math.cos(angle)+layer.height/2;
  const scale=Math.min(layer.width/metadata.width,layer.height/metadata.height);
  const x=Math.floor((localX-(layer.width-metadata.width*scale)/2)/scale),y=Math.floor((localY-(layer.height-metadata.height*scale)/2)/scale);
  return x>=0&&y>=0&&x<metadata.width&&y<metadata.height&&metadata.rgba[(y*metadata.width+x)*4+3]>16;
}
