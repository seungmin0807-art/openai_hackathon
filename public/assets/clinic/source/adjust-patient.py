"""Offline connected-surface reshape and two Loop rounds; retain source rig/UVs.
No external service, download, image edit, or extra neck object.
"""
import json,base64,struct,copy,math,io
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
d=json.loads((ROOT/'patient.gltf').read_text(encoding='utf-8'))
binary=bytearray(base64.b64decode(d['buffers'][0]['uri'].split(',')[1]))
image_view=d['bufferViews'][d['images'][0]['bufferView']]
atlas=np.asarray(Image.open(io.BytesIO(binary[image_view['byteOffset']:image_view['byteOffset']+image_view['byteLength']])).convert('RGB'))/255
def linear(rgb):return np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
palette={'mint':linear(np.array([155,199,180])/255),'cream':linear(np.array([255,244,219])/255),'rose':linear(np.array([213,149,165])/255)}
dt={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
sz={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def read(k):
 a=d['accessors'][k];v=d['bufferViews'][a['bufferView']];off=v.get('byteOffset',0)+a.get('byteOffset',0)
 arr=np.ndarray((a['count'],sz[a['type']]),dtype=dt[a['componentType']],buffer=binary,offset=off,strides=(v.get('byteStride',np.dtype(dt[a['componentType']]).itemsize*sz[a['type']]),np.dtype(dt[a['componentType']]).itemsize)).copy()
 if a.get('normalized') and a['componentType'] in [5121,5123]:arr=arr.astype(float)/np.iinfo(np.dtype(dt[a['componentType']])).max
 return arr
def put(arr,typ,ctype=5126,target=None):
 arr=np.asarray(arr,dtype=dt[ctype]);binary.extend(bytes((-len(binary))%4));off=len(binary);binary.extend(arr.tobytes())
 v={'buffer':0,'byteOffset':off,'byteLength':arr.nbytes}
 if target:v['target']=target
 d['bufferViews'].append(v);a={'bufferView':len(d['bufferViews'])-1,'componentType':ctype,'count':len(arr),'type':typ}
 if typ=='VEC3':a.update(min=arr.min(axis=0).tolist(),max=arr.max(axis=0).tolist())
 d['accessors'].append(a);return len(d['accessors'])-1
def mat(node):
 x,y,z,w=node.get('rotation',[0,0,0,1]);m=np.eye(4)
 m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])@np.diag(node.get('scale',[1,1,1]))
 m[:3,3]=node.get('translation',[0,0,0]);return m
parents={c:i for i,n in enumerate(d['nodes'])for c in n.get('children',[])}
old={}
def world(i):
 if i not in old:old[i]=(world(parents[i])if i in parents else np.eye(4))@mat(d['nodes'][i])
 return old[i]
for i in range(len(d['nodes'])):world(i)
names=[d['nodes'][n]['name']for n in d['skins'][0]['joints']]
head_idx=names.index('Head');neck_idx=names.index('Neck')
head_nodes=set()
def collect(i):
 head_nodes.add(i)
 for c in d['nodes'][i].get('children',[]):collect(c)
collect(d['skins'][0]['joints'][head_idx])
def base_y(y):
 # Lengthen both existing leg surfaces; translate torso/arms without distortion.
 return np.where(y<.55,y*2.2,y+.66)
new={i:m.copy()for i,m in old.items()}
for i,m in new.items():
 if i not in d['skins'][0]['joints']:continue
 m[1,3]=float(base_y(m[1,3]))
 if i in head_nodes:m[1,3]+=.38
 elif d['nodes'][i].get('name')=='Neck':m[1,3]+=.04
delta={}
for i,node in enumerate(d['nodes']):
 if i not in d['skins'][0]['joints']:continue
 nm=(np.linalg.inv(new[parents[i]])if i in parents else np.eye(4))@new[i]
 before=np.array(node.get('translation',[0,0,0]));after=nm[:3,3]
 delta[i]=after-before;node['translation']=after.tolist()
# Inverse bind matrices are recomputed for the modified rest skeleton.
skin=d['skins'][0];old_binds=read(skin['inverseBindMatrices']);binds=[]
for index,i in enumerate(skin['joints']):
 bind=np.linalg.inv(old_binds[index].reshape(4,4).T);bind[1,3]=float(base_y(bind[1,3]))
 if i in head_nodes:bind[1,3]+=.38
 elif d['nodes'][i].get('name')=='Neck':bind[1,3]+=.04
 binds.append(np.linalg.inv(bind).T.reshape(16))
skin['inverseBindMatrices']=put(np.array(binds),'MAT4')
for animation in d['animations']:
 for channel in animation['channels']:
  t=channel['target'];i=t['node']
  if t['path']=='translation'and i in delta:
   sampler=animation['samplers'][channel['sampler']];arr=read(sampler['output'])
   arr+=delta[i];sampler['output']=put(arr,'VEC3')
# The kit's Sitting_Idle has a shallow high-stool bend. Make the existing rig
# sit with forward thighs and downward shins; keep torso/face breathing tracks.
def qmat(q):return mat({'rotation':q})[:3,:3]
def quat(r):
 # Eigenvector formulation tolerates near-180-degree leg rotations.
 k=np.array([[r[0,0]-r[1,1]-r[2,2],r[1,0]+r[0,1],r[2,0]+r[0,2],r[2,1]-r[1,2]],
 [r[1,0]+r[0,1],r[1,1]-r[0,0]-r[2,2],r[2,1]+r[1,2],r[0,2]-r[2,0]],
 [r[2,0]+r[0,2],r[2,1]+r[1,2],r[2,2]-r[0,0]-r[1,1],r[1,0]-r[0,1]],
 [r[2,1]-r[1,2],r[0,2]-r[2,0],r[1,0]-r[0,1],r.trace()]])/3
 vals,vec=np.linalg.eigh(k);q=vec[:,np.argmax(vals)];return q if q[3]>=0 else -q
def align(a,b):
 a=a/np.linalg.norm(a);b=b/np.linalg.norm(b);v=np.cross(a,b);c=float(a@b)
 if c<-.99999:
  axis=np.cross(a,[1,0,0]);axis/=np.linalg.norm(axis);return 2*np.outer(axis,axis)-np.eye(3)
 vx=np.array([[0,-v[2],v[1]],[v[2],0,-v[0]],[-v[1],v[0],0]])
 return np.eye(3)+vx+vx@vx/(1+c)
sit=next(a for a in d['animations']if a['name']=='Sitting_Idle');pose=copy.deepcopy(d['nodes'])
for ch in sit['channels']:
 t=ch['target'];sam=sit['samplers'][ch['sampler']];pose[t['node']][t['path']]=read(sam['output'])[0].tolist()
poseworld={}
def pw(i):
 if i not in poseworld:poseworld[i]=(pw(parents[i])if i in parents else np.eye(4))@mat(pose[i])
 return poseworld[i]
for i in range(len(pose)):pw(i)
lookup={n.get('name'):i for i,n in enumerate(pose)};replacements={}
for side in ['L','R']:
 u=lookup['UpperLeg.'+side];lo=lookup['LowerLeg.'+side];foot=lookup['Foot.'+side]
 ur=pw(u)[:3,:3];lr=pw(lo)[:3,:3];pr=pw(parents[u])[:3,:3]
 length=np.linalg.norm(pw(lo)[:3,3]-pw(u)[:3,3]);direction=np.array([0,-.08,1.]);direction/=np.linalg.norm(direction)
 newur=align(pw(lo)[:3,3]-pw(u)[:3,3],direction)@ur
 newlr=align(lr@np.array([0,1,0]),np.array([0,-1,0]))@lr
 replacements[(u,'rotation')]=quat(np.linalg.inv(pr)@newur)
 replacements[(lo,'rotation')]=quat(np.linalg.inv(newur)@newlr)
 targetfoot=pw(u)[:3,3]+direction*length+np.array([0,-.64,.04])
 footlocal=np.linalg.inv(pw(parents[foot]))@np.r_[targetfoot,1]
 replacements[(foot,'translation')]=footlocal[:3]
for ch in sit['channels']:
 t=ch['target'];key=(t['node'],t['path'])
 if key not in replacements:continue
 sam=sit['samplers'][ch['sampler']];arr=read(sam['output']);arr[:]=replacements[key]
 sam['output']=put(arr,'VEC4'if t['path']=='rotation'else'VEC3')
def skin_mix(items):
 out={}
 for js,ws,f in items:
  for j,w in zip(js,ws):out[int(j)]=out.get(int(j),0)+float(w)*f
 pairs=sorted(out.items(),key=lambda x:-x[1])[:4];total=sum(w for _,w in pairs) or 1
 return [j for j,_ in pairs]+[0]*(4-len(pairs)),[w/total for _,w in pairs]+[0]*(4-len(pairs))
def loop(attrs,tri):
 p=attrs['POSITION'];keys=[tuple(np.round(x,6))for x in p];unique={};ids=[];rep=[]
 for i,k in enumerate(keys):
  if k not in unique:unique[k]=len(rep);rep.append(i)
  ids.append(unique[k])
 ids=np.array(ids);wp=p[rep];edges={};neighbors=[set()for _ in rep]
 for a,b,c in tri:
  a,b,c=ids[[a,b,c]]
  if len({a,b,c})<3:continue
  for x,y,z in[(a,b,c),(b,c,a),(c,a,b)]:
   edge=tuple(sorted((int(x),int(y))));edges.setdefault(edge,[]).append(int(z));neighbors[x].add(int(y));neighbors[y].add(int(x))
 moved=wp.copy()
 for i,near in enumerate(neighbors):
  boundary=[j for j in near if len(edges[tuple(sorted((i,j)))])!=2]
  if len(boundary)==2:moved[i]=.75*wp[i]+.125*(wp[boundary[0]]+wp[boundary[1]])
  elif not boundary and len(near)>=3:
   n=len(near);beta=3/16 if n==3 else 3/(8*n);moved[i]=(1-n*beta)*wp[i]+beta*wp[list(near)].sum(axis=0)
 edgepos={}
 for key,op in edges.items():
  a,b=key;edgepos[key]=.375*(wp[a]+wp[b])+.125*(wp[op[0]]+wp[op[1]])if len(op)==2 else .5*(wp[a]+wp[b])
 out={k:[]for k in attrs if k!='NORMAL'}
 def v(i):return {k:(moved[ids[i]]if k=='POSITION'else a[i])for k,a in attrs.items()if k!='NORMAL'}
 def edge(i,j):
  row={k:(edgepos[tuple(sorted((int(ids[i]),int(ids[j]))))]if k=='POSITION'else .5*(a[i]+a[j]))for k,a in attrs.items()if k not in ['NORMAL','JOINTS_0','WEIGHTS_0']}
  row['JOINTS_0'],row['WEIGHTS_0']=skin_mix([(attrs['JOINTS_0'][i],attrs['WEIGHTS_0'][i],.5),(attrs['JOINTS_0'][j],attrs['WEIGHTS_0'][j],.5)]);return row
 for a,b,c in tri:
  A,B,C=v(a),v(b),v(c);AB,BC,CA=edge(a,b),edge(b,c),edge(c,a)
  for rows in[(A,AB,CA),(B,BC,AB),(C,CA,BC),(AB,BC,CA)]:
   for row in rows:
    for k in out:out[k].append(row[k])
 return {k:np.array(a,dtype=float)for k,a in out.items()},np.arange(len(out['POSITION'])).reshape(-1,3),{'weldedVertices':len(rep),'boundaryEdges':sum(len(v)==1 for v in edges.values()),'nonManifoldEdges':sum(len(v)>2 for v in edges.values())}
reports=[]
for mi,mesh in enumerate(d['meshes']):
 for primitive in mesh['primitives']:
  attrs={k:read(v).astype(float)for k,v in primitive['attributes'].items()};p=attrs['POSITION'];w=attrs['WEIGHTS_0'];j=attrs['JOINTS_0']
  # Sample the already-local atlas, paint mesh vertex colors, leave bitmap untouched.
  uv=attrs['TEXCOORD_0'];xy=np.floor(uv*np.array([atlas.shape[1],atlas.shape[0]])).astype(int);xy=np.clip(xy,[0,0],[atlas.shape[1]-1,atlas.shape[0]-1]);rgb=atlas[xy[:,1],xy[:,0]];colors=linear(rgb)
  if mi==1:
   dark=rgb.max(axis=1)<.45;blue=(rgb[:,2]>rgb[:,0]+.04)&~dark;pink=(rgb[:,0]>rgb[:,1]+.12)&(rgb[:,0]>rgb[:,2]+.025)
   colors[dark]=palette['mint'];colors[blue]=palette['cream'];colors[pink&(p[:,1]<.5)]=palette['rose']
  attrs['COLOR_0']=np.c_[colors,np.ones(len(colors))]
  # Move the connected neck/head surface according to the original skin weights.
  head=(w*(j==head_idx)).sum(axis=1);neck=(w*(j==neck_idx)).sum(axis=1)
  p[:,1]=base_y(p[:,1])+.38*head+.04*neck
  tri=read(primitive['indices']).reshape(-1,3).astype(int);original=len(tri)
  for _ in range(2):attrs,tri,topology=loop(attrs,tri)
  p=attrs['POSITION'];normal=np.zeros_like(p);summed={}
  for a,b,c in tri:
   n=np.cross(p[b]-p[a],p[c]-p[a])
   for i in(a,b,c):k=tuple(np.round(p[i],6));summed[k]=summed.get(k,np.zeros(3))+n
  for i,x in enumerate(p):n=summed[tuple(np.round(x,6))];normal[i]=n/max(np.linalg.norm(n),1e-12)
  attrs['NORMAL']=normal
  # Restore indexing after Loop corner interpolation; UV/skin/color seams remain.
  attrkeys=list(attrs);combined=np.concatenate([attrs[k]for k in attrkeys],axis=1)
  _,first,inverse=np.unique(combined,axis=0,return_index=True,return_inverse=True)
  attrs={k:a[first]for k,a in attrs.items()};tri=inverse[tri]
  for k,a in attrs.items():
   if k=='JOINTS_0':primitive['attributes'][k]=put(a,'VEC4',5123,34962)
   else:primitive['attributes'][k]=put(a,{2:'VEC2',3:'VEC3',4:'VEC4'}[a.shape[1]],5126,34962)
  primitive['indices']=put(tri.reshape(-1,1),'SCALAR',5125,34963)
  reports.append({'mesh':mesh['name'],'sourceTriangles':original,'triangles':len(tri),**topology})
d['materials'][0]['pbrMetallicRoughness'].pop('baseColorTexture',None)
d['materials'][0]['pbrMetallicRoughness'].update(baseColorFactor=[1,1,1,1],roughnessFactor=.85)
d['asset']['extras']={'localModification':'Existing connected skin lengthened at legs and weighted neck/head; two Loop rounds with UV/color/skin interpolation; local mint/cream clothing vertex-color paint. No added neck object.'}
# Discard unused old accessor payloads and the now-unused atlas from the output;
# original self-contained glTF is retained unchanged beside this file.
for key in ['images','textures','samplers']:d.pop(key,None)
used=set()
for mesh in d['meshes']:
 for p in mesh['primitives']:used.update(p['attributes'].values());used.add(p['indices'])
for skin in d['skins']:used.add(skin['inverseBindMatrices'])
for anim in d['animations']:
 for sampler in anim['samplers']:used.update([sampler['input'],sampler['output']])
accessor_map={a:i for i,a in enumerate(sorted(used))}
for mesh in d['meshes']:
 for p in mesh['primitives']:p['attributes']={k:accessor_map[a]for k,a in p['attributes'].items()};p['indices']=accessor_map[p['indices']]
for skin in d['skins']:skin['inverseBindMatrices']=accessor_map[skin['inverseBindMatrices']]
for anim in d['animations']:
 for sampler in anim['samplers']:sampler['input']=accessor_map[sampler['input']];sampler['output']=accessor_map[sampler['output']]
newaccessors=[d['accessors'][a]for a in sorted(used)];view_map={};newviews=[];newbinary=bytearray()
for a in newaccessors:
 oldview=a['bufferView']
 if oldview not in view_map:
  v=copy.deepcopy(d['bufferViews'][oldview]);start=v.get('byteOffset',0);payload=binary[start:start+v['byteLength']]
  newbinary.extend(bytes((-len(newbinary))%4));v['byteOffset']=len(newbinary);newbinary.extend(payload)
  view_map[oldview]=len(newviews);newviews.append(v)
 a['bufferView']=view_map[oldview]
d['accessors']=newaccessors;d['bufferViews']=newviews;binary=newbinary
d['buffers']=[{'byteLength':len(binary)}]
js=json.dumps(d,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary.extend(bytes((-len(binary))%4))
glb=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
(ROOT/'patient-refined.glb').write_bytes(glb)
print(json.dumps({'bytes':len(glb),'meshes':reports,'boneRestWorld':{d['nodes'][i]['name']:new[i][:3,3].tolist()for i in skin['joints']if d['nodes'][i]['name']in['Neck','Head','Body','Hips','UpperLeg.L','LowerLeg.L']}}))

