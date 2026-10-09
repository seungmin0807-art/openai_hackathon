"""Read-only geometry verification; write local asset provenance, not clinical claims."""
from pathlib import Path
import json,struct,hashlib,collections
import numpy as np
root=Path(__file__).resolve().parents[4]
assets=root/'public/assets/clinic'
def inspect(name):
 raw=(assets/name).read_bytes();length=struct.unpack_from('<I',raw,12)[0];d=json.loads(raw[20:20+length]);blob=raw[28+length:]
 def arr(k):
  a=d['accessors'][k];v=d['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];dt={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];s=np.dtype(dt).itemsize
  x=np.ndarray((a['count'],width),dtype=dt,buffer=blob,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*s),s)).copy()
  return x
 reports=[]
 for mesh in d['meshes']:
  positions={};parent=[];edges=collections.Counter();norms=[];weights=[];triangles=0;attrs=set()
  def vertex(p):
   k=tuple(np.round(p,5))
   if k not in positions:positions[k]=len(parent);parent.append(len(parent))
   return positions[k]
  def find(x):
   while parent[x]!=x:parent[x]=parent[parent[x]];x=parent[x]
   return x
  for p in mesh['primitives']:
   attrs.update(p['attributes']);points=arr(p['attributes']['POSITION']);idx=arr(p['indices']).reshape(-1,3);triangles+=len(idx);norms.extend(np.linalg.norm(arr(p['attributes']['NORMAL']),axis=1).tolist());weights.extend(arr(p['attributes']['WEIGHTS_0']).sum(axis=1).tolist())
   for ia,ib,ic in idx:
    a,b,c=[vertex(points[i])for i in [ia,ib,ic]]
    for x,y in [(a,b),(b,c),(c,a)]:parent[find(x)]=find(y);edges[tuple(sorted((x,y)))]+=1
  reports.append({'mesh':mesh.get('name'),'primitiveCount':len(mesh['primitives']),'triangles':triangles,'attributes':sorted(attrs),'weldedVertices':len(parent),'connectedComponents':len({find(i)for i in range(len(parent))}),'boundaryEdges':sum(n==1 for n in edges.values()),'nonManifoldEdges':sum(n>2 for n in edges.values()),'normalLengthRange':[min(norms),max(norms)],'skinWeightSumRange':[min(weights),max(weights)]})
 return {'file':'public/assets/clinic/'+name,'url':'/assets/clinic/'+name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'triangles':sum(m['triangles']for m in reports),'meshes':reports,'animations':[a.get('name')for a in d.get('animations',[])],'skinCount':len(d.get('skins',[])),'externalBuffers':[b.get('uri')for b in d['buffers']if b.get('uri')],'bones':[d['nodes'][i]['name']for s in d.get('skins',[])for i in s['joints']]}
patient=inspect('patient.glb');doctor=inspect('doctor.glb')
idle=json.loads((assets/'source/Idle-render-metadata.json').read_text());sitting=json.loads((assets/'source/Sitting_Idle-render-metadata.json').read_text())
metadata={
 'version':3,'date':'2026-10-09','status':'로컬 GLB 모델 보완 및 단독 렌더 확인. 실제 진료실 의자 배치·게임 동작 최종 QA는 별도.',
 'externalServices':'사용자 금지 이후 새 다운로드·외부 생성·외부 API 호출 없음. 이미 로컬에 확보했던 모델만 오프라인 변환/표면 수정/렌더.',
 'identity':{'activePatient':'의인화 두발 토끼. 흰 털·분홍 귀/코·검은 동공·민트 옷·크림 테두리. 머리/노출된 목/가슴/배/양팔/양다리가 기존 연결 피부 표면에 존재.','activeDoctor':'사람 의사. 따뜻한 피부·갈색 머리·검은 눈/눈썹·크림 가운·민트 셔츠·회녹색 바지.','portrait':'patient.glb를 직접 로컬 WebGL 렌더한 얼굴. 이전 생성 수달과 다른 identity이며 이전 수달 PNG는 현재 사용 대상 아님.'},
 'patient':patient,'doctor':doctor,
 'localPipeline':{'runtime':'Node.js 24.18.1; installed Three.js 0.186.1 FBXLoader/GLTFExporter; Python 3 + NumPy. Blender not installed.','doctorConversion':'source/convert-doctor.mjs: FBX 피부/눈/머리/옷 재질별 팔레트 보정, 양면 재질, 98 source groups를 동일 재질의 6 groups로 합침. 동일 이름 Idle/Walk bone tracks 포함. FBXLoader가 최대 4 skin influences로 줄인 뒤 normalized weights 확인.','patientConversion':'원본 self-contained patient.gltf는 수정하지 않음. source/adjust-patient.py: 기존 다리 표면 Y 길이 증가; 기존 Head/Neck weights에 따라 노출 목 확대; rest/bind matrices와 translation channels 함께 보정; 2회 Loop subdivision; UV·color·skin attribute 보존/보간; skin influences top4 normalized. seam 위치 weld로 smooth normals 계산. 별도 목 오브젝트 또는 구/타원 붙임 없음.','patientPalette':'이미 로컬 atlas를 읽기만 하여 UV에 대응하는 vertex color를 보정. 회색 옷 #9bc7b4, 파랑 trim #fff4db, 신발 #d595a5. 흰 털/검은 동공/분홍 귀·코 유지. 원본 이미지 픽셀 편집 없음.','sitting':'Sitting_Idle의 UpperLegL/R·LowerLegL/R quaternion과 FootL/R 위치를 로컬 보정. 기존 몸통 breathing 유지, thigh +Z forward / shin -Y downward. 진료실 seat height는 Hips bone으로 renderer에서 맞출 것.','render':'private /assets/clinic/preview.html + local Chrome WebGL. 모델 높이에 비례한 camera near/far 사용. Python 이미지 편집·새 이미지 생성 서비스 없음.'},
 'mapping':{'patientBody':'/assets/clinic/patient.glb','doctorBody':'/assets/clinic/doctor.glb','patientDialoguePortrait':'/assets/clinic/patient-portrait.png','privateReview':'/assets/clinic/preview.html','patientIdlePreview':'/assets/clinic/patient-Idle.png','patientSittingSidePreview':'/assets/clinic/patient-sitting-side.png','doctorIdlePreview':'/assets/clinic/doctor-Idle.png'},
 'boneCoordinates':{'space':'GLB source space before room normalization; loaded Three bone names remove periods. Room transforms must be applied before selecting a body region.','rest':{'Neck':[-.0007135737,2.5825478173,-.0747469422],'Head':[-.0007135737,3.1215265286,.0374162124],'Hips':[-.0007135736,1.0050397452,-.2461857199]},'idleBounds':idle['patient']['box'],'idleBones':{b['name']:b['position']for b in idle['patient']['allBones']if b['name']in ['Neck','Head','Body','Hips','UpperLegL','LowerLegL','UpperLegR','LowerLegR']},'sittingBones':{b['name']:b['position']for b in sitting['patient']['allBones']if b['name']in ['Neck','Head','Body','Hips','UpperLegL','LowerLegL','UpperLegR','LowerLegR','FootL','FootR']}},
 'licenses':{'author':'Quaternius','license':'CC0; author official pages explicitly showed CC0 and personal/commercial use before later external-call prohibition.','patientOfficial':'https://quaternius.com/packs/sushirestaurantkit.html','doctorOfficial':'https://quaternius.com/packs/ultimatedanimatedcharacter.html','patientSourceMirror':'https://github.com/agentkaerf/FreeModels/blob/main/Sushi%20Restaurant%20Kit%20-%20May%202023/Characters/Normal/glTF/Rabbit_Bald.gltf','doctorSourceMirror':'https://github.com/nginetechnologies/pack-zoo-character.nplugin/tree/main/Assets/Modular_Toon','localRecord':'public/assets/clinic/LICENSE-attribution.txt is our own attribution/evidence record, not author original license text.','invalidResponses':'HTML responses masquerading as doctor.gltf and LICENSE-quaternius.txt were removed; actual GLBs are binary validated.'},
 'validation':{'binary':'Both headers glTF v2; all buffers embedded; meshes/indices/normal/skin attributes read locally.','render':'Idle and Walk, patient Sitting_Idle at .3 seconds rendered in local Chrome; page/render errors empty. Front and side previews inspected. Portrait is transparent PNG from the same active mesh.','limits':'Not a standard anatomical model or clinically validated patient. Room chair/body-region affordance, all animation frames, child preference and medical education outcomes not verified by this asset-only check. Doctor intentionally retains low-poly source silhouette; patient main connected skin was actually subdivided, not only shaded.'},
 'archivedDrafts':{'bodyBillboardsAllowed':False,'previousImageGenDrafts':'patient-otter-v1/v2.png, patient-otter-portrait-v1.png, doctor-human-v1.png are pre-prohibition concept drafts, not current 3D bodies.','history':'public/assets/clinic/source/imagegen-draft-history.json retains original prompts. No new generation requested.'}
}
(root/'docs/clinic-character-art.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'patient':patient['bytes'],'doctor':doctor['bytes'],'triangles':[patient['triangles'],doctor['triangles']],'meshComponents':[m['connectedComponents']for m in patient['meshes']]}))
