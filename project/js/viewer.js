import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let scene, camera, renderer, controls, currentObject, container;
let ready = false;

const MAX_BOUNDS_SAMPLES = 20000;

// ---------------------------------------------------------------------
// Point cloud appearance — change these two numbers to resize points,
// nothing else needs to change. Both are used together as
// Math.max(radius * POINT_SIZE_RATIO, POINT_SIZE_MIN) in
// applyPointMaterial() below.
//   POINT_SIZE_RATIO — point size as a fraction of each cloud's own
//     robust radius, so dense/large and small/sparse clouds don't need
//     separate tuning.
//   POINT_SIZE_MIN — an absolute floor (in scene units) so points never
//     shrink to sub-pixel dots on very small or tightly-packed clouds.
// ---------------------------------------------------------------------
const POINT_SIZE_RATIO = 0.0015;
const POINT_SIZE_MIN = 0.0015;

// VGGT's .glb export uses X-right, Y-down, Z-forward-into-the-scene
// (the common COLMAP/OpenCV camera convention); three.js's world space
// is X-right, Y-up, Z-out-of-the-screen. Loaded straight in, that's why
// the VGGT cloud started upside-down — and it's also what made rotation
// feel broken: orbiting an object whose "up" doesn't match the camera's
// up vector is disorienting even though the controls work fine. The
// other methods' .ply files are already in three.js's convention, so
// this flip is applied to .glb loads only (see loadCloud below). Set to
// false if VGGT's export convention ever changes and no longer needs it.
const FLIP_TO_THREE_UP_AXIS = true;

export function initViewer(containerId) {
  container = document.getElementById(containerId);
  const width = container.clientWidth || 600;
  const height = container.clientHeight || 420;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 2000);
  camera.position.set(0, 0, 3);

  // Only matters for lit mesh materials (e.g. camera-frustum meshes that
  // can come bundled inside a VGGT .glb export) — point clouds render
  // fine without it, but a PBR mesh with no light looks solid black.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(1, 1, 1);
  scene.add(dirLight);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Slightly slower than the default (1) so a scroll/trackpad gesture
  // moves through the zoom range gradually instead of overshooting.
  controls.zoomSpeed = 0.6;

  // Full rotation: OrbitControls' polar angle defaults to the closed
  // range [0, π] (straight down to straight up). Sitting exactly on
  // either endpoint is a known edge case — the camera's up-vector
  // calculation degenerates right at the poles, which can make the
  // drag stall or jitter instead of continuing smoothly past that
  // point. Insetting very slightly avoids ever landing exactly on it.
  controls.minPolarAngle = 0.001;
  controls.maxPolarAngle = Math.PI - 0.001;

  // Full continuous spin left/right (rotation around the Y axis).
  // Unrestricted by default, but set explicitly rather than left
  // implicit — a single drag only covers a limited angle, dragging
  // again continues accumulating rather than resetting, so a full
  // loop takes a couple of drags rather than one continuous swipe.
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;

  // Explicit pan support: dragging only orbits around a fixed target,
  // it doesn't move that target — without panning there's no way to
  // recenter the view on a different part of a large or elongated
  // cloud. screenSpacePanning keeps the pan direction matching what's
  // actually on screen regardless of the cloud's own orientation
  // (COLMAP/VGGT output is frequently not aligned to the default
  // Y-up orbit axis).
  controls.enablePan = true;
  controls.screenSpacePanning = true;

  // Sane fallback until a cloud loads and frameObject() tightens these
  // to the object's actual scale.
  controls.minDistance = 0.05;
  controls.maxDistance = 500;

  window.addEventListener('resize', onResize);
  ready = true;
  animate();
}

function onResize() {
  if (!container || !renderer) return;
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  if (!ready) return;
  controls.update();
  renderer.render(scene, camera);
}

function disposeObject3D(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (mat.map) mat.map.dispose();
        mat.dispose();
      });
    }
  });
}

function countVertices(root) {
  let total = 0;
  root.traverse((child) => {
    const geom = child.geometry;
    if (geom && geom.attributes && geom.attributes.position) {
      total += geom.attributes.position.count;
    }
  });
  return total;
}

// Samples world-space vertex positions across a subtree — a .glb scene
// can contain a point cloud plus separate camera-frustum meshes, so this
// walks all of them. Sampling (instead of reading every vertex) keeps
// dense clouds fast to frame rather than stalling the tab on load.
function sampleWorldPositions(root, maxSamples = MAX_BOUNDS_SAMPLES) {
  root.updateMatrixWorld(true);
  const total = countVertices(root);
  if (!total) return [];

  const stride = Math.max(1, Math.floor(total / maxSamples));
  const out = [];
  const v = new THREE.Vector3();
  root.traverse((child) => {
    const geom = child.geometry;
    if (!geom || !geom.attributes || !geom.attributes.position) return;
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i += stride) {
      v.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
  });
  return out;
}

// Robust center/radius for a point set: uses the 95th-percentile distance
// from the centroid rather than the true bounding sphere, so a handful of
// far-flung outlier points (common in noisy VGGT/COLMAP reconstructions)
// can't dictate the camera framing and point scale. That outlier-skewed
// bounding sphere was the real reason some clouds rendered as near-
// invisible dust: a few stray points inflated the radius, so the point
// size and camera distance were computed for a much bigger object than
// the actual structure.
function computeRobustBounds(positions) {
  const count = positions.length / 3;
  if (!count) return { center: new THREE.Vector3(), radius: 1 };

  const center = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    center.x += positions[i * 3];
    center.y += positions[i * 3 + 1];
    center.z += positions[i * 3 + 2];
  }
  center.divideScalar(count);

  const dists = new Array(count);
  for (let i = 0; i < count; i++) {
    const dx = positions[i * 3] - center.x;
    const dy = positions[i * 3 + 1] - center.y;
    const dz = positions[i * 3 + 2] - center.z;
    dists[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  dists.sort((a, b) => a - b);

  const p95 = dists[Math.min(Math.floor(count * 0.95), count - 1)];
  const radius = Number.isFinite(p95) && p95 > 0 ? p95 : 1;
  return { center, radius };
}

function frameObject({ center, radius }) {
  const defaultDistance = radius * 2.4;

  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(0, 0, defaultDistance));

  camera.near = Math.max(radius * 0.01, 0.001);
  camera.far = Math.max(radius * 50, camera.near * 1000);
  camera.updateProjectionMatrix();

  // Zoom limits anchored to the initial framing distance, not the raw
  // radius. This is still the zoom-crash fix — uncapped, scrolling in
  // drives the camera-to-target distance toward 0, producing a
  // degenerate/NaN view matrix that takes down the WebGL context, and
  // uncapped zoom-out does the same at the other extreme — but keeping
  // the range close to defaultDistance (~0.25x–3x) instead of the far
  // wider radius-based range (0.05x–20x) means one scroll/trackpad
  // gesture no longer blows straight through the whole range and lands
  // you jammed against the closest-allowed distance. There's now real
  // room to stop at a medium zoom between the default view and the
  // closest/farthest allowed distances.
  controls.minDistance = defaultDistance * 0.25;
  controls.maxDistance = defaultDistance * 3;
}

function applyPointMaterial(points, radius) {
  const geometry = points.geometry;
  const hasColor = !!geometry.attributes.color;
  if (points.material) points.material.dispose();
  points.material = new THREE.PointsMaterial({
    size: Math.max(radius * POINT_SIZE_RATIO, POINT_SIZE_MIN),
    vertexColors: hasColor,
    color: hasColor ? 0xffffff : 0x0e7c86,
    sizeAttenuation: true
  });
}

function extensionOf(path) {
  const clean = path.split(/[?#]/)[0];
  const dot = clean.lastIndexOf('.');
  return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase();
}

function loadPly(path) {
  return new Promise((resolve, reject) => {
    new PLYLoader().load(path, (geometry) => resolve(new THREE.Points(geometry)), undefined, reject);
  });
}

function loadGlb(path) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(path, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

// Loads a .ply point cloud, or a .glb/.gltf scene (points and/or meshes,
// as VGGT exports) into the viewer. Resolves on success, rejects if the
// file is missing, empty, or malformed.
export function loadCloud(path) {
  if (!ready) return Promise.reject(new Error('viewer not initialized'));

  const ext = extensionOf(path);
  const isGlb = ext === 'glb' || ext === 'gltf';

  return (isGlb ? loadGlb(path) : loadPly(path)).then((object) => {
    if (isGlb) {
      object.rotation.x = Math.PI*2;
    }
    if (FLIP_TO_THREE_UP_AXIS && !isGlb) {
      object.rotation.x = Math.PI;
    }


    const positions = sampleWorldPositions(object);
    if (!positions.length) {
      throw new Error(`No point/mesh geometry found in ${path}`);
    }
    const bounds = computeRobustBounds(positions);

    if (currentObject) {
      scene.remove(currentObject);
      disposeObject3D(currentObject);
    }

    object.traverse((child) => {
      if (child.isPoints) applyPointMaterial(child, bounds.radius);
    });

    scene.add(object);
    currentObject = object;
    frameObject(bounds);
  });
}