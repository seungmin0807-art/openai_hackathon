// Game world units. Surface heights preserve the current tool and sitting poses.
const base='/assets/clinic/blender-candidates/';
export const CLINIC_FURNITURE_ASSETS=Object.freeze({
  preparation:base+'clinic-station.glb',
  trolley:base+'trolley/trolley.glb',
  bed:base+'exam-furniture/exam-bed.glb',
  stool:base+'exam-furniture/stool.glb',
  visitor:base+'exam-furniture/visitor-chair.glb',
  privacy:base+'exam-furniture/privacy-screen.glb',
  patientChair:base+'room-furniture/patient-chair.glb',
  storage:base+'room-furniture/storage-cabinet.glb',
  monitor:base+'room-furniture/monitor.glb',
  diagnosticHolder:base+'room-furniture/diagnostic-holder.glb',
  instrumentWorkbench:base+'room-furniture/instrument-workbench.glb',
  sinkCounter:base+'room-furniture/sink-workcounter.glb',
  window:base+'room-architecture/window-curtains.glb',
  chart:base+'room-architecture/eye-chart.glb',
  plant:base+'room-architecture/plant.glb',
});
export const CLINIC_FURNITURE_LAYOUT=Object.freeze([
  {id:'preparation',position:[2.7,0,-4.3],scale:1.3,omit:['Tray','Stethoscope','Waste bin']},
  {id:'bed',position:[-5,0,-1.8]},
  {id:'stool',position:[-3.4,0,.35]},
  {id:'visitor',position:[-1.6,0,-3.3]},
  {id:'privacy',position:[-6.34,0,-2.3],rotationY:Math.PI/2},
  {id:'patientChair',position:[1.3,0,-1.42]},
  {id:'storage',position:[-.3,0,-4.53]},
  {id:'monitor',position:[3.24,1.2584,-4.23]},
  {id:'instrumentWorkbench',position:[-5,0,2.02]},
  {id:'sinkCounter',position:[4.45,0,-2.4]},
  {id:'diagnosticHolder',instance:'otoscopeHolder',position:[4.75,1.354,-3.25]},
  {id:'diagnosticHolder',instance:'lightHolder',position:[5.9,1.354,-3.25]},
  {id:'trolley',position:[3.7,0,3.3],scale:1.14},
  {id:'window',position:[-3.65,1.25,-4.75]},
  {id:'chart',position:[-.3,2.83,-4.86]},
  {id:'plant',position:[6.3,0,3.75]},
]);
export const CLINIC_SUPPORT_HEIGHTS=Object.freeze({patientSeat:.82,bedsideTray:.975,sinkCounter:1.415,wallHolder:1.433});
