// Applied only to active examination tools, never to room/shelf objects.
// Keep interactive instruments readable over the patient while their contact
// coordinates continue to use the actual patient surface raycast.
export function showExamToolInFront(root) {
  root.traverse(object => {
    if (!object.isMesh) return;
    object.renderOrder = 120;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      material.depthTest = false;
      material.depthWrite = false;
      material.needsUpdate = true;
    }
  });
  return root;
}
