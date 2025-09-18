// src/main.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const BALL_RADIUS = 0.021335;
const HOLE_RADIUS = 0.053975;
// increased shot strength
const MAX_SHOT_SPEED = 5.0;
const FRICTION = 1.0;
const STOP_THRESHOLD = 0.02;
const RESTITUTION = 0.6;
const GRAVITY = -9.81;
const MAX_DT = 0.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe3ff);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 1000);
const cameraOffset = new THREE.Vector3(0, 1.6, 3.0);
camera.position.copy(cameraOffset);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x666666));
const dir = new THREE.DirectionalLight(0xffffff, 1); dir.position.set(5, 10, 7); scene.add(dir);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.5;
controls.maxDistance = 20;
controls.minPolarAngle = 0.1;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.update();

// visual ground
const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshPhongMaterial({ color: 0x2c8b2c }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; scene.add(ground);

// state & UI
let courseScene = null;
const colliderObjects = [];
let holeCenter = new THREE.Vector3(3.0, 0.0, -0.03);
let holeEnd = null;
let ballStart = new THREE.Vector3(-3.0, 0.0, 0.0);
let ballMesh = null;
let ballPicker = null; // invisible slightly-larger mesh for reliable clicking

let strokes = 0;
const strokesEl = document.createElement('div');
strokesEl.style.position = 'fixed';
strokesEl.style.left = '12px';
strokesEl.style.top = '12px';
strokesEl.style.padding = '6px 10px';
strokesEl.style.background = 'rgba(0,0,0,0.5)';
strokesEl.style.color = '#fff';
strokesEl.style.fontFamily = 'monospace';
strokesEl.style.zIndex = 9999;
strokesEl.innerText = `Strokes: ${strokes}`;
document.body.appendChild(strokesEl);

const loader = new GLTFLoader();
loader.load('/assets/hole1.glb', gltf => {
  scene.add(gltf.scene);
  courseScene = gltf.scene;
  courseScene.updateWorldMatrix(true, true);

  gltf.scene.traverse(obj => {
    if (obj.isMesh) {
      // treat all meshes as colliders
      colliderObjects.push(obj);
    }
    if (!obj.name) return;
    const n = obj.name.toLowerCase();
    if (n === 'hole_center' || n === 'holecenter') {
      obj.getWorldPosition(holeCenter); obj.visible = false;
      const dbg = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
      dbg.position.copy(holeCenter); scene.add(dbg);
    }
    if (n === 'hole_end' || n === 'holeend') {
      const he = new THREE.Vector3(); obj.getWorldPosition(he); holeEnd = he; obj.visible = false;
    }
    if (n === 'ball_start' || n === 'ballstart') {
      obj.getWorldPosition(ballStart); obj.visible = false;
      const dbg2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.05), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
      dbg2.position.copy(ballStart); scene.add(dbg2);
    }
  });

  // create ball
  const mat = new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.6 });
  ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 32), mat);
  scene.add(ballMesh);
  ballMesh.position.copy(ballStart);

  // place exactly on ground under start if possible
  const tr = new THREE.Raycaster(ballStart.clone().setY(ballStart.y + 1), new THREE.Vector3(0, -1, 0));
  const hits = tr.intersectObject(courseScene, true);
  ballMesh.position.y = hits.length ? hits[0].point.y + BALL_RADIUS : ballStart.y + BALL_RADIUS;

  // create invisible picker slightly larger than ball to make clicks reliable across sphere surface
  const pickerGeom = new THREE.SphereGeometry(BALL_RADIUS * 1.25, 8, 8);
  const pickerMat = new THREE.MeshBasicMaterial({ visible: false });
  ballPicker = new THREE.Mesh(pickerGeom, pickerMat);
  scene.add(ballPicker);
  ballPicker.position.copy(ballMesh.position);

  velocity.set(0, 0, 0);
  grounded = true;

  camera.position.copy(ballMesh.position).add(cameraOffset);
  controls.target.copy(ballMesh.position);
  controls.update();

  animate();
}, undefined, e => console.error('GLTF load error', e));

/* physics */
let velocity = new THREE.Vector3();
const ray = new THREE.Raycaster();
const clock = new THREE.Clock();
let grounded = false;
let groundNormal = new THREE.Vector3(0, 1, 0);
let courseBounds = null;
function computeCourseBounds() { if (!courseScene) return; courseBounds = new THREE.Box3().setFromObject(courseScene); }
function onLose() {
  velocity.set(0, 0, 0);
  if (ballMesh && ballStart) {
    ballMesh.position.copy(ballStart);
    const tr = new THREE.Raycaster(ballStart.clone().setY(ballStart.y + 1), new THREE.Vector3(0, -1, 0));
    const hits = tr.intersectObject(courseScene, true);
    ballMesh.position.y = hits.length ? hits[0].point.y + BALL_RADIUS : ballStart.y + BALL_RADIUS;
  }
  grounded = true;
  console.log('You lost. Resetting ball.');
}

/* AIMING */
let isAiming = false;
let aimStart = new THREE.Vector3();
let aimLine = null;
let activePointerId = null;
// decreased max drag length
const maxDrag = 1.0;
let aimLineMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });

function getMouseGroundIntersection(clientX, clientY, y = 0) {
  const mouse = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
  const p = new THREE.Vector3();
  ray.ray.intersectPlane(plane, p);
  return p;
}

// use ballPicker for robust hit detection
function pointerHitsBall(clientX, clientY) {
  if (!ballPicker) return false;
  const mouse = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const ints = ray.intersectObject(ballPicker, false);
  return ints.length > 0;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!ballMesh) return;
  if (velocity.length() > STOP_THRESHOLD) return;
  if (!grounded) return;
  if (!pointerHitsBall(e.clientX, e.clientY)) return;

  isAiming = true;
  activePointerId = e.pointerId;
  controls.enabled = false;
  aimStart.copy(getMouseGroundIntersection(e.clientX, e.clientY, ballMesh.position.y));
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (activePointerId !== null && e.pointerId !== activePointerId) return;
  if (isAiming && ballMesh) {
    const cur = getMouseGroundIntersection(e.clientX, e.clientY, ballMesh.position.y);
    const dragVec = cur.clone().sub(aimStart);
    const dragLen = Math.min(maxDrag, dragVec.length());
    const dir = dragVec.clone().normalize().multiplyScalar(dragLen);
    const p1 = ballMesh.position.clone();
    const p2 = ballMesh.position.clone().add(dir.setY(0));
    if (!aimLine) {
      const geom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      aimLine = new THREE.Line(geom, aimLineMaterial);
      scene.add(aimLine);
    } else {
      aimLine.geometry.setFromPoints([p1, p2]);
      aimLine.geometry.attributes.position.needsUpdate = true;
    }
    const frac = dragLen / maxDrag;
    aimLineMaterial.color.setRGB(1, 1 - frac, 0);
  }
});

renderer.domElement.addEventListener('pointerup', (e) => {
  if (activePointerId !== null && e.pointerId !== activePointerId) return;
  if (isAiming && ballMesh) {
    isAiming = false;
    activePointerId = null;
    controls.enabled = true;
    if (aimLine) { scene.remove(aimLine); aimLine.geometry.dispose(); aimLine = null; aimLineMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 }); }

    const worldPoint = getMouseGroundIntersection(e.clientX, e.clientY, ballMesh.position.y);
    const userDrag = worldPoint.clone().sub(aimStart);
    const dragLen = Math.min(maxDrag, userDrag.length());
    if (dragLen <= 0.01) return;
    // ball goes opposite drag
    const shotDir = aimStart.clone().sub(worldPoint); shotDir.y = 0; shotDir.normalize();
    // stronger max shot speed applied
    velocity.copy(shotDir.multiplyScalar((dragLen / maxDrag) * MAX_SHOT_SPEED));
    strokes += 1;
    strokesEl.innerText = `Strokes: ${strokes}`;
    grounded = false;
  } else {
    activePointerId = null;
    isAiming = false;
    controls.enabled = true;
    if (aimLine) { scene.remove(aimLine); aimLine.geometry.dispose(); aimLine = null; aimLineMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 }); }
  }
});

/* --- Triangle-level collision utilities --- */
const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
const ab = new THREE.Vector3(), ac = new THREE.Vector3(), ap = new THREE.Vector3();
const bp = new THREE.Vector3(), cp = new THREE.Vector3();
function closestPointOnTriangle(p, a, b, c, out) {
  ab.subVectors(b, a); ac.subVectors(c, a); ap.subVectors(p, a);
  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) { return out.copy(a); }
  bp.subVectors(p, b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) { return out.copy(b); }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return out.copy(ab).multiplyScalar(v).add(a);
  }
  cp.subVectors(p, c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) { return out.copy(c); }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return out.copy(ac).multiplyScalar(w).add(a);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return out.copy(b).sub(c).multiplyScalar(w).add(c);
  }
  const denom = 1.0 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return out.copy(ab).multiplyScalar(v).add(ac.clone().multiplyScalar(w)).add(a);
}

const worldA = new THREE.Vector3(), worldB = new THREE.Vector3(), worldC = new THREE.Vector3();
const triNormal = new THREE.Vector3(), closest = new THREE.Vector3();

function resolveSphereVsMeshTriangles(mesh) {
  const geom = mesh.geometry;
  if (!geom || !geom.attributes || !geom.attributes.position) return false;
  const posAttr = geom.attributes.position;
  const index = geom.index;
  const meshMatrix = mesh.matrixWorld;
  let collided = false;
  if (index) {
    const idx = index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const ia = idx[i], ib = idx[i + 1], ic = idx[i + 2];
      v0.fromArray(posAttr.array, ia * 3).applyMatrix4(meshMatrix);
      v1.fromArray(posAttr.array, ib * 3).applyMatrix4(meshMatrix);
      v2.fromArray(posAttr.array, ic * 3).applyMatrix4(meshMatrix);
      closestPointOnTriangle(ballMesh.position, v0, v1, v2, closest);
      const distSq = closest.distanceToSquared(ballMesh.position);
      if (distSq < BALL_RADIUS * BALL_RADIUS) {
        collided = true;
        triNormal.crossVectors(v1.clone().sub(v0), v2.clone().sub(v0)).normalize();
        if (triNormal.y > 0.6) {
          // ground contact
          const depth = BALL_RADIUS - Math.sqrt(distSq);
          ballMesh.position.add(triNormal.clone().multiplyScalar(depth + 0.001));
          const vNormalComp = triNormal.clone().multiplyScalar(velocity.dot(triNormal));
          velocity.sub(vNormalComp);
          velocity.y = 0;
          grounded = true;
        } else {
          // side collision reflect only if moving into normal
          const vDot = velocity.dot(triNormal);
          if (vDot < 0) {
            const vNormal = triNormal.clone().multiplyScalar(vDot);
            const vTangent = velocity.clone().sub(vNormal);
            const newVNormal = triNormal.clone().multiplyScalar(-vDot * RESTITUTION);
            velocity.copy(vTangent.add(newVNormal));
          } else {
            velocity.multiplyScalar(0.995);
          }
          const penetration = BALL_RADIUS - Math.sqrt(distSq) || 0.0001;
          ballMesh.position.add(triNormal.clone().multiplyScalar(penetration + 0.001));
          grounded = false;
        }
        break;
      }
    }
  } else {
    const count = posAttr.count;
    for (let i = 0; i < count; i += 3) {
      v0.fromArray(posAttr.array, i * 3).applyMatrix4(meshMatrix);
      v1.fromArray(posAttr.array, (i + 1) * 3).applyMatrix4(meshMatrix);
      v2.fromArray(posAttr.array, (i + 2) * 3).applyMatrix4(meshMatrix);
      closestPointOnTriangle(ballMesh.position, v0, v1, v2, closest);
      const distSq = closest.distanceToSquared(ballMesh.position);
      if (distSq < BALL_RADIUS * BALL_RADIUS) {
        collided = true;
        triNormal.crossVectors(v1.clone().sub(v0), v2.clone().sub(v0)).normalize();
        if (triNormal.y > 0.6) {
          const depth = BALL_RADIUS - Math.sqrt(distSq);
          ballMesh.position.add(triNormal.clone().multiplyScalar(depth + 0.001));
          const vNormalComp = triNormal.clone().multiplyScalar(velocity.dot(triNormal));
          velocity.sub(vNormalComp);
          velocity.y = 0;
          grounded = true;
        } else {
          const vDot = velocity.dot(triNormal);
          if (vDot < 0) {
            const vNormal = triNormal.clone().multiplyScalar(vDot);
            const vTangent = velocity.clone().sub(vNormal);
            const newVNormal = triNormal.clone().multiplyScalar(-vDot * RESTITUTION);
            velocity.copy(vTangent.add(newVNormal));
          } else {
            velocity.multiplyScalar(0.995);
          }
          const penetration = BALL_RADIUS - Math.sqrt(distSq) || 0.0001;
          ballMesh.position.add(triNormal.clone().multiplyScalar(penetration + 0.001));
          grounded = false;
        }
        break;
      }
    }
  }
  return collided;
}

/* physics step */
function physicsStep(dt) {
  if (!ballMesh) return;
  dt = Math.min(MAX_DT, dt);

  // update ballPicker position to follow ball (so clicks hit everywhere)
  if (ballPicker) ballPicker.position.copy(ballMesh.position);

  // ground raycast
  let hitGround = null;
  if (courseScene) {
    const downOrigin = ballMesh.position.clone().setY(ballMesh.position.y + 0.2);
    ray.set(downOrigin, new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(courseScene, true);
    if (hits.length) hitGround = hits[0];
  }

  if (hitGround) {
    const groundY = hitGround.point.y;
    const distanceToGround = ballMesh.position.y - (groundY + BALL_RADIUS);
    if (distanceToGround <= 0.001 && velocity.y <= 0.01) {
      ballMesh.position.y = groundY + BALL_RADIUS;
      groundNormal.copy(hitGround.face.normal).transformDirection(hitGround.object.matrixWorld).normalize();
      const normalComp = groundNormal.clone().multiplyScalar(velocity.dot(groundNormal));
      velocity.sub(normalComp);
      velocity.y = 0;
      grounded = true;
    } else grounded = false;
  } else grounded = false;

  if (!grounded) velocity.y += GRAVITY * dt;

  // integrate
  ballMesh.position.addScaledVector(velocity, dt);

  if (!courseBounds && courseScene) computeCourseBounds();

  // triangle-based collisions
  for (const mesh of colliderObjects) {
    if (!mesh.geometry) continue;
    resolveSphereVsMeshTriangles(mesh);
  }

  // horizontal friction
  const horiz = new THREE.Vector3(velocity.x, 0, velocity.z);
  const speed = horiz.length();
  if (speed > 0) {
    const newSpeed = Math.max(0, speed - FRICTION * dt);
    if (newSpeed < STOP_THRESHOLD) { velocity.x = 0; velocity.z = 0; }
    else { horiz.setLength(newSpeed); velocity.x = horiz.x; velocity.z = horiz.z; }
  }

  if (velocity.length() < STOP_THRESHOLD) velocity.set(0, 0, 0);

  // hole_center
  const dx = ballMesh.position.x - holeCenter.x;
  const dz = ballMesh.position.z - holeCenter.z;
  const horizDist = Math.hypot(dx, dz);
  if (horizDist <= HOLE_RADIUS && ballMesh.position.y < (holeCenter.y + 0.05) && velocity.length() < 0.15) {
    velocity.set(0, 0, 0);
    ballMesh.position.copy(holeCenter); ballMesh.position.y = holeCenter.y - 0.02; grounded = true;
    console.log('SCORED');
  }

  // hole_end win
  if (holeEnd) {
    if (ballMesh.position.distanceTo(holeEnd) < 0.12) {
      velocity.set(0, 0, 0);
      setTimeout(() => window.alert('You won!'), 50);
      holeEnd = null;
    }
  }

  // lose
  if (courseBounds) {
    const belowThreshold = ballMesh.position.y < (courseBounds.min.y - 0.1);
    const outsideXZ = ballMesh.position.x < courseBounds.min.x - 0.05 ||
      ballMesh.position.x > courseBounds.max.x + 0.05 ||
      ballMesh.position.z < courseBounds.min.z - 0.05 ||
      ballMesh.position.z > courseBounds.max.z + 0.05;
    if (belowThreshold && outsideXZ) onLose();
  }
}

/* camera follow */
function updateCameraFollow() {
  if (!ballMesh) return;
  const prevTarget = controls.target.clone();
  controls.target.lerp(ballMesh.position, 0.15);
  const delta = controls.target.clone().sub(prevTarget);
  camera.position.add(delta);
  const groundY = courseBounds ? courseBounds.min.y : -0.01;
  if (camera.position.y < groundY + 0.15) camera.position.y = groundY + 0.15;
  controls.update();
}

function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }
window.addEventListener('resize', onWindowResize);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(MAX_DT, clock.getDelta());
  if (!isAiming) physicsStep(dt);
  updateCameraFollow();
  renderer.render(scene, camera);
}
