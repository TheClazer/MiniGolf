// src/main.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const BALL_RADIUS = 0.021335;
const HOLE_RADIUS = 0.053975;
const MAX_SHOT_SPEED = 3.0;
const FRICTION = 1.0;
const STOP_THRESHOLD = 0.02;
const RESTITUTION = 0.6;
const GRAVITY = -9.81;
const MAX_DT = 0.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfe3ff);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.01, 1000);
const cameraOffset = new THREE.Vector3(0, 1.6, 3.0);
camera.position.copy(cameraOffset);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x666666));
const dir = new THREE.DirectionalLight(0xffffff, 1);
dir.position.set(5,10,7); scene.add(dir);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0,0.2,0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.5;
controls.maxDistance = 20;
controls.minPolarAngle = 0.1;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.update();

const ground = new THREE.Mesh(new THREE.PlaneGeometry(50,50), new THREE.MeshPhongMaterial({color:0x2c8b2c}));
ground.rotation.x = -Math.PI/2; ground.position.y = -0.01; scene.add(ground);

// game state
let courseScene = null;
const colliderObjects = []; // per-mesh colliders
let holeCenter = new THREE.Vector3(3.0, 0.0, -0.03);
let holeEnd = null;
let ballStart = new THREE.Vector3(-3.0, 0.0, 0.0);
let ballMesh = null;

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
      const n = (obj.name || '').toLowerCase();
      if (!n.includes('ignore') && !n.includes('debug')) colliderObjects.push(obj);
    }
    if (!obj.name) return;
    const n = obj.name.toLowerCase();
    if (n === 'hole_center' || n === 'holecenter') {
      obj.getWorldPosition(holeCenter); obj.visible = false;
      const dbg = new THREE.Mesh(new THREE.SphereGeometry(0.02,8,8), new THREE.MeshBasicMaterial({color:0xff0000}));
      dbg.position.copy(holeCenter); scene.add(dbg);
    }
    if (n === 'hole_end' || n === 'holeend') {
      const he = new THREE.Vector3(); obj.getWorldPosition(he); holeEnd = he; obj.visible = false;
    }
    if (n === 'ball_start' || n === 'ballstart') {
      obj.getWorldPosition(ballStart); obj.visible = false;
      const dbg2 = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.01,0.05), new THREE.MeshBasicMaterial({color:0x00ff00}));
      dbg2.position.copy(ballStart); scene.add(dbg2);
    }
  });

  // create ball, place on actual ground under ballStart if available
  const mat = new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.6 });
  ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 32), mat);
  scene.add(ballMesh);
  ballMesh.position.copy(ballStart);
  // raycast down to find exact ground under start
  const tempRay = new THREE.Raycaster(ballStart.clone().setY(ballStart.y + 1.0), new THREE.Vector3(0, -1, 0));
  const hits = tempRay.intersectObject(courseScene, true);
  if (hits.length) ballMesh.position.y = hits[0].point.y + BALL_RADIUS;
  else ballMesh.position.y = ballStart.y + BALL_RADIUS;

  velocity.set(0,0,0);
  grounded = true;

  camera.position.copy(ballMesh.position).add(cameraOffset);
  controls.target.copy(ballMesh.position);
  controls.update();

  animate();
}, undefined, e => { console.error('GLTF load error', e); });

// physics state
let velocity = new THREE.Vector3();
const ray = new THREE.Raycaster();
const clock = new THREE.Clock();
let grounded = false;
let groundNormal = new THREE.Vector3(0,1,0);
let courseBounds = null;

function computeCourseBounds() { if (!courseScene) return; courseBounds = new THREE.Box3().setFromObject(courseScene); }
function onLose() {
  velocity.set(0,0,0);
  if (ballMesh && ballStart) {
    ballMesh.position.copy(ballStart);
    const tempR = new THREE.Raycaster(ballStart.clone().setY(ballStart.y + 1.0), new THREE.Vector3(0,-1,0));
    const hits = tempR.intersectObject(courseScene, true);
    if (hits.length) ballMesh.position.y = hits[0].point.y + BALL_RADIUS;
    else ballMesh.position.y = ballStart.y + BALL_RADIUS;
  }
  grounded = true;
  console.log('You lost: ball fell below course ground. Resetting ball.');
}

// input / aiming
let isAiming = false;
let aimStart = new THREE.Vector3();
let aimLine = null;
let activePointerId = null;
const maxDrag = 1.5;
let aimLineMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });

function getMouseGroundIntersection(clientX, clientY, y=0) {
  const mouse = new THREE.Vector2((clientX/window.innerWidth)*2 - 1, -(clientY/window.innerHeight)*2 + 1);
  ray.setFromCamera(mouse, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0,1,0), -y);
  const p = new THREE.Vector3();
  ray.ray.intersectPlane(plane, p);
  return p;
}
function pointerHitsBall(clientX, clientY) {
  if (!ballMesh) return false;
  const mouse = new THREE.Vector2((clientX/window.innerWidth)*2 - 1, -(clientY/window.innerHeight)*2 + 1);
  ray.setFromCamera(mouse, camera);
  const ints = ray.intersectObject(ballMesh, false);
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
    const targetPoint = ballMesh.position.clone().add(dir.setY(0));
    const p1 = ballMesh.position.clone();
    const p2 = targetPoint;
    if (!aimLine) {
      const geom = new THREE.BufferGeometry().setFromPoints([p1,p2]);
      aimLine = new THREE.Line(geom, aimLineMaterial);
      scene.add(aimLine);
    } else {
      aimLine.geometry.setFromPoints([p1,p2]);
      aimLine.geometry.attributes.position.needsUpdate = true;
    }
    const frac = dragLen / maxDrag;
    const col = new THREE.Color().setRGB(1, 1 - frac, 0);
    aimLineMaterial.color.copy(col);
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
    const shotDir = aimStart.clone().sub(worldPoint);
    shotDir.y = 0;
    shotDir.normalize();
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

// collision helpers
const tmpBox = new THREE.Box3();
const tmpBoxVertical = new THREE.Box3();
const tmpClosest = new THREE.Vector3();

// Improved resolve: treat mostly-up normals as ground contact (snap + zero vertical).
function resolveSphereVsMesh(mesh) {
  tmpBox.setFromObject(mesh);
  if (tmpBox.getSize(new THREE.Vector3()).length() < 0.0001) return false;
  tmpBoxVertical.copy(tmpBox);
  tmpBoxVertical.max.y = Math.min(tmpBox.max.y, ballMesh.position.y + BALL_RADIUS * 0.9);

  tmpBoxVertical.clampPoint(ballMesh.position, tmpClosest);
  let distSq = tmpClosest.distanceToSquared(ballMesh.position);
  let usedBox = tmpBoxVertical;
  if (distSq >= BALL_RADIUS * BALL_RADIUS) {
    tmpBox.clampPoint(ballMesh.position, tmpClosest);
    distSq = tmpClosest.distanceToSquared(ballMesh.position);
    usedBox = tmpBox;
    if (distSq >= BALL_RADIUS * BALL_RADIUS) return false;
  }

  const dist = Math.sqrt(distSq);
  const penetration = BALL_RADIUS - (dist || 0.0001);

  // collision normal from surface point to sphere center
  let normal = ballMesh.position.clone().sub(tmpClosest);
  if (normal.lengthSq() === 0) {
    normal.set(0,1,0);
  }
  normal.normalize();

  // if the collision normal is mostly upward treat as ground contact
  if (normal.y > 0.5) {
    // attempt to find accurate ground Y by raycasting downwards from slightly above the contact point
    const rayOrigin = ballMesh.position.clone().setY(ballMesh.position.y + 0.2);
    const down = new THREE.Vector3(0, -1, 0);
    ray.set(rayOrigin, down);
    if (courseScene) {
      const hits = ray.intersectObject(courseScene, true);
      if (hits.length) {
        const groundY = hits[0].point.y;
        // snap to ground exactly
        ballMesh.position.y = groundY + BALL_RADIUS;
        // remove only normal component (ground normal)
        groundNormal.copy(hits[0].face.normal).transformDirection(hits[0].object.matrixWorld).normalize();
        const normalComp = groundNormal.clone().multiplyScalar(velocity.dot(groundNormal));
        velocity.sub(normalComp);
        velocity.y = 0;
        grounded = true;
        return true;
      }
    }
    // fallback: snap using closest point if raycast failed
    ballMesh.position.add(normal.clone().multiplyScalar(penetration + 0.001));
    // zero vertical velocity and remove normal comp
    const vDot = velocity.dot(normal);
    if (vDot < 0) {
      const vNormal = normal.clone().multiplyScalar(vDot);
      const vTangent = velocity.clone().sub(vNormal);
      velocity.copy(vTangent);
    }
    velocity.y = 0;
    grounded = true;
    return true;
  }

  // otherwise treat as wall/side collision: reflect only normal component and apply restitution.
  const vDot = velocity.dot(normal);
  if (vDot < 0) {
    const vNormal = normal.clone().multiplyScalar(vDot);
    const vTangent = velocity.clone().sub(vNormal);
    const newVNormal = normal.clone().multiplyScalar(-vDot * RESTITUTION);
    velocity.copy(vTangent.add(newVNormal));
  } else {
    velocity.multiplyScalar(0.995);
  }

  // push sphere out of penetration
  ballMesh.position.add(normal.multiplyScalar(penetration + 0.001));
  // ensure not flagged as grounded
  grounded = false;
  return true;
}

// physics step
function physicsStep(dt) {
  if (!ballMesh) return;
  dt = Math.min(MAX_DT, dt);

  // determine ground under ball for grounded snapping before applying gravity
  let hitGround = null;
  if (courseScene) {
    const downOrigin = ballMesh.position.clone().setY(ballMesh.position.y + 0.2);
    ray.set(downOrigin, new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(courseScene, true);
    if (hits.length) hitGround = hits[0];
  }

  // grounded detection: close to ground and moving down or stopped
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
    } else {
      grounded = false;
    }
  } else {
    grounded = false;
  }

  // apply gravity only when not grounded
  if (!grounded) velocity.y += GRAVITY * dt;

  // integrate
  ballMesh.position.addScaledVector(velocity, dt);

  // ensure courseBounds known
  if (!courseBounds && courseScene) computeCourseBounds();

  // resolve collisions with all mesh colliders
  for (const mesh of colliderObjects) {
    if (!mesh.geometry) continue;
    resolveSphereVsMesh(mesh);
  }

  // horizontal friction
  const horiz = new THREE.Vector3(velocity.x, 0, velocity.z);
  const speed = horiz.length();
  if (speed > 0) {
    const newSpeed = Math.max(0, speed - FRICTION * dt);
    if (newSpeed < STOP_THRESHOLD) {
      velocity.x = 0; velocity.z = 0;
    } else {
      horiz.setLength(newSpeed);
      velocity.x = horiz.x; velocity.z = horiz.z;
    }
  }

  // kill tiny overall motion
  if (velocity.length() < STOP_THRESHOLD) velocity.set(0,0,0);

  // hole_center detection
  const dx = ballMesh.position.x - holeCenter.x;
  const dz = ballMesh.position.z - holeCenter.z;
  const horizDist = Math.hypot(dx, dz);
  if (horizDist <= HOLE_RADIUS && ballMesh.position.y < (holeCenter.y + 0.05) && velocity.length() < 0.15) {
    velocity.set(0,0,0);
    ballMesh.position.copy(holeCenter);
    ballMesh.position.y = holeCenter.y - 0.02;
    grounded = true;
    console.log('SCORED');
  }

  // hole_end win
  if (holeEnd) {
    const d = ballMesh.position.distanceTo(holeEnd);
    if (d < 0.12) {
      velocity.set(0,0,0);
      setTimeout(() => window.alert('You won!'), 50);
      holeEnd = null;
    }
  }

  // lose: ball falls below course ground while outside XZ bounds
  if (courseBounds) {
    const belowThreshold = ballMesh.position.y < (courseBounds.min.y - 0.1);
    const outsideXZ = ballMesh.position.x < courseBounds.min.x - 0.05 ||
                      ballMesh.position.x > courseBounds.max.x + 0.05 ||
                      ballMesh.position.z < courseBounds.min.z - 0.05 ||
                      ballMesh.position.z > courseBounds.max.z + 0.05;
    if (belowThreshold && outsideXZ) onLose();
  }
}

// camera follow while preserving rotation
function updateCameraFollow() {
  if (!ballMesh) return;
  const prevTarget = controls.target.clone();
  controls.target.lerp(ballMesh.position, 0.15);
  const delta = controls.target.clone().sub(prevTarget);
  camera.position.add(delta);
  const groundY = (courseBounds ? courseBounds.min.y : -0.01);
  if (camera.position.y < groundY + 0.15) camera.position.y = groundY + 0.15;
  controls.update();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(MAX_DT, clock.getDelta());
  if (!isAiming) physicsStep(dt);
  updateCameraFollow();
  renderer.render(scene, camera);
}
