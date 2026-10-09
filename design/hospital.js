/* A quiet, miniature children's hospital. Supplied THREE must include core r160. */
(function () {
  'use strict';

  window.buildMoriHospital = function (THREE) {
    const hospital = new THREE.Group();
    hospital.name = 'Mori Korean Children Hospital';
    const palette = {
      ivory: '#fffaf0', sage: '#cfe3d6', mint: '#a6cdbb', peach: '#ecc3ad',
      wood: '#cda674', white: '#ffffff', green: '#709d79', ink: '#466055',
      blanket: '#c6dce5', gold: '#e3bf70', pale: '#f3ece0'
    };
    const materials = {};
    Object.keys(palette).forEach(function (key) {
      materials[key] = new THREE.MeshStandardMaterial({ color: palette[key], roughness: .78 });
    });

    function moriShape(width, height, radius) {
      const shape = new THREE.Shape();
      const x = -width / 2, y = -height / 2, r = Math.min(radius, width / 2, height / 2);
      shape.moveTo(x + r, y);
      shape.lineTo(x + width - r, y);
      shape.quadraticCurveTo(x + width, y, x + width, y + r);
      shape.lineTo(x + width, y + height - r);
      shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      shape.lineTo(x + r, y + height);
      shape.quadraticCurveTo(x, y + height, x, y + height - r);
      shape.lineTo(x, y + r);
      shape.quadraticCurveTo(x, y, x + r, y);
      return shape;
    }
    function moriMesh(geometry, material, x, y, z, parent) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      (parent || hospital).add(mesh);
      return mesh;
    }
    function moriBox(width, height, depth, radius, material, x, y, z, parent) {
      const bevel = Math.min(.045, radius / 3, depth / 5);
      const geo = new THREE.ExtrudeGeometry(moriShape(width, height, radius), {
        depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel,
        bevelSize: bevel, bevelSegments: 3, curveSegments: 10, steps: 1
      });
      geo.translate(0, 0, -depth / 2 + bevel);
      return moriMesh(geo, material, x, y, z, parent);
    }
    function moriFlatBox(width, depth, height, radius, material, x, y, z, parent) {
      const mesh = moriBox(width, depth, height, radius, material, x, y, z, parent);
      mesh.rotation.x = -Math.PI / 2;
      return mesh;
    }
    function moriSphere(radius, material, x, y, z, sx, sy, sz, parent) {
      const mesh = moriMesh(new THREE.SphereGeometry(radius, 24, 18), material, x, y, z, parent);
      mesh.scale.set(sx || 1, sy || 1, sz || 1);
      return mesh;
    }
    function moriCylinder(top, bottom, height, material, x, y, z, parent) {
      return moriMesh(new THREE.CylinderGeometry(top, bottom, height, 32), material, x, y, z, parent);
    }
    function moriLabel(text, width, height, x, y, z, fontSize, color, parent) {
      const canvas = document.createElement('canvas');
      canvas.width = 1536; canvas.height = 384;
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.font = '600 ' + (fontSize || 100) + 'px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillStyle = color || palette.ink;
      context.fillText(text, 768, 192);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
      const label = moriMesh(new THREE.PlaneGeometry(width, height), material, x, y, z, parent);
      label.castShadow = false; label.receiveShadow = false;
      return label;
    }

    // Floating, soft-edged dollhouse plinth and a calm L-shaped architectural shell.
    moriFlatBox(12.5, 8.4, .36, .58, materials.ivory, 0, -.18, 0);
    moriFlatBox(12.18, 8.08, .035, .5, materials.pale, 0, .025, 0);
    moriBox(12.15, 2.75, .22, .22, materials.sage, 0, 1.4, -3.83);
    moriBox(.22, 2.75, 7.8, .1, materials.sage, -6.0, 1.4, -.03);
    // Low cream skirting subtly outlines the two open sides.
    moriBox(11.65, .13, .07, .03, materials.ivory, 0, .14, -3.66);
    moriBox(.07, .13, 7.3, .025, materials.ivory, -5.84, .14, -.05);

    // Korean brand plaque with a friendly sprout mark, set into the back wall.
    moriBox(5.0, .94, .1, .22, materials.ivory, -2.75, 2.02, -3.64);
    moriLabel('모리 어린이병원', 4.65, .82, -2.75, 2.02, -3.58, 108);
    const sprout = new THREE.Group(); hospital.add(sprout);
    moriCylinder(.035, .035, .31, materials.green, -.07, 2.2, -3.49, sprout);
    moriSphere(.15, materials.green, -.16, 2.39, -3.49, 1, .52, .32, sprout).rotation.z = -.45;
    moriSphere(.15, materials.green, .025, 2.41, -3.49, 1, .52, .32, sprout).rotation.z = .45;

    // Reception: a generous rounded wood desk, mint panel, and one small monitor.
    moriBox(3.12, 1.05, 1.02, .2, materials.wood, -2.8, .59, -1.79);
    moriBox(2.75, .71, .06, .14, materials.mint, -2.8, .59, -1.245);
    moriFlatBox(3.31, 1.17, .13, .2, materials.ivory, -2.8, 1.17, -1.79);
    moriLabel('접수', 1.12, .47, -2.8, .62, -1.205, 160);
    moriBox(.62, .4, .1, .07, materials.ink, -3.48, 1.43, -1.83);
    moriBox(.5, .3, .012, .035, materials.blanket, -3.48, 1.43, -1.765);
    moriBox(.065, .16, .065, .025, materials.ink, -3.48, 1.22, -1.84);
    moriFlatBox(.38, .21, .035, .05, materials.ink, -3.48, 1.245, -1.84);
    moriCylinder(.11, .09, .19, materials.ivory, -1.77, 1.31, -1.77);
    moriSphere(.12, materials.green, -1.77, 1.49, -1.77, 1, .8, 1);

    // The waiting nook reads as a sofa and a small pebble-shaped table.
    const waiting = new THREE.Group(); hospital.add(waiting);
    moriFlatBox(3.15, 2.07, .035, .8, materials.ivory, -3.31, .061, 1.36, waiting);
    moriBox(2.45, .39, .9, .17, materials.peach, -3.45, .39, 1.03, waiting);
    moriBox(2.45, .72, .2, .15, materials.peach, -3.45, .83, .63, waiting);
    moriBox(.26, .55, .94, .12, materials.peach, -4.58, .63, 1.02, waiting);
    moriBox(.26, .55, .94, .12, materials.peach, -2.32, .63, 1.02, waiting);
    moriFlatBox(1.0, .69, .12, .23, materials.ivory, -4.0, .62, 1.04, waiting);
    moriFlatBox(.9, .69, .12, .22, materials.ivory, -2.94, .62, 1.04, waiting);
    [-4.36, -2.55].forEach(function (x) {
      moriCylinder(.055, .07, .2, materials.wood, x, .13, 1.12, waiting);
    });
    moriCylinder(.08, .16, .46, materials.wood, -3.12, .28, 2.22, waiting);
    moriFlatBox(1.12, .8, .14, .36, materials.wood, -3.12, .57, 2.22, waiting);
    moriFlatBox(.35, .25, .028, .035, materials.blanket, -3.16, .665, 2.23, waiting);

    // A single open arch indicates the examination room without enclosing the view.
    moriBox(.18, 1.16, 3.07, .07, materials.sage, .55, .62, -2.19);
    moriBox(2.06, .9, .18, .09, materials.sage, 4.99, .49, -.58);
    moriBox(.44, 1.82, .22, .11, materials.mint, 1.02, .95, -.58);
    moriBox(.44, 1.82, .22, .11, materials.mint, 3.51, .95, -.58);
    const archShape = new THREE.Shape();
    const innerRadius = 1.03, outerRadius = 1.47;
    archShape.absarc(0, 0, outerRadius, 0, Math.PI, false);
    archShape.lineTo(-innerRadius, 0);
    archShape.absarc(0, 0, innerRadius, Math.PI, 0, true);
    archShape.closePath();
    const archGeometry = new THREE.ExtrudeGeometry(archShape, {
      depth: .22, bevelEnabled: true, bevelSize: .04, bevelThickness: .04,
      bevelSegments: 3, curveSegments: 24, steps: 1
    });
    archGeometry.translate(0, 0, -.11);
    moriMesh(archGeometry, materials.mint, 2.265, 1.86, -.58);
    moriBox(1.74, .45, .08, .13, materials.ivory, 4.58, 2.22, -3.64);
    moriLabel('진료실', 1.6, .42, 4.58, 2.22, -3.59, 150);

    // Visible room corner: comfortable examination bed, stool, one bedside cabinet.
    moriFlatBox(1.76, 2.52, .16, .17, materials.wood, 4.43, .68, -2.12);
    moriFlatBox(1.65, 2.42, .23, .21, materials.ivory, 4.43, .88, -2.12);
    moriFlatBox(1.55, 1.47, .06, .11, materials.blanket, 4.43, 1.028, -1.71);
    moriFlatBox(1.08, .57, .16, .2, materials.white, 4.43, 1.055, -2.84);
    [[3.81, -3.02], [5.06, -3.02], [3.81, -1.2], [5.06, -1.2]].forEach(function (p) {
      moriCylinder(.06, .075, .52, materials.wood, p[0], .33, p[1]);
    });
    moriBox(.74, .68, .68, .1, materials.ivory, 2.82, .41, -2.84);
    moriBox(.55, .025, .012, .01, materials.wood, 2.82, .49, -2.487);
    moriCylinder(.1, .16, .36, materials.wood, 2.48, .23, -1.49);
    moriCylinder(.36, .34, .12, materials.peach, 2.48, .46, -1.49);

    // Indoor tree, softly oval crown, rounded clay pot.
    moriCylinder(.38, .27, .53, materials.peach, -5.18, .31, 2.58);
    moriCylinder(.33, .33, .06, materials.wood, -5.18, .58, 2.58);
    moriCylinder(.075, .095, 1.17, materials.wood, -5.18, 1.16, 2.58);
    moriSphere(.66, materials.green, -5.18, 1.94, 2.58, .9, 1.08, .84);
    moriSphere(.44, materials.mint, -5.51, 1.77, 2.6, 1, .94, .82);
    moriSphere(.43, materials.green, -4.9, 1.93, 2.65, .96, 1.08, .84);

    // Playful but spare stepping dots lead from the open front towards reception.
    [[-.18, 3.22], [-.42, 2.57], [-.82, 1.95], [-1.16, 1.29], [-1.57, .7]].forEach(function (p, i) {
      moriCylinder(.115, .115, .016, i % 2 ? materials.peach : materials.mint, p[0], .073, p[1]);
    });
    return hospital;
  };
}());
