import * as THREE from '/vendor/three.js';
import { EffectComposer, RenderPass, OutlinePass, OutputPass, RoomEnvironment } from '/vendor/three.js';
import {SurfaceTints} from './mesh-tints.js';
import {preloadClinicFurniture,createClinicFurnitureRoom} from './clinic-furniture.js';

const COLORS = { cream: '#fff9ed', mint: '#a8ccbc', blue: '#a5c8d3', peach: '#e7b9a8',
  dark: '#3f5f57', gold: '#d9b574', metal: '#d3e1df' };
const ALIASES = { 'exam-mirror': 'mirror', 'medical-mirror': 'mirror', light: 'flashlight',
  temperature: 'thermometer', wipe: 'cotton', swab: 'cotton', plaster: 'bandage',
  'sensor-clip': 'clip', 'oxygen-clip': 'clip', 'pressure-cuff': 'cuff',
  'sample-tube': 'tube', 'blood-tube': 'tube', 'magnifying-glass': 'magnifier', glove: 'hand' };
const PATIENT_X=1.3;
const CART_POSE={position:[3.7,0,2.9],scale:[4.4,1.28,3.8],trayY:.7968*1.28,topY:.788*1.28};
const toolPrototypes=new Map();let toolPreload;
const TOOL_GLB={stethoscope:'/assets/clinic/blender-candidates/stethoscope.glb',thermometer:'/assets/clinic/blender-candidates/instruments/thermometer.glb',otoscope:'/assets/clinic/blender-candidates/instruments/otoscope.glb',flashlight:'/assets/clinic/blender-candidates/instruments/light.glb',spatula:'/assets/clinic/blender-candidates/instruments/spatula.glb',syringe:'/assets/clinic/blender-candidates/instruments/syringe.glb'};
export async function preloadMedicalTools(){
  const active=['stethoscope','thermometer','otoscope','syringe'];
  if(!toolPreload)toolPreload=Promise.all(active.map(async id=>{const gltf=await new THREE.GLTFLoader().loadAsync(TOOL_GLB[id]);toolPrototypes.set(id,gltf.scene);})).catch(error=>{toolPreload=null;throw error;});
  return toolPreload;
}
function authoredTool(kind,id){
  const prototype=toolPrototypes.get(kind);if(!prototype)return null;
  const root=new THREE.Group(),asset=prototype.clone(true);root.name=kind;root.add(asset);
  asset.traverse(o=>{if(!o.isMesh)return;o.geometry=o.geometry.clone();o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();o.castShadow=true;o.receiveShadow=true;o.userData.toolId=id;});
  // Authored stethoscope is flat XZ; thermometer's probe is on +X. Present
  // all tools in the same upright local convention before lying on supports.
  if(kind==='stethoscope')asset.rotation.x=Math.PI/2;
  if(kind==='thermometer')asset.rotation.z=Math.PI/2;
  root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
  const contactMesh=[];asset.traverse(o=>{if(o.isMesh&&(/diaphragm.*rim/i.test(o.name)&&kind==='stethoscope'||/protective.*lens/i.test(o.name)&&kind==='flashlight'||/hollow.*speculum/i.test(o.name)&&kind==='otoscope'))contactMesh.push(o);});
  const contact=contactMesh.length?new THREE.Box3().setFromObject(contactMesh[0]).getCenter(new THREE.Vector3()):bounds.getCenter(new THREE.Vector3());
  if(kind==='thermometer')contact.set(0,bounds.max.y,0);
  if(kind==='spatula'||kind==='syringe')contact.set(0,bounds.max.y,0);
  if(kind==='stethoscope'&&contactMesh.length)contact.z=new THREE.Box3().setFromObject(contactMesh[0]).max.z;
  if(kind==='flashlight'&&contactMesh.length)contact.y=new THREE.Box3().setFromObject(contactMesh[0]).max.y;
  if(kind==='otoscope'&&contactMesh.length){const b=new THREE.Box3().setFromObject(contactMesh[0]);contact.z=b.max.z;}
  const fitScale=1.85/Math.max(size.x,size.y,size.z);asset.scale.multiplyScalar(fitScale);
  root.userData.contact=contact.multiplyScalar(fitScale);root.userData.grip=new THREE.Vector3();root.userData.source=TOOL_GLB[kind];root.userData.authoredInBlender=true;
  if(kind==='syringe'){
    root.userData.hasSpring=false;
    const moving=[];asset.traverse(o=>{if(o.isMesh&&/solid.*plunger.*shaft|fitted.*piston|rounded.*thumb.*pad/i.test(o.name))moving.push(o);});
    const plunger=new THREE.Group();plunger.name='Syringe plunger assembly';root.add(plunger);root.updateMatrixWorld(true);
    moving.forEach(o=>plunger.attach(o));
    root.userData.plungerNodeName=plunger.name;root.userData.plungerAxis=[0,1,0];root.userData.plungerTravel=.025*fitScale;
  }
  root.updateMatrixWorld(true);
  const fitted=new THREE.Box3().setFromObject(root),center=fitted.getCenter(new THREE.Vector3());root.position.set(-center.x,-fitted.min.y+.04,-center.z);
  return root;
}
const ROOM_TOOL_SLOTS={
  stethoscope:{position:[3.304,CART_POSE.trayY,2.8658],support:'sterile-tray'},mirror:{position:[5.65,1.415,-1.85],support:'sink-counter'},
  thermometer:{position:[-5.7,.975,1.25],support:'bedside-tray'},
  // The wooden blade lies inside the small formed tray, clear of its rolled rim.
  spatula:{position:[4.7296,CART_POSE.trayY,2.8848],support:'sterile-tray',trayBounds:{x:4.7296,z:2.8848,width:.108*4.4,depth:.178*3.8}},
  otoscope:{position:[4.75,1.433,-3.05],support:'wall-holder',upright:true},flashlight:{position:[5.9,1.433,-3.05],support:'wall-holder',upright:true},
  cotton:{position:[5.65,1.415,-1.72],support:'sink-counter'},clip:{position:[3.15,1.415,-1.6],support:'sink-counter'},
  tube:{position:[3.05,1.466,-3.28],support:'sample-rack',upright:true},
  cuff:{position:[-5.7,.975,2.9],support:'bedside-tray'},magnifier:{position:[-4.4,1.02,4.55],support:'storage-cabinet'},
  reflex:{position:[-5.95,1.02,6.4],support:'storage-cabinet'},bandage:{position:[-4.4,1.02,6.4],support:'storage-cabinet'},
  hand:{position:[5.65,1.415,-1.72],support:'sink-counter'},syringe:{position:[-4.3,.975,1.25],support:'bedside-tray'},
  tweezers:{position:[3.7,.995,3.3],support:'sterile-tray'},
};

function disposeMeshes(root) {
  const geometries = new Set(), materials = new Set();
  root?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : object.material ? [object.material] : []).forEach(m => materials.add(m));
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}

// Actual mesh geometry, kept separate from the room and its accessible name.
export function createMedicalTool(id) {
  const kind = ALIASES[id] || id, authored=authoredTool(kind,id);if(authored)return authored;
  const root = new THREE.Group(); root.name = kind;
  const materials = {};
  Object.entries(COLORS).forEach(([key, color]) => {
    materials[key] = new THREE.MeshStandardMaterial({ color, roughness: key === 'metal' ? .16 : .59,
      metalness: key === 'metal' ? .92 : key === 'gold' ? .25 : 0 });
  });
  materials.mirror = new THREE.MeshPhysicalMaterial({ color: '#ecf6f4', metalness: 1,
    roughness: .045, clearcoat: 1, clearcoatRoughness: .04 });
  materials.glass = new THREE.MeshPhysicalMaterial({ color: '#d9edf2', transparent: true,
    opacity: .5, roughness: .12, metalness: .08, depthWrite: false });
  const mesh = (geometry, material, x = 0, y = 0, z = 0) => {
    const item = new THREE.Mesh(geometry, material); item.position.set(x, y, z);
    item.castShadow = true; item.receiveShadow = true; item.userData.toolId = id; root.add(item); return item;
  };
  const ball = (r, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const item = mesh(new THREE.SphereGeometry(r, 28, 20), mat, x, y, z); item.scale.set(sx, sy, sz); return item;
  };
  const cylinder = (r, h, mat, x, y, z) => mesh(new THREE.CylinderGeometry(r, r, h, 36), mat, x, y, z);
  const capsule = (r, length, mat, x, y, z) => mesh(new THREE.CapsuleGeometry(r, length, 8, 20), mat, x, y, z);
  const pipe = (points, r, mat) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(
    points.map(p => new THREE.Vector3(...p))), 48, r, 12, false), mat);
  const ring = (r, tube, mat, x, y, z) => mesh(new THREE.TorusGeometry(r, tube, 12, 60), mat, x, y, z);
  const rounded = (w, h, d, r, mat, x, y, z) => {
    const shape = new THREE.Shape(), a = -w / 2, b = -h / 2;
    shape.moveTo(a + r, b); shape.lineTo(a + w - r, b); shape.quadraticCurveTo(a + w, b, a + w, b + r);
    shape.lineTo(a + w, b + h - r); shape.quadraticCurveTo(a + w, b + h, a + w - r, b + h);
    shape.lineTo(a + r, b + h); shape.quadraticCurveTo(a, b + h, a, b + h - r);
    shape.lineTo(a, b + r); shape.quadraticCurveTo(a, b, a + r, b);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true,
      bevelSize: .025, bevelThickness: .025, bevelSegments: 3, curveSegments: 10 });
    geometry.translate(0, 0, -d / 2); return mesh(geometry, mat, x, y, z);
  };

  switch (kind) {
    case 'stethoscope': {
      pipe([[-.38, 1.05, 0], [-.48, .77, 0], [-.34, .45, 0], [0, .23, 0]], .044, materials.metal);
      pipe([[.38, 1.05, 0], [.48, .77, 0], [.34, .45, 0], [0, .23, 0]], .044, materials.metal);
      ball(.076, materials.mint, -.38, 1.08, 0, 1, 1.25, 1); ball(.076, materials.mint, .38, 1.08, 0, 1, 1.25, 1);
      pipe([[0, .23, 0], [-.5, -.12, 0], [-.43, -.69, 0], [.12, -.8, 0], [.57, -.43, 0], [.58, -.03, .02]], .058, materials.dark);
      const chest = cylinder(.23, .065, materials.metal, .58, .03, .07); chest.rotation.x = Math.PI / 2;
      ring(.215, .035, materials.mint, .58, .03, .116);
      const diaphragm = cylinder(.175, .035, materials.cream, .58, .03, .12); diaphragm.rotation.x = Math.PI / 2;
      break;
    }
    case 'mirror': {
      capsule(.035, 1.05, materials.metal, -.12, -.31, 0).rotation.z = -.25;
      capsule(.062, .4, materials.mint, -.22, -.86, 0).rotation.z = -.25;
      ring(.16, .025, materials.metal, .08, .54, .03);
      const reflector = cylinder(.157, .027, materials.mirror, .08, .54, .047); reflector.rotation.x = Math.PI / 2;
      pipe([[-.01, .28, 0], [.03, .37, .035], [.08, .45, .035]], .033, materials.metal);
      break;
    }
    case 'flashlight': {
      capsule(.145, .8, materials.mint, 0, -.27, 0);
      cylinder(.2, .27, materials.gold, 0, .38, 0);
      const lens = cylinder(.164, .032, materials.cream, 0, .537, 0); lens.rotation.x = .0;
      const rim = ring(.174, .022, materials.metal, 0, .55, 0); rim.rotation.x = -Math.PI / 2;
      ball(.07, materials.gold, 0, -.03, .146, .8, 1.35, .32);
      root.rotation.x = .38; root.rotation.z = -.36; break;
    }
    case 'otoscope': {
      capsule(.11, .92, materials.mint, 0, -.29, 0);
      cylinder(.12, .1, materials.metal, 0, .28, 0);
      ball(.255, materials.cream, .005, .51, .02, 1.15, .93, .68);
      ring(.15, .032, materials.metal, .026, .52, .165);
      const aperture = cylinder(.125, .017, materials.dark, .026, .52, .17); aperture.rotation.x = Math.PI / 2;
      const speculum = mesh(new THREE.ConeGeometry(.13, .36, 32), materials.dark, -.33, .53, -.02); speculum.rotation.z = Math.PI / 2;
      cylinder(.14, .09, materials.gold, -.175, .53, -.02).rotation.z = Math.PI / 2;
      root.rotation.y = -.18; break;
    }
    case 'thermometer': {
      capsule(.105, 1.23, materials.cream, 0, .1, 0);
      capsule(.038, .28, materials.metal, 0, -.81, 0);
      rounded(.13, .28, .012, .025, materials.blue, 0, .33, .105);
      ball(.055, materials.mint, 0, -.05, .106, 1, 1, .35);
      root.rotation.z = -.22; break;
    }
    case 'cotton': {
      rounded(.85, .75, .08, .13, materials.mint, .04, -.31, -.035);
      rounded(.64, .44, .018, .1, materials.cream, .04, -.29, .027);
      ball(.28, materials.cream, -.17, .23, .06, 1.12, 1, .7);
      ball(.255, materials.cream, .21, .4, -.015, 1, 1.05, .65);
      ball(.16, materials.cream, -.05, .43, .055, 1, .95, .8); break;
    }
    case 'bandage': {
      rounded(.58, 1.25, .055, .26, materials.peach, 0, 0, 0);
      rounded(.4, .44, .03, .06, materials.cream, 0, 0, .045);
      [-.42, -.3, .3, .42].forEach(y => [-.12, .12].forEach(x => ball(.027, materials.gold, x, y, .037, 1, 1, .25)));
      root.rotation.z = -.39; break;
    }
    case 'clip': {
      const top = rounded(.82, .18, .36, .075, materials.mint, 0, .13, 0); top.rotation.z = -.13;
      rounded(.82, .16, .36, .075, materials.cream, 0, -.17, 0);
      ball(.093, materials.gold, -.08, .19, .188, 1, .46, .22);
      pipe([[.41, -.02, 0], [.67, -.21, -.05], [.55, -.54, -.02], [.19, -.59, .03]], .028, materials.dark);
      root.rotation.y = -.25; break;
    }
    case 'cuff': {
      const cuff = cylinder(.39, .66, materials.mint, -.14, .15, 0); cuff.rotation.z = Math.PI / 2;
      const edge = ring(.39, .025, materials.cream, -.48, .15, 0); edge.rotation.y = Math.PI / 2;
      rounded(.52, .24, .02, .065, materials.cream, -.1, .33, .327);
      pipe([[.19, -.05, 0], [.65, -.12, 0], [.61, -.58, .04], [.12, -.71, .07]], .034, materials.dark);
      ball(.15, materials.dark, .02, -.7, .06, .78, 1.5, .78);
      const gauge = cylinder(.2, .09, materials.cream, .62, .39, .03); gauge.rotation.x = Math.PI / 2;
      ring(.192, .017, materials.metal, .62, .39, .083);
      pipe([[.62, .39, .09], [.71, .47, .09]], .012, materials.dark); break;
    }
    case 'tube': {
      cylinder(.17, 1.2, materials.glass, 0, -.03, 0);
      ball(.17, materials.glass, 0, -.63, 0, 1, .9, 1);
      cylinder(.2, .22, materials.mint, 0, .68, 0);
      rounded(.23, .38, .012, .035, materials.cream, 0, .1, .171);
      cylinder(.14, .28, materials.blue, 0, -.37, 0);
      root.rotation.z = -.17; break;
    }
    case 'magnifier': {
      ring(.39, .06, materials.gold, 0, .32, 0);
      const glass = cylinder(.37, .027, materials.glass, 0, .32, 0); glass.rotation.x = Math.PI / 2;
      capsule(.06, .15, materials.metal, 0, -.18, 0);
      capsule(.09, .5, materials.mint, 0, -.57, 0);
      root.rotation.z = -.24; break;
    }
    case 'hand': {
      ball(.31, materials.cream, 0, -.09, 0, .85, 1.08, .34);
      [-.21, -.07, .07, .21].forEach((x, i) => capsule(.055, [.25, .4, .37, .23][i], materials.cream, x, .35 + [.0, .05, .04, -.02][i], 0));
      capsule(.065, .23, materials.cream, -.34, -.06, 0).rotation.z = -.75;
      cylinder(.19, .16, materials.mint, 0, -.47, 0); break;
    }
    case 'spatula': {
      rounded(.28,1.68,.045,.135,materials.gold,0,0,0);break;
    }
    case 'reflex': {
      capsule(.037,1.08,materials.metal,0,-.25,0);
      capsule(.055,.26,materials.mint,0,-.91,0);
      const rubber=mesh(new THREE.ConeGeometry(.24,.36,3),materials.peach,0,.52,0);rubber.rotation.z=Math.PI/2;
      cylinder(.07,.17,materials.metal,0,.33,0);break;
    }
    case 'syringe': {
      cylinder(.115,.88,materials.glass,0,.03,0);
      cylinder(.09,.07,materials.mint,0,-.22,0);
      const plunger=rounded(.047,.48,.038,.007,materials.cream,0,.62,0);plunger.name='Syringe plain solid plunger';
      root.userData.hasSpring=false;
      rounded(.34,.07,.08,.035,materials.mint,0,.85,0);
      rounded(.37,.065,.09,.025,materials.cream,0,.47,0);
      cylinder(.064,.19,materials.cream,0,-.49,0);
      capsule(.065,.35,materials.blue,0,-.75,0);
      [-.22,-.07,.08,.23,.36].forEach(y=>rounded(.095,.016,.006,.005,materials.dark,.05,y,.116));break;
    }
    case 'tweezers': {
      pipe([[-.11,-.82,0],[-.13,-.35,0],[-.12,.32,0],[0,.75,0]],.035,materials.metal);
      pipe([[.11,-.82,0],[.13,-.35,0],[.12,.32,0],[0,.75,0]],.035,materials.metal);
      rounded(.085,.31,.055,.025,materials.mint,-.12,.06,0);
      rounded(.085,.31,.055,.025,materials.mint,.12,.06,0);break;
    }
    default:
      Object.values(materials).forEach(m => m.dispose()); throw new Error('지원하지 않는 도구: ' + id);
  }
  const contact={stethoscope:[.58,.03,.12],mirror:[.08,.54,.047],flashlight:[0,.537,0],thermometer:[0,.68,0],
    otoscope:[-.5,.53,0],cotton:[-.05,.35,0],bandage:[0,0,.045],clip:[0,0,0],cuff:[-.14,.15,0],
    tube:[0,-.35,0],magnifier:[0,.32,0],hand:[0,.2,0],spatula:[0,-.8,0],reflex:[0,.52,0],syringe:[0,-.93,0],tweezers:[0,-.8,0]}[kind];
  root.userData.contact=new THREE.Vector3(...contact);
  const grip={stethoscope:[.58,-.03,.08],mirror:[-.13,-.5,0],flashlight:[0,-.25,0],thermometer:[0,.1,0],
    otoscope:[0,-.25,0],cotton:[-.05,.2,0],bandage:[0,-.35,0],clip:[0,0,0],cuff:[-.14,.15,0],tube:[0,.12,0],
    magnifier:[0,-.57,0],hand:[0,-.42,0],spatula:[0,.2,0],reflex:[0,-.5,0],syringe:[0,.2,0],tweezers:[0,.45,0]}[kind];
  root.userData.grip=new THREE.Vector3(...grip);
  // Fit the real geometry, never a padded bounding placeholder, onto the common display shelf.
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3());
  const scale = 1.85 / Math.max(size.x, size.y, size.z);
  root.scale.setScalar(scale); root.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(root), center = fitted.getCenter(new THREE.Vector3());
  root.position.set(-center.x, -fitted.min.y + .04, -center.z);
  // Unused palette materials are released too; all used materials are owned by the mesh tree.
  const used = new Set(); root.traverse(o => { if (o.material) used.add(o.material); });
  Object.values(materials).forEach(m => { if (!used.has(m)) m.dispose(); });
  return root;
}

export class ToolSelector {
  constructor(container, { onCorrect = () => {}, onWrong = () => {}, reducedMotion = false } = {}) {
    Object.assign(this, { container, onCorrect, onWrong, reducedMotion });
    this.ready = false; this.visible = false; this.locked = false; this.paused = false; this.models = [];
    this.toolMeshes = []; this.timers = new Set(); this.lastSelection = null; this.lastResult = null;
    this._epoch = 0; this._disposed = false;
    this._personTokens = {patient:0,doctor:0}; this._personObjects = {};
    this.phase = 'choice'; this._flowToken = 0; this._tweens = []; this._materialState = new WeakMap();
    container.id ||= 'tool-selection'; container.classList.add('tool-selection'); container.hidden = true;
    container.setAttribute('role', 'dialog'); container.setAttribute('aria-modal', 'true');
    container.setAttribute('aria-labelledby', 'tool-selection-heading'); container.tabIndex = -1;
    this.panel = document.createElement('section'); this.panel.className = 'tool-selection-panel';
    const header = document.createElement('header'); header.className = 'tool-selection-header';
    const intro = document.createElement('div');
    const eyebrow = document.createElement('p'); eyebrow.className = 'tool-selection-eyebrow'; eyebrow.textContent = '먼저 도구를 골라요';
    this.heading = document.createElement('h2'); this.heading.id = 'tool-selection-heading'; intro.append(eyebrow, this.heading);
    header.append(intro);
    this.stage = document.createElement('div'); this.stage.className = 'tool-selection-stage';
    this.labels = document.createElement('div'); this.labels.className = 'tool-selection-labels';
    this.status = document.createElement('p'); this.status.className = 'tool-selection-status';
    this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
    this.status.textContent = '도구를 톡 골라요.'; this.panel.append(header, this.stage, this.status); container.replaceChildren(this.panel);
    this.panControls=document.createElement('nav');this.panControls.className='tool-selection-pan';this.panControls.hidden=true;
    this.panButtons=[[-1,'왼쪽 작업대','‹'],[1,'오른쪽 작업대','›']].map(([direction,label,glyph])=>{
      const button=document.createElement('button');button.type='button';button.textContent=glyph;button.setAttribute('aria-label',label);
      button.addEventListener('click',()=>this.panRoom(direction<0?-4.2:4.2));this.panControls.append(button);return button;
    });this.panel.append(this.panControls);
    this._onKey = event => this._key(event); container.addEventListener('keydown', this._onKey);
    this._resizeObserver = new ResizeObserver(() => this.resize()); this._resizeObserver.observe(this.stage);
    try { this._setupScene(); this.ready = true; }
    catch (error) {
      this.error = error.message; this.status.textContent = '도구 이름을 눌러 골라요.';
      this.stage.classList.add('tool-selection-fallback'); this.stage.append(this.labels);
    }
  }

  _setupScene() {
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#c6d4c9');
    this.people = new THREE.Group(); this.people.name = 'Clinic people assets'; this.scene.add(this.people);
    this.camera = new THREE.OrthographicCamera(-5, 5, 3, -3, .1, 60);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .82; this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', '입체 의료 도구 선택');
    this.stage.append(this.renderer.domElement, this.labels);
    const pmrem = new THREE.PMREMGenerator(this.renderer), room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, .04); this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = .65;
    room.dispose(); pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight('#fff9ef', '#91ac97', 1.1));
    const key = new THREE.DirectionalLight('#fff6df', 2); key.position.set(-3, 7, 5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -3 });
    key.shadow.normalBias = .025; this.scene.add(key);
    const fill = new THREE.DirectionalLight('#d6e5ec', .65); fill.position.set(4, 3, -2); this.scene.add(fill);
    this.composer = new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.outline = new OutlinePass(new THREE.Vector2(1, 1), this.scene, this.camera);
    this.outline.edgeStrength = 7; this.outline.edgeGlow = .1; this.outline.edgeThickness = 4;
    // A colored contour must remain visible on pale metal. The stock additive
    // blend only brightens that surface; normal alpha blending retains its hue.
    this.outline.overlayMaterial.blending = THREE.NormalBlending;
    this.outline.overlayMaterial.fragmentShader = this.outline.overlayMaterial.fragmentShader.replace(
      'gl_FragColor = finalColor;',
      'gl_FragColor = vec4(finalColor.rgb / max(finalColor.a, 0.0001), clamp(finalColor.a, 0.0, 1.0));');
    this.outline.overlayMaterial.needsUpdate = true;
    this.outline.pulsePeriod = 0; this.composer.addPass(this.outline); this.output = new OutputPass(); this.composer.addPass(this.output);
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this._pointerDown = event => {
      if(event.button!==0)return;
      const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((event.clientX-r.x)/r.width*2-1,-(event.clientY-r.y)/r.height*2+1);
      this.raycaster.setFromCamera(this.pointer,this.camera);
      this.down={x:event.clientX,y:event.clientY,id:event.pointerId,pan:this._roomPan??-4.2,onTool:!!this._visibleToolHit(this.raycaster)};
    };
    this._pointerMove=event=>{
      const down=this.down;if(!down||down.id!==event.pointerId||down.onTool||this.phase!=='choice'||this.models.length<=6||this.stage.clientWidth>=580)return;
      const delta=event.clientX-down.x;if(Math.abs(delta)<12&&!down.dragged)return;
      down.dragged=true;this._roomPan=THREE.MathUtils.clamp(down.pan-delta/this.stage.clientWidth*(this.camera.right-this.camera.left),-4.2,4.2);this.resize();
    };
    this._pointerUp = event => {
      const down = this.down; this.down = null;
      if (!down || down.id !== event.pointerId || !this.visible || (this.locked && this.phase !== 'body-choice') ||
        Math.hypot(down.x - event.clientX, down.y - event.clientY) > 12) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      this.camera.updateMatrixWorld(); this.scene.updateMatrixWorld(true);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      if(this.phase==='body-choice') {
        const hit=this.raycaster.intersectObjects(this._patientMeshes||[],false)[0];
        if(hit)this._selectBody(hit);
        return;
      }
      if(this.phase!=='choice')return;
      const hit = this._visibleToolHit(this.raycaster);
      if (hit) this.select(hit.object.userData.toolId);
    };
    this._pointerCancel = () => { this.down = null; };
    this.renderer.domElement.addEventListener('pointerdown', this._pointerDown);
    this.renderer.domElement.addEventListener('pointerup', this._pointerUp);
    this.renderer.domElement.addEventListener('pointermove',this._pointerMove);
    this.renderer.domElement.addEventListener('pointercancel', this._pointerCancel);
  }

  show(challenge) {
    if (this._disposed) return;
    if (!challenge?.choices?.length || !challenge.choices.some(c => c.id === challenge.correctToolId))
      throw new Error('도구 선택 문제의 정답과 선택지를 확인해 주세요.');
    if (challenge.choices.length > 16 || new Set(challenge.choices.map(c => c.id)).size !== challenge.choices.length)
      throw new Error('서로 다른 도구를 최대 16개까지 보여줄 수 있어요.');
    const returnCamera=this.phase!=='choice'&&this._cameraPoseInitialized;
    this._cancelFlow(); this.phase='choice'; this._cancelTimers(); this._epoch++; this._clearModels(); this.challenge = challenge;
    const lastAnatomy=this._anatomyGroup;this._anatomyGroup=null;
    this._fadeObject(this.people,returnCamera?0:1);this._clearRegionContour();
    Object.values(this._personObjects).forEach(p=>{p.root.visible=true;});
    this._deferRoomCamera=returnCamera;
    this.lastSelection = null; this.lastResult = null; this.locked = false; this.visible = true;
    this.labels.hidden=false;this.status.hidden=false;this._regionLocked=false;this._lastRegion=null;
    this.previousFocus = document.activeElement; this.container.hidden = false; this.heading.textContent = challenge.prompt;
    this.status.textContent = this.ready ? '도구를 톡 골라요.' : '도구 이름을 눌러 골라요.';
    this.labels.replaceChildren(); this.buttons = challenge.choices.map(choice => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'tool-selection-name';
      button.textContent = choice.name; button.setAttribute('aria-label', choice.name + ' 선택');
      button.title=choice.name;
      button.addEventListener('focus',()=>{if(this.phase==='choice'&&this.models.length>6&&this.stage.clientWidth<580)this.panToTool(choice.id);});
      button.addEventListener('click', () => this.select(choice.id)); this.labels.append(button);
      if (this.ready) {
        const display = new THREE.Group(), model = createMedicalTool(choice.id);
        const kind=ALIASES[choice.id]||choice.id;
        model.rotation.x=-Math.PI/2;model.rotation.y=0;
        const slot=challenge.choices.length>=4?ROOM_TOOL_SLOTS[kind]:null;
        if(slot)model.scale.setScalar(kind==='spatula'?.32:['cuff','cotton','hand'].includes(kind)?.64:kind==='tube'?.65:.78);
        if(slot?.upright||kind==='tube')model.rotation.set(0,0,0);
        model.userData.roomSlot=slot||null;
        model.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(model),c=b.getCenter(new THREE.Vector3());
        model.position.add(new THREE.Vector3(-c.x,-b.min.y+.003,-c.z));
        display.add(model); this.scene.add(display);
        model.traverse(object => { if (object.isMesh) this.toolMeshes.push(object); });
        this.models.push({ id: choice.id, display, model, button, baseRotation: model.rotation.clone() });
      }
      return button;
    });
    this.resize();this._deferRoomCamera=false;
    if(returnCamera&&this._roomPose){
      this.phase='returning';this.labels.hidden=true;const epoch=this._epoch;
      Promise.all([this._moveCamera(this._roomPose,850),this._animate(650,t=>{
        this._fadeObject(this.people,t);if(lastAnatomy)this._fadeObject(lastAnatomy,1-t);
      })]).then(()=>{if(epoch!==this._epoch)return;this.phase='choice';if(lastAnatomy)lastAnatomy.visible=false;this.labels.hidden=false;this.resize();});
    }
    this.container.focus({ preventScroll: true }); this._startLoop();
  }

  resize() {
    if (!this.visible || !this.ready) return;
    const width = this.stage.clientWidth, height = this.stage.clientHeight;
    if (!width || !height) return;
    const touch=matchMedia('(pointer: coarse)').matches,wideTouch=width>height&&(touch||height<520),mobile=width<580||touch||wideTouch;
    this._wideTouch=wideTouch;
    const count = this.models.length, columns = count>=4?4:mobile ? Math.min(2, count) : Math.min(3, count);
    this.panControls.hidden=!(count>=4&&mobile&&!wideTouch&&this.phase==='choice');
    const rows = Math.ceil(count / columns), aspect = width / height;
    if(this.phase==='choice')this.models.forEach((item, index) => {
      const row = Math.floor(index / columns), col = index % columns;
      const inRow = Math.min(columns, count - row * columns);
      if(count>=4){
        const kind=ALIASES[item.id]||item.id,scale=kind==='spatula'?.32:wideTouch?({thermometer:1.1,syringe:.98,stethoscope:.82}[kind]||(['cotton','hand','cuff'].includes(kind)?.64:kind==='tube'?.65:.78)):(['cotton','hand','cuff'].includes(kind)?.64:kind==='tube'?.65:.78);
        if(item.model.scale.x!==scale){item.display.position.set(0,0,0);item.model.scale.setScalar(scale);item.model.position.set(0,0,0);item.display.updateMatrixWorld(true);
          const b=new THREE.Box3().setFromObject(item.model),c=b.getCenter(new THREE.Vector3());item.model.position.add(new THREE.Vector3(-c.x,-b.min.y+.003,-c.z));}
        const slot=ROOM_TOOL_SLOTS[ALIASES[item.id]||item.id];item.display.position.set(...slot.position);
        if(slot.trayBounds){
          item.display.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(item.model),t=slot.trayBounds;
          const dx=Math.max(t.x-t.width/2-b.min.x,Math.min(0,t.x+t.width/2-b.max.x));
          const dz=Math.max(t.z-t.depth/2-b.min.z,Math.min(0,t.z+t.depth/2-b.max.z));
          item.display.position.x+=dx;item.display.position.z+=dz;
        }
      }else if (count <= 3 && !mobile) {
        const positions = [[-2.65, .865, 1.75], [-.35, .865, 2.35], [3.1, 1.118, .65]];
        item.display.position.set(...positions[index]);
      } else if (count <= 3) {
        const positions = [[-1.48, .865, 1.55], [1.4, .865, 1.95], [.15, .865, 4.2]];
        item.display.position.set(...positions[index]);
      } else item.display.position.set((col - (inRow - 1) / 2) * 2.65, .865, .7 + row * 2.8);
      if(count<4&&(ALIASES[item.id]||item.id)==='tube')item.display.position.y=.936;
    });
    const tableKey = mobile + ':' + this.models.map(m=>m.id).join(',');
    if (this.phase==='choice'&&this.tableKey !== tableKey) { this._makeRoom(mobile, count); this.tableKey = tableKey; }
    const centerY = wideTouch?1.8:mobile ? 1 : 2.55;
    const span = count>=4?(wideTouch?Math.max(2.75,6.5/aspect):mobile?6.1:Math.max(3.7,6.9/aspect)):(mobile?Math.max(4.35,3.0/aspect):Math.max(4.15,6.5/aspect));
    const pan=count>=4&&mobile&&!wideTouch?(this._roomPan??-4.2):0;
    this._roomPose={position:new THREE.Vector3(.3+pan,centerY+(count>=4?6:4.8),14),lookAt:new THREE.Vector3(pan,centerY,wideTouch?-.2:count>=4?.7:mobile?1.15:-.15),span};
    if(this.phase==='choice'&&!this._deferRoomCamera)this._applyCamera(this._roomPose);
    else {
      let span=this.camera.top;
      if(this.phase==='body-choice'){
        this._partPositions();const s=new THREE.Box3().setFromObject(this._personObjects.patient.root).getSize(new THREE.Vector3());
        span=Math.max(1.7,s.y*.66,s.x*.62/aspect);
      }else if(this.phase==='game'){
        if(this._focusMode==='patient'){
          this._partPositions();const b=new THREE.Box3().setFromObject(this._personObjects.patient.root),s=b.getSize(new THREE.Vector3()),y=this._cameraLook?.y||b.getCenter(new THREE.Vector3()).y;
          span=Math.max(1.5,s.y*.63,s.x*.62/aspect,(b.max.y-y)*1.14,(y-b.min.y)*1.14);
        }else span=Math.max(1.3,(this._focusSize||3.3)*.57/aspect);
      }
      if(this._patientFocusTarget&&(this.phase==='body-choice'||(this.phase==='game'&&this._focusMode==='patient'))){
        const size=new THREE.Box3().setFromObject(this._personObjects.patient.root).getSize(new THREE.Vector3());
        this._applyCamera(this._patientCameraPose(this._patientFocusTarget,span,size,this.phase==='body-choice'?.35:.16));
      }else if(this.phase==='game'&&this._focusMode==='anatomy'&&this._anatomyGroup&&this._anatomyFocusTarget){
        const bounds=new THREE.Box3().setFromObject(this._anatomyGroup),size=bounds.getSize(new THREE.Vector3()),target=this._anatomyFocusTarget;
        const native=this._anatomyGroup.userData.examinationFraming;
        if(native){const padding=native.fitPadding??.6;span=Math.max(native.minSpan,native.size.y*padding,size.y*padding);const pose=this._patientCameraPose(native.target,span,native.size,0,false);if(native.cameraOffset)pose.position.copy(pose.lookAt).add(native.cameraOffset);this._applyCamera(pose);}
        else{span=Math.max(span,size.y*.6,Math.abs(bounds.max.y-target.y)*1.12,Math.abs(target.y-bounds.min.y)*1.12);this._applyCamera(this._patientCameraPose(target,span,size,0,false));}
      }else{this.camera.top=span;this.camera.bottom=-span;this.camera.left=-span*aspect;this.camera.right=span*aspect;this.camera.updateProjectionMatrix();}
    }
    this._cameraPoseInitialized=true;
    this.renderer.setSize(width, height, false); this.composer.setSize(width, height);
    this._positionLabels();
    if(this.phase==='choice')this._placePeople(mobile);
    this._draw();
  }
  _positionLabels() {
    const width=this.stage.clientWidth,height=this.stage.clientHeight;
    this.models.forEach(item => {
      const point = item.display.position.clone().add(item.model.userData.roomSlot?.upright?new THREE.Vector3(0,-.13,.2):new THREE.Vector3(0,-.04,this._wideTouch?.8:1.08)).project(this.camera);
      const labelHalf=Math.max(35,item.button.offsetWidth/2),safe=labelHalf+8;
      item.button.style.left = THREE.MathUtils.clamp((point.x * .5 + .5) * width,safe,Math.max(safe,width-safe)) + 'px';
      item.button.style.top = (-point.y * .5 + .5) * height + 'px';
    });
  }
  panRoom(x) {
    if(this.phase!=='choice'||this.locked||this.models.length<6||this._wideTouch)return Promise.resolve(false);
    this._roomPan=THREE.MathUtils.clamp(x,-4.2,4.2);this._deferRoomCamera=true;this.resize();this._deferRoomCamera=false;
    return this._moveCamera(this._roomPose,400);
  }
  panToTool(id) {const tool=this.models.find(m=>m.id===id);return tool?this.panRoom(tool.display.position.x<0?-4.2:4.2):Promise.resolve(false);}

  // Real GLB/Object3D boundary. Missing keys preserve the existing person.
  async setPeople(data = {}) {
    if (!this.ready || this._disposed) return [];
    try{await Promise.all([preloadClinicFurniture(),preloadMedicalTools()]);this._furnitureError=null;}
    catch(error){this._furnitureError=error.message;console.warn('진료실 가구를 불러오지 못했습니다.',error);}
    const results = await Promise.all(['patient','doctor'].map(async role => {
      if (!(role in data) && !(role+'Src' in data)) return null;
      const record = data[role] ?? (data[role+'Src'] ? {src:data[role+'Src']} : null);
      const token = ++this._personTokens[role];
      this._clearPerson(role);
      if (!record) return {role,ready:false};
      const config = typeof record === 'string' ? {src:record} : record;
      const defaultPosition = role==='patient' ? [PATIENT_X,0,-1.2] : [-.9,0,-.3];
      const position = config.position || defaultPosition, height = config.height || (role==='patient'?2.4:3.0);
      let root, ownedTexture, clips=config.animations||[];
      try {
        let asset;
        if(config.object?.isObject3D)asset=THREE.cloneSkeleton?THREE.cloneSkeleton(config.object):config.object.clone(true);
        else if(config.src&&/\.(glb|gltf)(?:\?|$)/i.test(config.src)) {
          if(new URL(config.src,location.href).origin!==location.origin)throw new Error('인물은 로컬 앱의 3D 파일만 연결해 주세요.');
          if(!THREE.GLTFLoader)throw new Error('GLTFLoader가 포함된 vendor 번들이 필요합니다.');
          const gltf=await new THREE.GLTFLoader().loadAsync(config.src);asset=gltf.scene;clips=gltf.animations;
        }else throw new Error('인물은 실제 GLB 또는 Object3D 모델로 연결해 주세요.');
        if(asset) {
          root=asset;
          root.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();o.castShadow=true;o.receiveShadow=true;
            (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{m.metalness=0;m.roughness=.78;
              if(role==='doctor'&&m.name==='M_Brown_1')m.color.set('#cf936f');
            });
          }});
          root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());
          root.scale.multiplyScalar(height/Math.max(size.y,.01));root.updateMatrixWorld(true);
          const b=new THREE.Box3().setFromObject(root),center=b.getCenter(new THREE.Vector3());root.position.set(-center.x,-b.min.y,-center.z);
          const anchor=new THREE.Group();anchor.add(root);root=anchor;
        }
        if(token!==this._personTokens[role]||this._disposed){disposeMeshes(root);ownedTexture?.dispose();return null;}
        root.name=role;root.userData.autoPosition=!config.position;root.position.set(...position);
        const mixer=clips.length?new THREE.AnimationMixer(root):null;
        const idle=role==='patient'?(clips.find(c=>/sitting_idle/i.test(c.name))||clips.find(c=>/^idle$|stand/i.test(c.name))):clips.find(c=>/^idle$|stand/i.test(c.name)),walk=clips.find(c=>/walk|run|locomot/i.test(c.name));
        const walkBones=[];root.traverse(o=>{if(o.isBone&&/upleg|upper.?leg|thigh|lower.?leg|calf|shin|upper.?arm/i.test(o.name))walkBones.push({bone:o,rotation:o.rotation.clone(),side:/left|\.l$|_l$|^l_/i.test(o.name)?1:-1});});
        this.people.add(root);this._personObjects[role]={root,texture:ownedTexture,mixer,idle,walk,walkBones,config,height};
        if(mixer&&idle){mixer.clipAction(idle).play();mixer.update(.0001);}
        if(role==='patient'){
          root.updateMatrixWorld(true);let hips;root.traverse(o=>{if(o.isBone&&/^hips$/i.test(o.name))hips=o;});
          this._personObjects[role].seatOffset=hips?.getWorldPosition(new THREE.Vector3()).y-root.position.y;
          this._personObjects[role].sittingSurface=this._sittingSurface(root);
        }
        this._placePeople(this.stage.clientWidth<580);this._draw();
        return {role,ready:true,position:[...position],height};
      } catch(error){if(root)disposeMeshes(root);ownedTexture?.dispose();return {role,ready:false,error:error.message};}
    }));
    return results.filter(Boolean);
  }
  _clearPerson(role) {
    const person=this._personObjects[role];if(!person)return;
    this.people.remove(person.root);disposeMeshes(person.root);person.texture?.dispose();delete this._personObjects[role];
    person.mixer?.stopAllAction();person.mixer?.uncacheRoot(person.root);
  }
  _placePeople(mobile) {
    Object.entries(this._personObjects).forEach(([role,{root}])=>{
      if(root.userData.autoPosition){if(role==='patient')this._seatPerson(this._personObjects.patient);else root.position.set(-.9,0,-.3);}
      root.rotation.y=Math.atan2(this.camera.position.x-root.position.x,this.camera.position.z-root.position.z);
    });
  }
  _sittingSurface(root){
    root.updateMatrixWorld(true);const pelvis=new THREE.Box3(),feet=new THREE.Box3();
    root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();const p=mesh.geometry.attributes.position,j=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight;
      for(let i=0;i<p.count;i++){let hipWeight=0,footWeight=0;for(let k=0;k<4;k++){const name=mesh.skeleton.bones[j.getComponent(i,k)]?.name||'';if(/^hips$/i.test(name))hipWeight+=w.getComponent(i,k);if(/^foot[._]?[LR]$/i.test(name))footWeight+=w.getComponent(i,k);}
        if(hipWeight<.25&&footWeight<.25)continue;const point=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).sub(root.position);if(hipWeight>.25)pelvis.expandByPoint(point);if(footWeight>.25)feet.expandByPoint(point);}
    });
    if(pelvis.isEmpty()||feet.isEmpty())return null;
    return {pelvisY:pelvis.min.y,soleY:feet.min.y,footZ:feet.getCenter(new THREE.Vector3()).z};
  }
  _seatPerson(person){
    const chair=this.table?.getObjectByName('patientChair'),surface=person.sittingSurface;
    if(!chair||!surface){person.root.position.set(PATIENT_X,.91-(person.seatOffset||.82),-.6);return;}
    // Fit the existing chair to the actual sitting skin, not the hip joint
    // centre. Soles rest on the authored footrest; knees clear the seat front.
    const yScale=THREE.MathUtils.clamp((surface.pelvisY-surface.soleY)/(.82-.22),.25,1);
    chair.scale.set(.82,yScale,.62);
    const seat=.82*yScale,footrest=.22*yScale;
    person.root.position.set(PATIENT_X,seat+.012-surface.pelvisY,chair.position.z+1.12*.62-surface.footZ);
    person.root.userData.seating={seatTop:seat,footrestTop:footrest,soleY:footrest+.012,pelvisY:seat+.012,chairScale:chair.scale.toArray()};
    person.root.updateMatrixWorld(true);
  }

  _makeRoom() {
    const furniture=createClinicFurnitureRoom();
    if(!furniture){
      this.container.dataset.furnitureReady='false';
      this.status.textContent='진료실을 불러오지 못했어요. 새로고침해 주세요.';
      throw new Error('최신 진료실 가구를 불러오지 못했습니다.');
    }
    if(this.table){this.scene.remove(this.table);disposeMeshes(this.table);}
    this.table=furniture;this._stations=[];this.scene.add(furniture);
    const cart=furniture.getObjectByName('trolley');
    if(cart){cart.position.set(...CART_POSE.position);cart.scale.set(...CART_POSE.scale);cart.userData.toolSurface={trayY:CART_POSE.trayY,topY:CART_POSE.topY};}
    this.container.dataset.furnitureReady='true';
    this.container.dataset.furnitureAssets=furniture.userData.furnitureAssets.join(',');
  }
  _applyCamera(pose) {
    const aspect=Math.max(.1,this.stage.clientWidth/Math.max(1,this.stage.clientHeight));
    this.camera.position.copy(pose.position);this.camera.lookAt(pose.lookAt);
    this._cameraLook=pose.lookAt.clone();this.camera.top=pose.span;this.camera.bottom=-pose.span;
    this.camera.left=-pose.span*aspect;this.camera.right=pose.span*aspect;
    this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
  }
  _animate(duration,step) {
    return new Promise(resolve=>{
      this._tweens.push({start:performance.now(),duration,step,resolve});
      // A slow GPU must not postpone every walking waypoint until another RAF.
      // This clock only updates transforms; the existing RAF still draws them.
      if(!this._flowClock)this._flowClock=setInterval(()=>this._advanceTweens(performance.now()),33);
      this._startLoop(true);
    });
  }
  _moveCamera(pose,duration=1100) {
    const from={position:this.camera.position.clone(),lookAt:(this._cameraLook||new THREE.Vector3()).clone(),span:this.camera.top};
    return this._animate(duration,t=>this._applyCamera({position:from.position.clone().lerp(pose.position,t),
      lookAt:from.lookAt.clone().lerp(pose.lookAt,t),span:THREE.MathUtils.lerp(from.span,pose.span,t)}));
  }
  _cancelFlow() {
    this._flowToken++;clearInterval(this._flowClock);this._flowClock=null;this._tweens.splice(0).forEach(t=>t.resolve(false));
    Object.values(this._personObjects).forEach(p=>this._walkPerson(p,false));
  }
  _walkPerson(person,moving) {
    if(!person)return;person.walking=moving;
    if(person.mixer){person.mixer.stopAllAction();const clip=moving?person.walk:person.idle;if(clip)person.mixer.clipAction(clip).reset().play();}
    if(!moving)person.walkBones?.forEach(b=>b.bone.rotation.copy(b.rotation));
    // show() resets the clips before the reduced-motion loop stops. Apply their
    // first pose after neutral joint restoration, without waiting for an RAF.
    person.mixer?.update(.001);person.root.updateMatrixWorld(true);
  }
  _reachHand(person,target,amount) {
    let hand;const joints=[];
    person.root.traverse(o=>{if(!o.isBone)return;if(/fist_r|righthand|hand[._]?r/i.test(o.name))hand=o;
      if(/lowerarm_r|upperarm_r|^torso$/i.test(o.name))joints.push(o);});
    if(!hand)return;
    joints.sort((a,b)=>(/lower/i.test(a.name)?0:/upper/i.test(a.name)?1:2)-(/lower/i.test(b.name)?0:/upper/i.test(b.name)?1:2));
    for(let pass=0;pass<2;pass++)for(const joint of joints){
      person.root.updateMatrixWorld(true);const pivot=joint.getWorldPosition(new THREE.Vector3()),effector=hand.getWorldPosition(new THREE.Vector3());
      const a=effector.sub(pivot),b=target.clone().sub(pivot);if(a.lengthSq()<.00001||b.lengthSq()<.00001)continue;
      const delta=new THREE.Quaternion().setFromUnitVectors(a.normalize(),b.normalize()),angle=2*Math.acos(Math.min(1,Math.abs(delta.w))),limit=/torso/i.test(joint.name)?.26:.8;
      delta.slerp(new THREE.Quaternion(),1-amount*Math.min(1,limit/Math.max(.0001,angle)));
      const world=joint.getWorldQuaternion(new THREE.Quaternion()).premultiply(delta),parent=joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      joint.quaternion.copy(parent.multiply(world));
    }
  }
  _fadeObject(root,amount) {
    root?.traverse(o=>{if(!o.isMesh)return;
      (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
        let original=this._materialState.get(m);if(!original){original={opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite};this._materialState.set(m,original);}
        const transparent=amount<.999||original.transparent;
        if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}
        m.opacity=original.opacity*amount;m.depthWrite=amount>.95&&original.depthWrite;
      });
    });
  }
  async beginExam({caseId=this.challenge?.caseId,onRegion=()=>{},onReady=()=>{},regionPrompt,targetRegion}={}) {
    if(this.phase!=='choice'||this.lastResult!=='correct')return false;
    const doctor=this._personObjects.doctor,patient=this._personObjects.patient;
    if(!doctor||!patient){this.status.textContent='진료실의 3D 인물을 준비하고 있어요.';return false;}
    const token=++this._flowToken;this.exam={caseId,onRegion,onReady};this.locked=true;
    this.labels.hidden=true;this.panControls.hidden=true;this.outline.selectedObjects=[];this._clearRegionContour();
    this.phase='doctor-walk';this.status.textContent='선생님이 도구를 가져올게요.';
    const item=this.models.find(m=>m.id===this.challenge.correctToolId),start=doctor.root.position.clone();
    const destination=item.display.position.clone();destination.y=start.y;destination.z-=.55;
    const support=item.model.userData.roomSlot?.support;
    if(support==='bedside-tray'||support==='storage-cabinet'){destination.x=-3.05;destination.z=item.display.position.z;}
    else if(support==='sterile-tray'){destination.x=item.display.position.x;destination.z=1.65;}
    else if(support==='sink-counter'||support==='sample-rack'){destination.z=-.1;}
    else if(support==='wall-holder'){destination.z=-.1;}
    await this._walkRoute(doctor,[new THREE.Vector3(.1,start.y,.8),new THREE.Vector3(destination.x,start.y,.8),destination],token);
    if(token!==this._flowToken)return false;
    this._walkPerson(doctor,false);this.phase='pickup';
    item.model.updateWorldMatrix(true,false);const grip=item.model.userData.grip||new THREE.Vector3(),gripTarget=item.model.localToWorld(grip.clone());
    await this._animate(420,t=>this._reachHand(doctor,gripTarget,t));
    if(token!==this._flowToken)return false;
    let hand;doctor.root.traverse(o=>{if(!hand&&/right.?hand|hand.?r|wrist.?r|middle1\.r|hand\.r|fist_r/i.test(o.name))hand=o;});
    if(!hand){hand=new THREE.Group();hand.name='Held instrument anchor';hand.position.set(.46,doctor.height*.48,.15);doctor.root.add(hand);}
    item.model.updateWorldMatrix(true,false);const scale=item.model.getWorldScale(new THREE.Vector3());
    hand.attach(item.model);const handScale=hand.getWorldScale(new THREE.Vector3());
    item.model.position.set(0,0,0);item.model.scale.set(scale.x/handScale.x*.42,scale.y/handScale.y*.42,scale.z/handScale.z*.42);
    item.model.rotation.set(.12,.1,-.55);this.heldTool=item.model;
    const gripLock=()=>item.model.position.copy(grip.clone().multiply(item.model.scale).applyEuler(item.model.rotation).negate());gripLock();
    await this._animate(380,t=>{this._reachHand(doctor,gripTarget,1-t);item.model.rotation.z=-.55+t*.25;gripLock();});
    if(token!==this._flowToken)return false;
    this.phase='approach';this.status.textContent='어디를 살펴볼지 같이 찾아봐요.';
    const part=targetRegion||this._requiredPart(caseId),patientPosition=patient.root.position;
    this._partPositions();const patientBounds=new THREE.Box3().setFromObject(patient.root),patientSize=patientBounds.getSize(new THREE.Vector3()),patientCenter=patientBounds.getCenter(new THREE.Vector3());
    const aspect=this.stage.clientWidth/this.stage.clientHeight;
    const approach=this._patientCameraPose(patientCenter,Math.max(1.7,patientSize.y*.66,patientSize.x*.62/aspect),patientSize,.35);
    const doctorStart=doctor.root.position.clone(),doctorEnd=new THREE.Vector3(patientPosition.x-2.2,0,patientPosition.z-1.15);
    await Promise.all([this._moveCamera(approach,1150),this._walkRoute(doctor,[new THREE.Vector3(doctorStart.x,0,.8),new THREE.Vector3(doctorEnd.x,0,.8),doctorEnd],token)]);
    if(token!==this._flowToken)return false;
    this._walkPerson(doctor,false);doctor.root.rotation.y=Math.atan2(patientPosition.x-doctorEnd.x,patientPosition.z-doctorEnd.z);
    this.phase='body-choice';this._requiredRegion=part;this._patientMeshes=[];
    patient.root.traverse(o=>{if(o.isMesh)this._patientMeshes.push(o);});
    this.heading.textContent=regionPrompt||({throat:'목이 불편하대요. 살펴볼 곳을 눌러요.',ear:'귀가 불편하대요. 살펴볼 곳을 눌러요.',nose:'코를 살펴볼 거예요. 어디일까요?',chest:'콩콩 소리를 들을 곳을 눌러요.',head:'온도를 살펴볼 곳을 눌러요.',arm:'팔에서 살펴볼 곳을 눌러요.',hand:'손가락을 살펴볼 거예요.',abdomen:'배를 살펴볼 곳을 눌러요.'}[part]);
    this.status.textContent='환자의 몸에서 직접 골라요.';this.resize();return true;
  }
  _requiredPart(id) {return ({throat:'throat',ear:'ear',nose:'nose',stethoscope:'chest',temperature:'head',vaccination:'arm',pressure:'arm',blood:'arm',oxygen:'hand',abdomen:'abdomen'})[id]||'chest';}
  _patientCameraPose(target,span,size,vertical=.16,rememberPatient=true) {
    if(rememberPatient)this._patientFocusTarget=target.clone();
    const width=this.stage.clientWidth,height=this.stage.clientHeight,aspect=width/height;
    const box=document.querySelector('.clinic-dialogue')?.getBoundingClientRect();
    const dialogueRight=box&&box.width>0?box.right:(height<520&&width>height?332:Math.min(700,width*.5));
    const available=Math.max(width*.25,width-dialogueRight-24);
    span=Math.max(span,size.x*height/(available*1.8));
    const desired=(dialogueRight+width)/2,nudge=(desired/width*2-1)*span*aspect;
    const lookAt=target.clone();lookAt.x-=nudge;
    return {position:lookAt.clone().add(new THREE.Vector3(.08,vertical,6)),lookAt,span};
  }
  async _walkRoute(person,points,token) {
    this._walkPerson(person,true);
    for(const [index,end]of points.entries()){if(token!==this._flowToken)return false;const start=person.root.position.clone(),distance=start.distanceTo(end);if(distance<.05)continue;
      this._routeState={index,count:points.length,start:start.toArray(),end:end.toArray(),distance};
      person.root.rotation.y=Math.atan2(end.x-start.x,end.z-start.z);
      await this._animate(Math.max(180,distance/2.4*1000),t=>person.root.position.copy(start).lerp(end,t));}
    this._routeState=null;
    return token===this._flowToken;
  }
  _partPositions() {
    const person=this._personObjects.patient;if(!person)return {};
    person.root.updateMatrixWorld(true);person.root.traverse(o=>{if(o.isSkinnedMesh)o.computeBoundingBox();});
    const bounds=new THREE.Box3().setFromObject(person.root),s=bounds.getSize(new THREE.Vector3()),c=bounds.getCenter(new THREE.Vector3()),h=s.y;
    const bone=(name,fallback)=>{let found;person.root.traverse(o=>{if(!found&&o.isBone&&name.test(o.name))found=o;});return found?found.getWorldPosition(new THREE.Vector3()):new THREE.Vector3(c.x+fallback[0]*s.x,bounds.min.y+fallback[1]*h,c.z);};
    const head=bone(/^head$|head$/i,[0,.8]),neck=bone(/^neck$|neck$/i,[0,.66]);
    const points={throat:neck.clone().add(new THREE.Vector3(0,h*.02,0)),head:head.clone().add(new THREE.Vector3(0,h*.09,0)),
      nose:head.clone().add(new THREE.Vector3(0,h*.08,0)),ear:head.clone().add(new THREE.Vector3(-s.x*.17,h*.19,0)),
      chest:bone(/^torso$|spine2|chest/i,[0,.55]).add(new THREE.Vector3(0,h*.035,0)),
      abdomen:bone(/^abdomen$|spine1|spine$/i,[0,.4]).add(new THREE.Vector3(0,h*.015,0)),
      arm:bone(/lowerarm[._]?l|leftforearm|forearm_l/i,[-.25,.5]),hand:bone(/middle1[._]?l|lefthand|hand_l/i,[-.3,.35])};
    // Select the rabbit's actual pink ear surface, rather than a forehead offset.
    // Cache color candidates once; skinning supplies their current world positions.
    if(!person.earColorVertices){person.earColorVertices=[];person.root.traverse(mesh=>{const color=mesh.geometry?.attributes?.color;if(!mesh.isMesh||!color)return;const ids=[];for(let i=0;i<color.count;i++){const r=color.getX(i),g=color.getY(i),b=color.getZ(i);if(r>g*1.30&&r>b*1.05)ids.push(i);}if(ids.length)person.earColorVertices.push({mesh,ids});});}
    const earCenter=new THREE.Vector3(),earVertex=new THREE.Vector3();let earCount=0;
    for(const {mesh,ids}of person.earColorVertices){mesh.skeleton?.update();for(const id of ids){mesh.getVertexPosition(id,earVertex).applyMatrix4(mesh.matrixWorld);if(earVertex.y>head.y+h*.18&&earVertex.x<head.x-h*.035){earCenter.add(earVertex);earCount++;}}}
    points.ear=earCount?earCenter.multiplyScalar(1/earCount):head.clone().add(new THREE.Vector3(-s.x*.12,h*.31,0));
    const configured=person.config.regions||{};Object.entries(configured).forEach(([id,position])=>{points[id]=person.root.localToWorld(new THREE.Vector3(...position));});
    return points;
  }
  _surfaceForPart(part) {
    const patient=this._personObjects.patient,points=this._partPositions();const target=(points[part]||points.chest).clone();
    const meshes=[];patient.root.traverse(o=>{if(o.isMesh)meshes.push(o);});
    const ray=new THREE.Raycaster(target.clone().add(new THREE.Vector3(0,0,8)),new THREE.Vector3(0,0,-1));
    const hit=ray.intersectObjects(meshes,false)[0];return hit?hit.point:target;
  }
  getWorldBodySites() {
    if(!this._personObjects.patient)return {};
    const p=this._partPositions(),height=this._personObjects.patient.height;
    const targets={heart:p.chest.clone().add(new THREE.Vector3(height*.075,0,0)),
      breathL:p.chest.clone().add(new THREE.Vector3(height*.12,height*.025,0)),
      breathR:p.chest.clone().add(new THREE.Vector3(-height*.12,height*.025,0)),bowel:p.abdomen.clone()};
    const meshes=[];this._personObjects.patient.root.traverse(o=>{if(o.isMesh)meshes.push(o);});
    Object.keys(targets).forEach(id=>{const ray=new THREE.Raycaster(targets[id].clone().add(new THREE.Vector3(0,0,8)),new THREE.Vector3(0,0,-1));
      const hit=ray.intersectObjects(meshes,false)[0];if(hit)targets[id]=hit.point.clone();});
    Object.defineProperties(targets,{leftbreath:{value:targets.breathL,enumerable:false},rightbreath:{value:targets.breathR,enumerable:false}});
    return targets;
  }
  getExamContext() {
    const patient=this._personObjects.patient?.root,patientMeshes=[];patient?.traverse(o=>{if(o.isMesh)patientMeshes.push(o);});
    const anchor=this._anatomyAnchor?.clone()||(patient?this._surfaceForPart(this._requiredRegion||'chest'):new THREE.Vector3());
    return {scene:this.scene,camera:this.camera,renderer:this.renderer,anchor,
      patient,patientMeshes,doctor:this._personObjects.doctor?.root,heldTool:this.heldTool,regions:this._partPositions(),bodySites:this.getWorldBodySites(),getBodySites:()=>this.getWorldBodySites()};
  }
  _classifyBody(point) {
    const specs=this._partPositions(),wanted=this._requiredRegion;
    const candidates=['throat','head','chest','abdomen','arm','hand'];if(wanted==='ear'||wanted==='nose')candidates.push(wanted);
    let closest='head',distance=Infinity;
    for(const id of candidates){const d=Math.hypot(point.x-specs[id].x,(point.y-specs[id].y)*1.3);if(d<distance){distance=d;closest=id;}}
    return closest;
  }
  _clearRegionContour(){this.regionTints?.dispose();this.regionTints=null;}
  _selectBody(hit) {
    if(this.phase!=='body-choice'||this._regionLocked)return;
    const part=this._classifyBody(hit.point),correct=part===this._requiredRegion;
    this._lastRegion={part,correct};this._clearRegionContour();
    const radius=this._personObjects.patient.height*.09;
    this.regionTints=new SurfaceTints(this._personObjects.patient.root);
    this.regionTints.setPatches([{position:hit.point.clone(),radius,color:correct?'#65c79b':'#ec6975',strength:.85}]);
    this.exam.onRegion({caseId:this.exam.caseId,part,correct,point:hit.point.clone()});
    this.status.textContent=correct?'맞아요! 가까이에서 살펴봐요.':'다른 곳도 천천히 찾아봐요.';
    if(!correct){this._later(()=>{this._clearRegionContour();this._draw();},850);this._draw();return;}
    this._regionLocked=true;this._anatomyAnchor=hit.point.clone().add(new THREE.Vector3(0,0,.12));
    this._later(()=>{if(this.phase!=='body-choice')return;this.phase='inside';this._clearRegionContour();
      this.exam.onReady(this.getExamContext());
    },650);this._draw();
  }
  async focusAnatomy(group,{lookAt,size=3.3}={}) {
    if(!group||!this._personObjects.patient)return false;
    this.phase='inside';this._anatomyGroup=group;
    this._focusMode='anatomy';
    this._focusSize=size;
    const native=group.userData.examinationFraming;
    const target=native?.target.clone()||(lookAt?.isVector3?lookAt.clone():Array.isArray(lookAt)?new THREE.Vector3(...lookAt):(this._anatomyAnchor||group.position).clone());
    group.updateWorldMatrix(true,true);const bounds=new THREE.Box3().setFromObject(group),dimensions=bounds.getSize(new THREE.Vector3());
    const span=native?Math.max(native.minSpan,native.size.y*(native.fitPadding??.6),dimensions.y*(native.fitPadding??.6)):Math.max(1.3,size*.57/(this.stage.clientWidth/this.stage.clientHeight),dimensions.y*.6,Math.abs(bounds.max.y-target.y)*1.12,Math.abs(target.y-bounds.min.y)*1.12);
    this._anatomyFocusTarget=target.clone();
    const pose=this._patientCameraPose(target,span,native?.size||dimensions,0,false);
    if(native?.cameraOffset)pose.position.copy(pose.lookAt).add(native.cameraOffset);
    this._fadeObject(group,0);this.heading.textContent='안쪽에서 도구를 움직여 살펴봐요.';this.status.textContent='';this.status.hidden=true;
    const token=this._flowToken;
    // Standalone anatomy procedures transition into their own examination view.
    // Direct patient procedures use focusPatientExam and retain the characters.
    this._personObjects.patient.root.visible=true;this._personObjects.doctor.root.visible=true;
    await Promise.all([this._moveCamera(pose,850),this._animate(650,t=>{this._fadeObject(this._personObjects.patient.root,1-t);this._fadeObject(this._personObjects.doctor.root,1-t);this._fadeObject(group,t);})]);
    if(token!==this._flowToken)return false;
    this._personObjects.patient.root.visible=false;this._personObjects.doctor.root.visible=false;
    this.phase='game';this.resize();this._draw();return true;
  }
  async focusPatientExam({lookAt,includeAbdomen=true}={}) {
    const patient=this._personObjects.patient;if(!patient)return false;
    this._focusMode='patient';this.phase='approach';this._fadeObject(this.people,1);
    Object.values(this._personObjects).forEach(p=>{p.root.visible=true;});this._partPositions();
    const box=new THREE.Box3().setFromObject(patient.root),size=box.getSize(new THREE.Vector3());
    const target=lookAt?.isVector3?lookAt.clone():Array.isArray(lookAt)?new THREE.Vector3(...lookAt):box.getCenter(new THREE.Vector3());
    const span=Math.max(1.5,size.y*(includeAbdomen?.63:.52),size.x*.62/(this.stage.clientWidth/this.stage.clientHeight),(box.max.y-target.y)*1.14,(target.y-box.min.y)*1.14);
    const token=this._flowToken;this._clearRegionContour();this.labels.hidden=true;this.panControls.hidden=true;
    this.heading.textContent='청진기의 동그란 부분을 몸에 가져가요.';this.status.hidden=false;this.status.textContent='가슴과 배의 소리를 들어봐요.';
    await this._moveCamera(this._patientCameraPose(target,span,size),850);
    if(token!==this._flowToken)return false;this.phase='game';this.resize();this._draw();return true;
  }
  setProcedure(procedure) {this.procedure=procedure||null;if(procedure)this._startLoop(true);}
  setPaused(value) {
    value=!!value;if(value===this.paused)return;
    if(value)this._pauseAt=performance.now();
    else{const shift=performance.now()-this._pauseAt;this._tweens.forEach(t=>{t.start+=shift;});}
    this.paused=value;this.procedure?.setPaused?.(value);
  }

  select(toolId) {
    if (!this.visible || this.phase!=='choice' || this.locked || !this.challenge.choices.some(c => c.id === toolId)) return;
    this._cancelTimers(); this.lastSelection = toolId;
    const correct = toolId === this.challenge.correctToolId, item = this.models.find(m => m.id === toolId);
    this.lastResult = correct ? 'correct' : 'wrong'; this.status.textContent = correct ? '맞아요! 이 도구로 알아봐요.' : '다른 도구도 살펴봐요.';
    this.buttons.forEach(button => { button.classList.remove('is-correct', 'is-wrong'); });
    const selectedButton = this.buttons[this.challenge.choices.findIndex(c => c.id === toolId)];
    selectedButton.classList.add(correct ? 'is-correct' : 'is-wrong');
    if (this.outline && item) {
      this.outline.selectedObjects = [item.model]; this.outline.visibleEdgeColor.set(correct ? '#278c55' : '#d7444c');
      this.outline.hiddenEdgeColor.set(correct ? '#278c55' : '#d7444c'); this._draw();
    }
    const caseId = this.challenge.caseId, epoch = this._epoch;
    if (correct) {
      this.locked = true; this.buttons.forEach(button => { button.disabled = true; });
      this._later(() => { if (this.visible && epoch === this._epoch) this.onCorrect({ toolId, caseId }); }, 650);
    } else {
      this.onWrong({ toolId, caseId });
      this._later(() => {
        if (epoch !== this._epoch) return;
        if (this.outline) this.outline.selectedObjects = [];
        selectedButton.classList.remove('is-wrong'); this._draw();
      }, 900);
    }
  }
  _later(fn, delay) { const timer = setTimeout(() => { this.timers.delete(timer); fn(); }, delay); this.timers.add(timer); }
  _cancelTimers() { this.timers.forEach(clearTimeout); this.timers.clear(); }
  _key(event) {
    if (!this.visible) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); return; }
    const controls = [...(this.buttons || []),...(this.panControls.hidden?[]:this.panButtons)].filter(button => !button.disabled);
    if (event.key === 'Tab' && controls.length) {
      const index = controls.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); controls[0].focus(); }
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && !this.locked) {
      event.preventDefault(); const index = Math.max(0, this.buttons.indexOf(document.activeElement));
      const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      this.buttons[(index + direction + this.buttons.length) % this.buttons.length]?.focus();
    }
  }
  _draw() { if (this.ready && this.visible) this.composer.render(); }
  _updateFlow(dt,now) {
    this._lastTickAt=now;
    if(this.paused)return;
    if(this.phase==='game')this.procedure?.update?.(dt);
    Object.values(this._personObjects).forEach(person=>{
      person.mixer?.update(dt);
      if(person.walking&&!person.walk)person.walkBones?.forEach(({bone,rotation,side})=>{
        bone.rotation.copy(rotation);const lower=/lower|calf|shin/i.test(bone.name);
        bone.rotation.x+=lower?Math.max(0,Math.sin(now*.008*side))*.4:Math.sin(now*.008)*side*.32;
      });
    });
    this._advanceTweens(performance.now());
    if(this.phase==='choice')this._positionLabels();
  }
  _advanceTweens(now) {
    if(this.paused)return;
    this._lastAdvanceAt=now;
    for(const tween of [...this._tweens]){
      const linear=THREE.MathUtils.clamp((now-tween.start)/tween.duration,0,1),eased=linear*linear*(3-2*linear);
      tween.step(eased);
      if(linear===1){const i=this._tweens.indexOf(tween);if(i>=0)this._tweens.splice(i,1);tween.resolve(true);}
    }
    if(!this._tweens.length){clearInterval(this._flowClock);this._flowClock=null;}
  }
  _startLoop(force=false) {
    if (this.frame) cancelAnimationFrame(this.frame);
    if (this.reducedMotion&&!force&&!this._tweens.length&&this.phase==='choice') { this.frame = null; return; }
    let previous=performance.now();
    const tick = now => {
      if (!this.visible || this._disposed) { this.frame = null; return; }
      this._updateFlow(Math.min(.05,(now-previous)/1000),now);previous=now;
      this._draw(); this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  hide() {
    this.visible = false; this.container.hidden = true; this._epoch++; this._cancelTimers(); this.down = null;
    this._cancelFlow();
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = null; }
    if (this.outline) this.outline.selectedObjects = [];
    if (this.previousFocus?.isConnected && !this.container.contains(this.previousFocus)) this.previousFocus.focus({ preventScroll: true });
  }
  _clearModels() {
    if (this.outline) this.outline.selectedObjects = [];
    this.models.forEach(item => {item.model.removeFromParent();disposeMeshes(item.model);this.scene.remove(item.display);disposeMeshes(item.display);});
    this.models = []; this.toolMeshes = [];
    this.heldTool=null;
    if (this.table) { this.scene.remove(this.table); disposeMeshes(this.table); this.table = null; this.tableKey = null; }
  }
  get snapshot() {
    return { caseId: this.challenge?.caseId || null, correctToolId: this.challenge?.correctToolId || null,
      lastSelection: this.lastSelection, lastResult: this.lastResult, ready: this.ready,
      pickPoints: this.pickPoints,phase:this.phase,partPickPoints:this.partPickPoints,
      peopleReady:{patient:!!this._personObjects.patient,doctor:!!this._personObjects.doctor},
      flow:{now:performance.now(),lastTickAt:this._lastTickAt??null,lastAdvanceAt:this._lastAdvanceAt??null,frameActive:!!this.frame,pauseAt:this._pauseAt??null,
        tweens:this._tweens.map(t=>({start:t.start,duration:t.duration,elapsed:performance.now()-t.start,finite:Number.isFinite(t.start)&&Number.isFinite(t.duration)})),
        doctorPosition:this._personObjects.doctor?.root.position.toArray()||null,route:this._routeState||null},
      furniture:{ready:!!this.table?.userData.furnitureAssets,assets:this.table?.userData.furnitureAssets||[],error:this._furnitureError||null},
      toolAssets:this.models.map(item=>({id:item.id,source:item.model.userData.source||'local-procedural',support:item.model.userData.roomSlot?.support,position:item.display.position.toArray()})),
      seating:this._personObjects.patient?.root.userData.seating||null,
      selectedRegion:this._lastRegion||null,bodyVisible:!!this._personObjects.patient?.root.visible,
      paused:!!this.paused };
  }
  get partPickPoints() {
    if(!this.visible||!this._personObjects.patient||!this.camera)return [];
    const rect=this.renderer.domElement.getBoundingClientRect();
    return Object.keys(this._partPositions()).map(id=>{const world=this._surfaceForPart(id),p=world.clone().project(this.camera);
      return{id,x:rect.x+(p.x*.5+.5)*rect.width,y:rect.y+(-p.y*.5+.5)*rect.height,world:world.toArray()};});
  }
  get pickPoints() {
    if (!this.ready || !this.visible) return [];
    this.scene.updateMatrixWorld(true); this.camera.updateMatrixWorld();
    const r=this.renderer.domElement.getBoundingClientRect();
    const ray=new THREE.Raycaster();
    return this.models.map(item=>{
      const meshes=[];item.model.traverseVisible(o=>{if(o.isMesh)meshes.push(o)});
      const candidates=[];
      meshes.forEach(mesh=>{mesh.geometry.computeBoundingBox();candidates.push(mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
        const pos=mesh.geometry.attributes.position;for(let n=0;n<pos.count;n+=Math.max(1,Math.floor(pos.count/35)))candidates.push(new THREE.Vector3().fromBufferAttribute(pos,n).applyMatrix4(mesh.matrixWorld));});
      for(const world of candidates){const p=world.clone().project(this.camera);if(Math.abs(p.x)>.985||Math.abs(p.y)>.985||p.z<-1||p.z>1)continue;
        ray.setFromCamera(new THREE.Vector2(p.x,p.y),this.camera);const hit=this._visibleToolHit(ray);
        if(hit?.object.userData.toolId===item.id)return {id:item.id,x:r.x+(p.x*.5+.5)*r.width,y:r.y+(-p.y*.5+.5)*r.height,visible:true};}
      return {id:item.id,x:null,y:null,visible:false};
    });
  }
  _visibleToolHit(ray) {
    const meshes=[];this.scene.traverseVisible(o=>{if(o.isMesh)meshes.push(o);});
    const hit=ray.intersectObjects(meshes,false).find(h=>(Array.isArray(h.object.material)?h.object.material:[h.object.material]).some(m=>m.opacity>.1));
    return hit?.object.userData.toolId?hit:null;
  }
  destroy() {
    this.hide(); this._disposed = true; this._clearModels(); this._resizeObserver.disconnect();
    this._clearRegionContour();
    ['patient','doctor'].forEach(role=>{this._personTokens[role]++;this._clearPerson(role);});
    this.container.removeEventListener('keydown', this._onKey);
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('pointerdown', this._pointerDown);
      this.renderer.domElement.removeEventListener('pointerup', this._pointerUp);
      this.renderer.domElement.removeEventListener('pointermove',this._pointerMove);
      this.renderer.domElement.removeEventListener('pointercancel', this._pointerCancel);
      this.outline?.dispose(); this.output?.dispose(); this.composer?.dispose(); this.environment?.dispose(); this.renderer.dispose();
    }
    this.container.replaceChildren(); this.ready = false;
  }
}
