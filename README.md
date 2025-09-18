```markdown
# 🏌️‍♂️ MiniGolf (CloneFest 2025 Project)

A web-based **3D MiniGolf game** built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/).  
This project is part of **CloneFest 2025 — Reimagining a C-based Minigolf Classic**, where the goal is to port a minigolf experience into the browser with interactive physics, gameplay, and user-friendly controls.

---

## ✨ Features

- **3D Scene & Rendering**
  - Fully interactive 3D golf course rendered in Three.js.
  - Custom `.glb` golf hole model loaded dynamically.
  - Ambient and directional lighting for realism.

- **Golf Ball Physics**
  - Realistic sphere physics: gravity, friction, velocity, and restitution (bounce).
  - Triangle-level collision detection against course geometry (no teleporting over walls).
  - Ball stays grounded and reacts naturally to walls and slopes.

- **Player Interaction**
  - **Drag-to-Aim**: Click and drag anywhere near the ball to aim a shot.
  - **Shot Power**: Power bar visualized by a line that changes from yellow → red as drag length increases.
  - **Opposite Direction Launch**: Ball shoots in the opposite direction of the drag for intuitive control.
  - Configurable max drag distance and shot strength.

- **Camera System**
  - OrbitControls with **rotation, zoom, and pan**.
  - Camera follows the ball smoothly while still allowing rotation.
  - Prevents camera from going below the ground plane.

- **Gameplay & UI**
  - Stroke counter displayed in the corner of the screen.
  - Win detection: reaching the `hole_end` point shows a popup (“You won!”).
  - Lose condition: ball falling out of bounds resets to start.
  - Smooth user experience with clear visual feedback.

---

## 📂 Project Structure

```

MiniGolf/
├── public/

│   └── assets/

│       └── hole1.glb         # 3D course model

├── src/

│   └── main.js               # Core game logic

├── index.html

├── package.json

├── vite.config.js

└── README.md

````

---

## ⚙️ Installation & Setup

### 1. Clone the repository
```sh
git clone https://github.com/TheClazer/MiniGolf.git
cd MiniGolf
````

### 2. Install dependencies

```sh
npm install
```

### 3. Start development server

```sh
npm run dev
```

Open the shown URL (usually `http://localhost:5173/`) in your browser.

### 4. Build for production

```sh
npm run build
```

### 5. Preview production build

```sh
npm run preview
```

---

## 🕹️ Controls

* **Left Mouse Button + Drag** → Aim and set power.

  * The further you drag, the stronger the shot.
  * Line indicator shows direction & power (yellow → red).
* **Release Mouse Button** → Shoot the ball.
* **Mouse Scroll** → Zoom camera in/out.
* **Right Click + Drag** → Rotate camera around the ball.
* **Shift + Drag** → Pan the camera.

---

## ✅ Requirements Implemented (from Problem Statement)

* Three.js scene with lighting and camera.
* Load a 3D course hole model.
* Interactive golf ball with simplified physics (friction, gravity, bounce).
* Stroke counter with UI overlay.
* Goal detection (hole reached).
* OrbitControls for full camera control.
* Clear user feedback during aiming.

---

## 🌟 Future Enhancements

* Add multiple levels (multi-hole support).
* Score tracking across levels.
* Advanced terrain (ramps, slopes, curved surfaces).
* Database + authentication for persistent scoring.

---

## 🛠 Tech Stack

* **Three.js** – 3D rendering
* **Vite** – Dev server and bundler
* **JavaScript (ES Modules)** – Core logic

---

## 👨‍💻 Author

Built by **TheClazer** for CloneFest 2025.

```
```
