// src/main.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

// Audio initialization
const backgroundMusic = new Audio('/assets/Music/music.mp3');
backgroundMusic.loop = true;

const BALL_RADIUS = 0.021335;
const HOLE_RADIUS = 0.053975;
const MAX_SHOT_SPEED = 5.0;
const FRICTION = 0.8;
const STOP_THRESHOLD = 0.02;
const RESTITUTION = 0.6;
const GRAVITY = -9.81;
const MAX_DT = 0.05;

// Completion margin: how close (horizontal) the ball must get to the hole_end
// to count as completed even if a flag pole is physically blocking exact entry.
const HOLE_COMPLETE_MARGIN = 0.06;

// picker scale for easier dragging (allows clicking near the ball)
const PICKER_SCALE = 4.0;
// additional screen-space tolerance in pixels as fallback
const SCREEN_TOLERANCE_PX = 80;

const LEVELS = ['hole1.glb', 'hole2.glb', 'hole3.glb'];
let currentLevelIndex = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7faed6);

// HDRI Environment Setup
const hdriLoader = new EXRLoader();
function loadHDREnvironment() {
    hdriLoader.load('/assets/Textures/HDRI/sunny_country_road_4k.exr', 
        function(texture) {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            scene.environment = texture;
            // Use as background for full environment
            scene.background = texture;
        },
        function(xhr) {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        function(error) {
            console.error('Error loading HDRI:', error);
        }
    );
}
// Enable HDRI environment
loadHDREnvironment();

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

// fallback ground
const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshPhongMaterial({ color: 0x2c8b2c }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; scene.add(ground);

// state & UI
let courseScene = null;
const colliderObjects = [];
let holeCenter = new THREE.Vector3(3.0, 0.0, -0.03);
let holeEnd = null;           // surface-projected end point (world space)
let holeCompleteRadius = HOLE_RADIUS + HOLE_COMPLETE_MARGIN;
let ballStart = new THREE.Vector3(-3.0, 0.0, 0.0);
let ballMesh = null;
let ballPicker = null;

let levelCompletePending = false;

let strokes = 0;

// Game state elements are now in the HTML
const strokesCounter = document.getElementById('strokes-counter');
const levelDisplay = document.getElementById('level-display');

// Control buttons
const musicControl = document.querySelector('.music-control');
const resetBallBtn = document.querySelector('.reset-ball');
const resetCameraBtn = document.querySelector('.reset-camera');
const levelSelectBtn = document.querySelector('.level-select');
const fullscreenBtn = document.querySelector('.fullscreen');
const helpBtn = document.querySelector('.help');

// Initialize game state displays
function updateGameStateDisplays() {
    strokesCounter.textContent = `Strokes: ${strokes}`;
    levelDisplay.textContent = `Level: ${currentLevelIndex + 1}`;
}

// Music control
let isMusicPlaying = false;
musicControl.addEventListener('click', () => {
    if (isMusicPlaying) {
        backgroundMusic.pause();
        musicControl.textContent = '🔇';
    } else {
        backgroundMusic.play();
        musicControl.textContent = '🔊';
    }
    isMusicPlaying = !isMusicPlaying;
});

// Reset ball button
resetBallBtn.addEventListener('click', () => {
    onLose();
    strokes++;
    updateGameStateDisplays();
});

// Reset camera button
resetCameraBtn.addEventListener('click', () => {
    camera.position.copy(ballMesh.position).add(cameraOffset);
    controls.target.copy(ballMesh.position);
    controls.update();
});

// Level select button
levelSelectBtn.addEventListener('click', () => {
    const maxLevel = LEVELS.length;
    const level = prompt(`Choose your challenge! Level 1-${maxLevel}`);
    const levelNum = parseInt(level);
    if (!isNaN(levelNum) && levelNum >= 1 && levelNum <= maxLevel) {
        loadLevel(levelNum - 1);
    } else {
        alert('Invalid level number!');
    }
});

// Fullscreen button
fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
});

// Help button
helpBtn.addEventListener('click', () => {
    alert(
        'Game Controls:\n\n' +
        '1. Click and drag the ball to aim and set power\n' +
        '2. Release to shoot\n' +
        '3. Use mouse/touch to rotate camera\n' +
        '4. Scroll to zoom in/out\n\n' +
        'Button Controls:\n' +
        '🔄 - Reset ball position\n' +
        '📹 - Reset camera view\n' +
        '🎯 - Select level\n' +
        '⛶ - Toggle fullscreen\n' +
        '🔊 - Toggle music\n'
    );
});

const loader = new GLTFLoader();

/* create ball and picker */
function createBallIfNeeded() {
  if (ballMesh) return;
  const mat = new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.6 });
  ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 32), mat);
  ballMesh.castShadow = true;
  ballMesh.receiveShadow = true;
  scene.add(ballMesh);

  // larger invisible picker so dragging works when clicking near ball
  const pickerGeom = new THREE.SphereGeometry(BALL_RADIUS * PICKER_SCALE, 12, 12);
  const pickerMat = new THREE.MeshBasicMaterial({ visible: false });
  ballPicker = new THREE.Mesh(pickerGeom, pickerMat);
  scene.add(ballPicker);
}

/* dispose previous course scene */
function disposeCourseScene() {
  if (!courseScene) return;
  courseScene.traverse(c => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach(m => { try { m.dispose(); } catch (e) {} });
      else try { c.material.dispose(); } catch (e) {}
    }
  });
  try { scene.remove(courseScene); } catch (e) {}
  courseScene = null;
  colliderObjects.length = 0;
  holeEnd = null;
  levelCompletePending = false;
  holeCompleteRadius = HOLE_RADIUS + HOLE_COMPLETE_MARGIN;
}

/* robust level loader: projects ball_start and ball_end to visible surface */
function loadLevel(index, restart = false) {
  if (index < 0 || index >= LEVELS.length) {
    console.warn('level index out of range', index);
    return;
  }

  currentLevelIndex = index;
  updateStatusUI();
  disposeCourseScene();

  const path = '/assets/' + LEVELS[index];
  loader.load(path, gltf => {
    courseScene = gltf.scene;
    scene.add(courseScene);

    // ensure matrices updated before sampling world positions
    courseScene.updateMatrixWorld(true);

    // defaults
    holeCenter.set(3.0, 0.0, -0.03);
    holeEnd = null;
    ballStart.set(-3.0, 0.0, 0.0);

    // collect meshes first so raycasts hit the visible geometry
    courseScene.traverse(obj => {
      if (obj.isMesh) colliderObjects.push(obj);
    });

    // now find named empties
    courseScene.traverse(obj => {
      if (!obj.name) return;
      const n = obj.name.toLowerCase();
      if (n === 'hole_center' || n === 'holecenter') {
        obj.getWorldPosition(holeCenter);
        obj.visible = false;
      }
      if (n === 'ball_start' || n === 'ballstart') {
        obj.getWorldPosition(ballStart);
        obj.visible = false;
      }
      if (n === 'hole_end' || n === 'holeend' || n === 'ball_end' || n === 'ballend') {
        // project the empty to the visible surface under it
        const tmp = new THREE.Vector3(); obj.getWorldPosition(tmp);
        const downFrom = tmp.clone().setY(tmp.y + 2.0);
        const rc = new THREE.Raycaster(downFrom, new THREE.Vector3(0, -1, 0));
        const hits = rc.intersectObject(courseScene, true);
        if (hits.length) {
          // store the surface point (world space)
          holeEnd = hits[0].point.clone();
        } else {
          // fallback to empty's world pos
          holeEnd = tmp.clone();
        }
        obj.visible = false;
      }
    });

    // compute completion radius optionally per-level (keeps stable behavior)
    holeCompleteRadius = Math.max(HOLE_RADIUS + HOLE_COMPLETE_MARGIN, HOLE_RADIUS * 0.9);

    // increase sensitivity for level 1 (index 0) so near-misses count
    if (index === 0) {
      holeCompleteRadius = Math.max(holeCompleteRadius, HOLE_RADIUS + 0.12);
      console.log('Level 1: increased hole complete radius to', holeCompleteRadius.toFixed(3));
    }

    createBallIfNeeded();

    // place ball at start and snap to visible surface under start
    ballMesh.position.copy(ballStart);
    const downCaster = new THREE.Raycaster(ballStart.clone().setY(ballStart.y + 2.0), new THREE.Vector3(0, -1, 0));
    const hits = downCaster.intersectObject(courseScene, true);
    ballMesh.position.y = hits.length ? hits[0].point.y + BALL_RADIUS : ballStart.y + BALL_RADIUS;

    if (ballPicker) ballPicker.position.copy(ballMesh.position);

    velocity.set(0, 0, 0);
    grounded = true;

    // reset strokes on level load
    strokes = 0;
    updateStatusUI();

    camera.position.copy(ballMesh.position).add(cameraOffset);
    controls.target.copy(ballMesh.position);
    controls.update();

    computeCourseBounds();

    if (holeEnd) console.log('holeEnd surface at', holeEnd.toArray());
    else console.log('no holeEnd found in this level');
  }, undefined, e => {
    console.error('GLTF load error', e);
  });
}

/* --- physics --- */
let velocity = new THREE.Vector3();
const ray = new THREE.Raycaster();
const clock = new THREE.Clock();
let grounded = false;
let groundNormal = new THREE.Vector3(0, 1, 0);
let courseBounds = null;
// flag used to reduce friction when on steep/loop surfaces to help climbing
let onSteepSurface = false;
function computeCourseBounds() { if (!courseScene) return; courseBounds = new THREE.Box3().setFromObject(courseScene); }

function onLose() {
  velocity.set(0, 0, 0);
  if (ballMesh && ballStart) {
    ballMesh.position.copy(ballStart);
    const tr = new THREE.Raycaster(ballStart.clone().setY(ballStart.y + 2.0), new THREE.Vector3(0, -1, 0));
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
const maxDrag = 1.0;
const INITIAL_RADIUS = 0.03;
const MIN_RADIUS = 0.008;

function createAimCylinder(p1, p2, radius, colorHex) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  let length = dir.length();
  if (length < 0.0001) length = 0.0001;
  const geom = new THREE.CylinderGeometry(radius, radius, length, 8, 1, true);
  geom.translate(0, length / 2, 0);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), metalness: 0.1, roughness: 0.6, transparent: false });
  const mesh = new THREE.Mesh(geom, mat);
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
  mesh.applyQuaternion(q);
  mesh.position.copy(p1);
  return mesh;
}

function getMouseGroundIntersection(clientX, clientY, y = 0) {
  const mouse = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
  const p = new THREE.Vector3();
  ray.ray.intersectPlane(plane, p);
  return p;
}

// improved hit test: ray intersects invisible larger picker, screen-space distance, or ground-projected tolerance up to ball diameter
function pointerHitsBall(clientX, clientY) {
  if (!ballPicker || !ballMesh) return false;
  const mouse = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);

  // primary: actual picker geometry intersection
  const ints = ray.intersectObject(ballPicker, false);
  if (ints.length > 0) return true;

  // secondary fallback: screen-space distance from mouse to ball projection
  const proj = ballMesh.position.clone().project(camera);
  const screenX = (proj.x + 1) / 2 * window.innerWidth;
  const screenY = (-proj.y + 1) / 2 * window.innerHeight;
  const dx = screenX - clientX;
  const dy = screenY - clientY;
  const distPx = Math.sqrt(dx * dx + dy * dy);
  if (distPx <= SCREEN_TOLERANCE_PX) return true;

  // world-space ground-projected check. This allows pulling from near the ball even if projection misses.
  const groundPoint = getMouseGroundIntersection(clientX, clientY, ballMesh.position.y);
  if (!groundPoint) return false;
  const horiz = new THREE.Vector3(groundPoint.x - ballMesh.position.x, 0, groundPoint.z - ballMesh.position.z);
  const horizDist = horiz.length();
  // allow up to ball diameter away and still count as pointer-on-ball
  if (horizDist <= BALL_RADIUS * 2.0 + 0.0001) return true;

  return false;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!ballMesh) return;
  if (velocity.length() > STOP_THRESHOLD) return;
  if (!grounded) return;
  if (!pointerHitsBall(e.clientX, e.clientY)) return;

  // prevent OrbitControls from stealing the interaction and lock this pointer to the canvas
  try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) {}
  e.preventDefault();

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
    const dirVec = dragVec.clone().normalize().multiplyScalar(dragLen);

    const p1 = ballMesh.position.clone();
    const p2 = ballMesh.position.clone().add(dirVec.setY(0));

    const frac = dragLen / maxDrag;
    const col = new THREE.Color();
    if (frac < 0.5) {
      const t = frac / 0.5;
      col.setRGB(t, 1, 0);
    } else {
      const t = (frac - 0.5) / 0.5;
      col.setRGB(1, 1 - t, 0);
    }

    const newRadius = INITIAL_RADIUS - (INITIAL_RADIUS - MIN_RADIUS) * frac;

    if (!aimLine) {
      aimLine = createAimCylinder(p1, p2, newRadius, col.getHex());
      scene.add(aimLine);
    } else {
      if (aimLine.geometry) aimLine.geometry.dispose();
      if (aimLine.material) aimLine.material.dispose();
      scene.remove(aimLine);
      aimLine = createAimCylinder(p1, p2, newRadius, col.getHex());
      scene.add(aimLine);
    }
  }
});

renderer.domElement.addEventListener('pointerup', (e) => {
  if (activePointerId !== null && e.pointerId !== activePointerId) return;

  // release pointer capture
  try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (err) {}

  if (isAiming && ballMesh) {
    isAiming = false;
    activePointerId = null;
    controls.enabled = true;
    if (aimLine) { if (aimLine.geometry) aimLine.geometry.dispose(); if (aimLine.material) aimLine.material.dispose(); scene.remove(aimLine); aimLine = null; }

    const worldPoint = getMouseGroundIntersection(e.clientX, e.clientY, ballMesh.position.y);
    const userDrag = worldPoint.clone().sub(aimStart);
    const dragLen = Math.min(maxDrag, userDrag.length());
    if (dragLen <= 0.01) return;
    const shotDir = aimStart.clone().sub(worldPoint); shotDir.y = 0; shotDir.normalize();
    velocity.copy(shotDir.multiplyScalar((dragLen / maxDrag) * MAX_SHOT_SPEED));
    strokes += 1;
    updateStatusUI();
    showCheerNotification();
    grounded = false;
  } else {
    activePointerId = null;
    isAiming = false;
    controls.enabled = true;
    if (aimLine) { if (aimLine.geometry) aimLine.geometry.dispose(); if (aimLine.material) aimLine.material.dispose(); scene.remove(aimLine); aimLine = null; }
  }
});

renderer.domElement.addEventListener('pointercancel', (e) => {
  if (activePointerId === e.pointerId) {
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (err) {}
    isAiming = false;
    activePointerId = null;
    controls.enabled = true;
    if (aimLine) { if (aimLine.geometry) aimLine.geometry.dispose(); if (aimLine.material) aimLine.material.dispose(); scene.remove(aimLine); aimLine = null; }
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
        // steep surface handling (help loops climb)
        const isSteep = triNormal.y <= 0.6;
        if (isSteep) onSteepSurface = true;

        if (triNormal.y > 0.6) {
          const depth = BALL_RADIUS - Math.sqrt(distSq);
          ballMesh.position.add(triNormal.clone().multiplyScalar(depth + 0.001));
          groundNormal.copy(triNormal);
          const vNormalComp = groundNormal.clone().multiplyScalar(velocity.dot(groundNormal));
          velocity.sub(vNormalComp);
          if (ballMesh.position.y < (groundNormal.y * 0.01 + BALL_RADIUS)) {
            ballMesh.position.y = Math.max(ballMesh.position.y, BALL_RADIUS + 0.001);
          }
          grounded = true;
        } else {
          // non-flat collision. bounce or slide.
          const vDot = velocity.dot(triNormal);
          if (vDot < 0) {
            const vNormal = triNormal.clone().multiplyScalar(vDot);
            const vTangent = velocity.clone().sub(vNormal);
            const newVNormal = triNormal.clone().multiplyScalar(-vDot * RESTITUTION);
            velocity.copy(vTangent.add(newVNormal));
          } else {
            velocity.multiplyScalar(0.995);
          }

          // assist climbing on loops for level 3: small tangential boost when moving up the loop
          if (currentLevelIndex === 2 && isSteep) {
            // tangent along surface direction of motion
            const tangent = velocity.clone().projectOnPlane(triNormal);
            const tangentLen = tangent.length();
            if (tangentLen > 0.001) {
              const uphillDir = new THREE.Vector3().crossVectors(triNormal, new THREE.Vector3(0, 1, 0)).cross(triNormal).normalize();
              // measure if moving generally uphill relative to loop local up
              const uphillDot = tangent.clone().normalize().dot(uphillDir);
              // only boost if there's forward motion and it's partly uphill
              if (velocity.length() > 0.05 && uphillDot > -0.2) {
                // boost magnitude scales with how steep the surface is (steeper => more assist)
                const boost = 0.25 * (1.0 - triNormal.y);
                velocity.add(tangent.clone().normalize().multiplyScalar(boost));
              }
            }
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
        const isSteep = triNormal.y <= 0.6;
        if (isSteep) onSteepSurface = true;

        if (triNormal.y > 0.6) {
          const depth = BALL_RADIUS - Math.sqrt(distSq);
          ballMesh.position.add(triNormal.clone().multiplyScalar(depth + 0.001));
          groundNormal.copy(triNormal);
          const vNormalComp = groundNormal.clone().multiplyScalar(velocity.dot(groundNormal));
          velocity.sub(vNormalComp);
          if (ballMesh.position.y < (groundNormal.y * 0.01 + BALL_RADIUS)) {
            ballMesh.position.y = Math.max(ballMesh.position.y, BALL_RADIUS + 0.001);
          }
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

          if (currentLevelIndex === 2 && isSteep) {
            const tangent = velocity.clone().projectOnPlane(triNormal);
            const tangentLen = tangent.length();
            if (tangentLen > 0.001) {
              const uphillDir = new THREE.Vector3().crossVectors(triNormal, new THREE.Vector3(0, 1, 0)).cross(triNormal).normalize();
              const uphillDot = tangent.clone().normalize().dot(uphillDir);
              if (velocity.length() > 0.05 && uphillDot > -0.2) {
                const boost = 0.25 * (1.0 - triNormal.y);
                velocity.add(tangent.clone().normalize().multiplyScalar(boost));
              }
            }
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

  // reset steep surface flag each step; resolveTriangle may set it true.
  onSteepSurface = false;

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
    groundNormal.copy(hitGround.face.normal).transformDirection(hitGround.object.matrixWorld).normalize();

    if (distanceToGround <= 0.001 && velocity.y <= 0.01) {
      ballMesh.position.y = groundY + BALL_RADIUS;
      const normalComp = groundNormal.clone().multiplyScalar(velocity.dot(groundNormal));
      velocity.sub(normalComp);
      grounded = true;
    } else grounded = false;
  } else grounded = false;

  if (!grounded) velocity.y += GRAVITY * dt;

  // integrate
  ballMesh.position.addScaledVector(velocity, dt);

  if (!courseBounds && courseScene) computeCourseBounds();

  for (const mesh of colliderObjects) {
    if (!mesh.geometry) continue;
    resolveSphereVsMeshTriangles(mesh);
  }

  // horizontal friction
  const horiz = new THREE.Vector3(velocity.x, 0, velocity.z);
  const speed = horiz.length();
  if (speed > 0) {
    // reduce friction when on steep surfaces to help climbing loops
    const frictionThisStep = onSteepSurface ? FRICTION * 0.35 : FRICTION;
    const newSpeed = Math.max(0, speed - frictionThisStep * dt);
    if (newSpeed < STOP_THRESHOLD) { velocity.x = 0; velocity.z = 0; }
    else { horiz.setLength(newSpeed); velocity.x = horiz.x; velocity.z = horiz.z; }
  }

  if (velocity.length() < STOP_THRESHOLD) velocity.set(0, 0, 0);

  // hole_center capture (unchanged)
  const dxC = ballMesh.position.x - holeCenter.x;
  const dzC = ballMesh.position.z - holeCenter.z;
  const horizDistC = Math.hypot(dxC, dzC);
  if (horizDistC <= HOLE_RADIUS && ballMesh.position.y < (holeCenter.y + 0.05) && velocity.length() < 0.15) {
    velocity.set(0, 0, 0);
    ballMesh.position.copy(holeCenter); ballMesh.position.y = holeCenter.y - 0.02; grounded = true;
    console.log('SCORED');
  }

  // hole_end completion using improved high-speed capture logic
  if (holeEnd && !levelCompletePending) {
    const dx = ballMesh.position.x - holeEnd.x;
    const dz = ballMesh.position.z - holeEnd.z;
    const horizDist = Math.hypot(dx, dz);

    // horizontal velocity and direction toward hole
    const horizVel = new THREE.Vector3(velocity.x, 0, velocity.z);
    const speedHoriz = horizVel.length();
    const dirToHole = new THREE.Vector3(holeEnd.x - ballMesh.position.x, 0, holeEnd.z - ballMesh.position.z);
    const dirLen = dirToHole.length();
    const dirNorm = dirLen > 0.0001 ? dirToHole.clone().normalize() : new THREE.Vector3(0, 0, 0);
    const approachDot = horizVel.dot(dirNorm); // >0 means moving toward hole

    // thresholds (tune if needed)
    const SPEED_THRESHOLD = 0.9;            // slow capture threshold
    const OVERRIDE_FACTOR = 1.2;            // slightly larger radius to override pole collisions
    const MIN_APPROACH_DOT = 0.25;          // require some component of velocity toward the hole to override

    if (
      (horizDist <= holeCompleteRadius && speedHoriz < SPEED_THRESHOLD) ||
      (horizDist <= holeCompleteRadius * OVERRIDE_FACTOR && approachDot > MIN_APPROACH_DOT)
    ) {
      levelCompletePending = true;
      velocity.set(0, 0, 0);
      // visually place ball near hole center (but don't attempt to pass through flag)
      ballMesh.position.x = holeEnd.x;
      ballMesh.position.z = holeEnd.z;
      // place ball slightly above the hole surface point so it is visible
      ballMesh.position.y = (holeEnd.y || ballMesh.position.y) + BALL_RADIUS * 0.2;
      grounded = true;
      console.log('Hole completion triggered by proximity. horiz=', horizDist.toFixed(3), 'speedHoriz=', speedHoriz.toFixed(3), 'approachDot=', approachDot.toFixed(3));

      // Show completion modal
      setTimeout(() => {
        showLevelCompleteModal();
      }, 120);
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

function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight; renderer.setSize(window.innerWidth, window.innerHeight); camera.updateProjectionMatrix(); }
window.addEventListener('resize', onWindowResize);

// Cheering system
const cheerMessages = [
    "🎯 Nice Shot!",
    "💫 Amazing!",
    "🌟 Great Shot!",
    "🎮 Skillful!",
    "⭐ Fantastic!",
    "🏌️ Pro Move!",
    "🎪 Spectacular!",
    "🎨 Beautiful Shot!",
    "🎯 Perfect Aim!",
    "🚀 Powerful Shot!"
];

const cheerContainer = document.querySelector('.cheer-container');
let lastCheerIndex = -1;

function showCheerNotification() {
    // Get a random message (different from the last one)
    let randomIndex;
    do {
        randomIndex = Math.floor(Math.random() * cheerMessages.length);
    } while (randomIndex === lastCheerIndex);
    lastCheerIndex = randomIndex;
    
    const message = cheerMessages[randomIndex];
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'cheer-notification';
    notification.textContent = message;
    
    // Add to container
    cheerContainer.appendChild(notification);
    
    // Remove after animation completes
    setTimeout(() => {
        notification.remove();
    }, 2500); // Matches CSS animation duration
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(MAX_DT, clock.getDelta());
  if (!isAiming) physicsStep(dt);
  updateCameraFollow();
  renderer.render(scene, camera);
}

// helper to update game state displays
function updateStatusUI() {
    updateGameStateDisplays();
}

// Level complete modal handling
function showLevelCompleteModal() {
    const modal = document.querySelector('.level-complete-modal');
    const overlay = document.querySelector('.modal-overlay');
    const completedLevelSpan = modal.querySelector('.completed-level');
    const strokeCountP = modal.querySelector('.stroke-count');
    const bestStrokesSpan = modal.querySelector('.best-strokes');
    
    completedLevelSpan.textContent = currentLevelIndex + 1;
    strokeCountP.textContent = `Par ${strokes}`;
    bestStrokesSpan.textContent = strokes; // You can implement best strokes tracking if needed
    
    modal.style.display = 'block';
    overlay.style.display = 'block';
    
    const nextBtn = modal.querySelector('.next-btn');
    const replayBtn = modal.querySelector('.replay-btn');
    
    nextBtn.onclick = () => {
        modal.style.display = 'none';
        overlay.style.display = 'none';
        const next = currentLevelIndex + 1;
        if (next < LEVELS.length) {
            loadLevel(next);
        } else {
            alert('All levels completed!');
            loadLevel(0);
        }
    };
    
    replayBtn.onclick = () => {
        modal.style.display = 'none';
        overlay.style.display = 'none';
        loadLevel(currentLevelIndex, true);
    };
}

// Screenshot functionality
const screenshotBtn = document.querySelector('.screenshot-btn');
screenshotBtn.addEventListener('click', () => {
    // Hide UI elements temporarily
    const uiElements = document.querySelectorAll('.control-panel, .bottom-right-controls, .game-state');
    uiElements.forEach(el => el.style.display = 'none');
    
    // Render scene
    renderer.render(scene, camera);
    
    // Create screenshot
    const screenshot = renderer.domElement.toDataURL('image/png');
    
    // Create temporary link and trigger download
    const link = document.createElement('a');
    link.href = screenshot;
    link.download = `minigolf-level${currentLevelIndex + 1}-screenshot.png`;
    link.click();
    
    // Show UI elements again
    uiElements.forEach(el => el.style.display = '');
});

// start
loadLevel(0);
animate();
