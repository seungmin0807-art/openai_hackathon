import * as THREE from '/vendor/three.js';
import { createMedicalTool } from './tool-selector.js';
import { SurfaceTints } from './mesh-tints.js';
import { showExamToolInFront } from './exam-tool-display.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function dispose(root) {
  const geometries = new Set(), materials = new Set();
  root.traverse(o => { if (o.geometry) geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) materials.add(m); });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}
function roundedPatch(width, height, depth, radius, color) {
  const x = -width / 2, y = -height / 2, s = new THREE.Shape();
  s.moveTo(x + radius, y); s.lineTo(x + width - radius, y); s.quadraticCurveTo(x + width, y, x + width, y + radius);
  s.lineTo(x + width, y + height - radius); s.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  s.lineTo(x + radius, y + height); s.quadraticCurveTo(x, y + height, x, y + height - radius);
  s.lineTo(x, y + radius); s.quadraticCurveTo(x, y, x + radius, y);
  const geometry = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: .003, bevelThickness: .002, bevelSegments: 3, curveSegments: 14 });
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setZ(i, positions.getZ(i) - positions.getX(i) ** 2 * 1.8);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .92 }));
}
function bandage(height) {
  const group = new THREE.Group(), width = height * .066, length = height * .125;
  group.add(roundedPatch(width, length, .004, width * .39, '#e6cca8'));
  const pad = roundedPatch(width * .71, length * .34, .005, width * .13, '#fff6df'); pad.position.z = .005; group.add(pad);
  for (const sign of [-1, 1]) for (const row of [0, 1]) for (const side of [-1, 1]) {
    const pore = new THREE.Mesh(new THREE.CylinderGeometry(height * .0023, height * .0023, .001, 10), new THREE.MeshStandardMaterial({ color: '#c0b092', roughness: 1 }));
    pore.rotation.x = Math.PI / 2; pore.position.set(side * width * .20, sign * (length * .29 + row * length * .12), .006); group.add(pore);
  }
  group.userData.contact = V(); group.userData.grip = V(0, -length * .23, 0);
  return group;
}

/** Three preparation steps on the existing patient, not an injection tutorial.
 * Vaccine purpose: https://www.cdc.gov/vaccines-children/reasons/
 * Predictable, honest preparation (no promise of painless shots):
 * https://www.healthychildren.org/English/safety-prevention/immunizations/Pages/Managing-Your-Childs-Pain-While-Getting-a-Shot.aspx
 */
export class VaccinationGame {
  constructor({ scene, camera, renderer, patient, patientMeshes, doctor, heldTool, regions,
    reducedMotion = false, onHint = () => {}, onEvent = () => {} }) {
    Object.assign(this, { scene, camera, renderer, patient, doctor, heldTool, reducedMotion, onHint, onEvent });
    if (heldTool) heldTool.visible = false;
    this.group = new THREE.Group(); this.group.name = 'patient-vaccination-preview'; scene.add(this.group);
    this.meshes = patientMeshes?.length ? patientMeshes : [];
    if (!this.meshes.length) patient.traverse(o => { if (o.isMesh) this.meshes.push(o); });
    patient.visible = true; patient.updateMatrixWorld(true);
    patient.traverse(o => { if (o.isSkinnedMesh) o.computeBoundingBox(); });
    const bounds = new THREE.Box3().setFromObject(patient), size = bounds.getSize(V()), center = bounds.getCenter(V()); this.height = size.y;
    const bones = {}; patient.traverse(o => { if (!o.isBone) return; if (/upperarm[._]?l|leftarm|leftupperarm/i.test(o.name)) bones.upper = o; if (/lowerarm[._]?l|leftforearm|forearm_l/i.test(o.name)) bones.lower = o; });
    const raw = bones.upper ? bones.upper.getWorldPosition(V()) : regions?.arm?.clone() || V(center.x + size.x * .30, bounds.min.y + size.y * .54, center.z);
    if (bones.lower && bones.upper) raw.lerp(bones.lower.getWorldPosition(V()), .55);
    raw.x += Math.sign(raw.x - center.x || 1) * size.y * .015;
    this.target = this.surfaceAt(raw)?.point.clone() || raw;
    this.radius = Math.max(.075, size.y * .060);
    this.normal = V(0, 0, 1);
    this.home = this.target.clone().add(V(size.y * .20, -size.y * .075, .18));
    this.plane = new THREE.Plane(V(0, 0, 1), -this.home.z);
    this.ray = new THREE.Raycaster(); this.tints = new SurfaceTints(patient);
    this.stage = 'clean'; this.active = false; this.paused = false; this.complete = false; this.pointer = null;
    this.checked = new Set(); this.contact = this.home.clone(); this.onBody = false; this.wipeLegs = 0; this.wipeSide = 0;
    this.dwell = 0; this.holdStarted = 0; this.injectionElapsed = 0; this.elapsed = 0;
    this.abort = new AbortController(); this.setTool('cotton'); this.refreshTint();
    const canvas = renderer.domElement, opts = { signal: this.abort.signal };
    canvas.addEventListener('pointerdown', e => this.down(e), opts); canvas.addEventListener('pointermove', e => this.move(e), opts);
    canvas.addEventListener('pointerup', e => this.up(e), opts); canvas.addEventListener('pointercancel', () => this.cancel(), opts);
    canvas.addEventListener('lostpointercapture', () => { if (this.pointer !== null) this.cancel(); }, opts);
  }

  surfaceAt(p) {
    const ray = new THREE.Raycaster(V(p.x, p.y, p.z + 8), V(0, 0, -1));
    return ray.intersectObjects(this.meshes, false)[0] || null;
  }
  setTool(kind) {
    if (this.tool) { this.tool.removeFromParent(); dispose(this.tool); }
    this.toolKind = kind; this.tool = new THREE.Group(); this.tool.name = `draggable-${kind}`;
    this.model = kind === 'bandage' ? bandage(this.height) : createMedicalTool(kind);
    if (kind === 'cotton') {
      // The pouch stays in the room; only the actual cotton pad touches the arm.
      for (const object of this.model.children.slice(0, 2)) { object.removeFromParent(); object.geometry?.dispose(); }
    }
    if (kind !== 'bandage') {
      this.model.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(this.model).getSize(V());
      this.tool.scale.setScalar(this.height * (kind === 'cotton' ? .105 : .24) / Math.max(size.x, size.y, size.z));
    }
    this.tool.add(this.model); this.group.add(this.tool);
    showExamToolInFront(this.tool);
    if (kind === 'syringe') {
      // Blender's named assembly keeps the shaft, stopper and thumb pad together.
      // The barrel/nozzle stay fixed; movement comes from the asset's metadata.
      this.piston = this.model.getObjectByName(this.model.userData.plungerNodeName || 'Syringe plunger assembly') || null;
      this.pistonBaseY = this.piston?.position.y || 0;
      this.pistonTravel = this.model.userData.plungerTravel || 0;
      this.tool.rotation.z = -Math.PI / 3;
    } else this.piston = null;
    this.tool.updateMatrixWorld(true); this.model.updateMatrixWorld(true);
    this.contactOffset = this.tool.worldToLocal(this.model.localToWorld(this.model.userData.contact.clone())).multiply(this.tool.scale);
    this.gripOffset = this.tool.worldToLocal(this.model.localToWorld(this.model.userData.grip.clone())).multiply(this.tool.scale);
    this.tool.position.copy(this.home.clone().sub(this.contactOffset.clone().applyQuaternion(this.tool.quaternion)));
    this.homePosition = this.tool.position.clone(); this.toolMeshes = []; this.tool.traverse(o => { if (o.isMesh) this.toolMeshes.push(o); });
    this.contact.copy(this.home); this.onBody = false;
  }
  begin() {
    if (this.active) return; this.active = true; if (this.heldTool) this.heldTool.visible = false;
    this.onHint('솜을 팔에서 왔다 갔다! 깨끗이 닦아 보자.'); this.emit('stage', { stage: 'clean' });
  }
  emit(type, extra = {}) { this.onEvent({ type, input: '3d_touch', assessment: 'not_assessed', ...extra }); }
  rayFrom(e) {
    const r = this.renderer.domElement.getBoundingClientRect(); this.ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), this.camera);
  }
  point(e) { this.rayFrom(e); return this.ray.ray.intersectPlane(this.plane, V()); }
  down(e) {
    if (!this.active || this.paused || this.complete || this.stage === 'injecting' || this.pointer !== null || e.button > 0) return;
    this.rayFrom(e); if (!this.ray.intersectObjects(this.toolMeshes, false).length) return;
    const p = this.point(e); if (!p) return; this.pointer = e.pointerId; this.offset = p.clone().sub(this.tool.position);
    this.renderer.domElement.setPointerCapture(e.pointerId); e.preventDefault();
  }
  move(e) {
    if (e.pointerId !== this.pointer || this.paused || this.stage === 'injecting') return;
    const p = this.point(e); if (!p) return; this.tool.position.copy(p.sub(this.offset));
    this.contact.copy(this.tool.position).add(this.contactOffset.clone().applyQuaternion(this.tool.quaternion));
    const hit = this.surfaceAt(this.contact); this.onBody = !!hit;
    if (hit) { this.contact.copy(hit.point); this.tool.position.z = this.contact.z + .025 - this.contactOffset.clone().applyQuaternion(this.tool.quaternion).z; }
    const atTarget = this.atTarget();
    if (this.stage === 'clean' && atTarget) {
      const x = this.contact.x - this.target.x, side = x > this.radius * .28 ? 1 : x < -this.radius * .28 ? -1 : 0;
      if (side && side !== this.wipeSide) { if (this.wipeSide) this.wipeLegs++; this.wipeSide = side; }
      if (this.wipeLegs >= 4) this.finishCleaning();
    }
    if (!atTarget) { this.holdStarted = 0; this.dwell = 0; if (this.stage === 'clean') this.wipeSide = 0; }
    e.preventDefault();
  }
  atTarget() { return this.pointer !== null && this.onBody && Math.hypot(this.contact.x - this.target.x, this.contact.y - this.target.y) < this.radius && Math.abs(this.contact.z - this.target.z) < .16; }
  up(e) {
    if (e.pointerId !== this.pointer) return;
    if (this.stage === 'bandage' && this.atTarget()) { this.placeBandage(); return; }
    this.cancel();
  }
  releasePointer() {
    const id = this.pointer; this.pointer = null;
    if (id !== null && this.renderer.domElement.hasPointerCapture?.(id)) { try { this.renderer.domElement.releasePointerCapture(id); } catch {} }
  }
  cancel() {
    this.releasePointer(); this.dwell = 0; this.holdStarted = 0; this.wipeSide = 0; this.onBody = false;
    if (!this.complete && this.stage !== 'injecting') { this.tool.position.copy(this.homePosition); this.contact.copy(this.home); }
  }
  finishCleaning() {
    this.checked.add('clean'); this.emit('check', { targetId: 'clean', purpose: 'clean_skin' }); this.releasePointer();
    this.stage = 'align'; this.setTool('syringe'); this.onHint('팔에 맞춰 주면 선생님이 도와줄게!'); this.emit('stage', { stage: 'align' });
  }
  startInjection() {
    this.releasePointer(); this.stage = 'injecting'; this.injectionElapsed = 0;
    this.dockedPosition = this.target.clone().add(V(0, 0, .035)).sub(this.contactOffset.clone().applyQuaternion(this.tool.quaternion));
    this.tool.position.copy(this.dockedPosition); this.contact.copy(this.target);
    this.onHint('선생님 차례! 백신은 병균을 막는 법을 몸에 알려 줘.'); this.emit('stage', { stage: 'injecting', performedBy: 'clinician_preview' });
  }
  placeBandage() {
    this.releasePointer(); this.tool.rotation.set(0, 0, -.17);
    this.tool.position.copy(this.target).add(V(0, 0, .012)); this.contact.copy(this.target); this.onBody = true;
    this.complete = true; this.stage = 'done'; this.checked.add('bandage');
    this.onHint('밴드가 작은 주사 자리를 덮어 줬어!'); this.emit('check', { targetId: 'bandage', purpose: 'cover_site' });
    this.emit('complete', { checked: [...this.checked], performedBy: 'clinician_preview' }); this.refreshTint();
  }
  update(dt) {
    if (!this.active || this.paused) return; this.elapsed += Math.min(.15, Math.max(0, dt));
    if (this.stage === 'align') {
      if (this.atTarget()) { this.holdStarted ||= performance.now(); this.dwell = (performance.now() - this.holdStarted) / 1000; if (this.dwell >= .65) this.startInjection(); }
      else { this.holdStarted = 0; this.dwell = 0; }
    } else if (this.stage === 'injecting') {
      this.injectionElapsed += Math.min(.15, Math.max(0, dt)); const progress = Math.min(1, this.injectionElapsed / (this.reducedMotion ? 1 : 1.55));
      const press = THREE.MathUtils.smoothstep(progress, .15, .74), withdraw = THREE.MathUtils.smoothstep(progress, .77, 1);
      this.tool.position.copy(this.dockedPosition).add(V(0, 0, -.018 * Math.sin(progress * Math.PI) + withdraw * .07));
      if (this.piston) this.piston.position.y = this.pistonBaseY + this.pistonTravel * press;
      if (progress >= 1) {
        this.checked.add('vaccination'); this.emit('check', { targetId: 'vaccination', purpose: 'immune_preparation', performedBy: 'clinician_preview' });
        this.stage = 'bandage'; this.setTool('bandage');
        this.onHint('밴드를 팔에 붙이고 손을 놓아 봐!'); this.emit('stage', { stage: 'bandage' });
      }
    }
    this.refreshTint();
  }
  refreshTint() {
    this.tints.setPatches([{ position: this.target, radius: this.radius,
      color: this.complete ? '#b3d7bd' : this.stage === 'clean' ? '#fff2d5' : '#bfe1ca',
      strength: this.complete ? .43 : .58 + (this.stage === 'clean' ? this.wipeLegs * .065 : 0) }]);
  }
  setPaused(value) { this.paused = !!value; if (value) this.cancel(); }
  screen(p) { const v = p.clone().project(this.camera), r = this.renderer.domElement.getBoundingClientRect(); return { x: r.left + (v.x + 1) * r.width / 2, y: r.top + (1 - v.y) * r.height / 2 }; }
  get snapshot() {
    const gripToContact = this.gripOffset.clone().sub(this.contactOffset).applyQuaternion(this.tool.quaternion);
    return { mode: '3d-vaccination', active: this.active, paused: this.paused, stage: this.stage, held: this.pointer !== null, complete: this.complete,
      checked: [...this.checked], required: ['clean', 'vaccination', 'bandage'], toolKind: this.toolKind, dwell: this.dwell, wipeLegs: this.wipeLegs,
      wipeRoundTrips: Math.floor(this.wipeLegs / 2), injectionProgress: Math.min(1, this.injectionElapsed / (this.reducedMotion ? 1 : 1.55)),
      pickPoint: this.screen(this.tool.position.clone().add(this.gripOffset.clone().applyQuaternion(this.tool.quaternion))),
      targets: [{ id: 'arm', name: '팔', point: this.target.toArray(), pickPoint: this.screen(this.target), radius: this.radius }],
      dropPoint: this.screen(this.target.clone().add(gripToContact)),
      wipePoints: [-.48, .48].map(x => this.screen(this.target.clone().add(V(this.radius * x, 0, 0)).add(gripToContact))),
      contact: this.contact.toArray(), patientVisible: this.patient.visible, source: 'symbolic-on-patient-examination', assessment: 'not_assessed' };
  }
  destroy() { this.active = false; this.cancel(); this.abort.abort(); this.tints.dispose(); if (this.heldTool) this.heldTool.visible = true; dispose(this.group); this.group.removeFromParent(); }
}

export default VaccinationGame;
