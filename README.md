```markdown
# 🏌️‍♂️ MiniGolf (CloneFest 2025 Project)

A web-based **3D MiniGolf game** built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/).  
This project is part of **CloneFest 2025 — Reimagining a C-based Minigolf Classic**, where the goal is to port a minigolf experience into the browser with interactive physics, gameplay, and user-friendly controls.

Deployed on **Vercel** → [🎮 Play Now](https://mini-golf-eta.vercel.app/)
---

---

## 🎮 Use Case: Loading Page Game

This project can also be adapted as a **fun offline/loading screen game** 🔄  
(similar to the **Chrome dinosaur game** or simple **Flappy Bird clones**).  

👉 It can run in the background while:  
- A website/app is loading heavy content  
- Users are offline or facing slow internet  
- As an **Easter Egg mini-game** to keep users engaged 🎉  

---

## ✨ Features

- **3D Scene & Rendering**
  - Interactive 3D golf courses rendered in Three.js.
  - Multiple `.glb` holes (`hole1.glb`, `hole2.glb`, `hole3.glb`) loaded dynamically.
  - Ambient + directional lighting for realistic shading.

- **Golf Ball Physics**
  - Realistic physics: gravity, friction, velocity, restitution (bounce).
  - Triangle-level collision detection (no wall clipping).
  - Special handling for **loops** (level 3): reduced friction + uphill assist for smoother climbs.

- **Player Interaction**
  - **Drag-to-Aim**: Click near the ball (within its diameter) to start aiming.
  - **Shot Power**: Visualized by a cylinder that changes color (green → yellow → red) and thickness.
  - **Opposite Direction Launch**: Pull back and release to shoot forward.
  - Configurable shot strength and drag tolerance.

- **Camera System**
  - Smooth ball-following camera.
  - OrbitControls: rotate, zoom, pan.
  - Prevents camera from clipping into the ground.

- **Gameplay & UI**
  - Single HUD counter (top-left) showing **Level** and **Strokes**.
  - After each hole, popup shows: *“You took X strokes”*.
  - Win detection: reaching `hole_end` triggers level completion.
  - Lose condition: falling out of bounds resets ball to start.

---

## 📂 Project Structure

```

MiniGolf/
├── public/
│   └── assets/
│       ├── hole1.glb        # Level 1 course
│       ├── hole2.glb        # Level 2 course
│       └── hole3.glb        # Level 3 with 360° loop
├── src/
│   ├── main.js              # Core game logic
│   └── style.css            # Styling
├── index.html               # Entry point
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

Open the shown URL (usually `http://localhost:5173/`).

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

* **Left Mouse Button + Drag near ball** → Aim and set power

  * Pull further = stronger shot.
  * Cylinder indicator shows color (green → yellow → red) and thickness.
* **Release Mouse Button** → Shoot the ball.
* **Mouse Scroll** → Zoom camera.
* **Right Click + Drag** → Rotate camera.
* **Shift + Drag** → Pan camera.

---

## ✅ Requirements Implemented

* Multi-level support (`hole1`, `hole2`, `hole3`).
* Advanced physics with friction, bounce, gravity.
* Stroke counter with clean UI overlay.
* Hole detection (with high-speed capture fix).
* Loop climbing mechanics.
* Camera follow system with OrbitControls.

---

## 📌  Future Enhancements
  🎶 Add sound effects & background music

  📱 Mobile/touchscreen support

  🏆 Leaderboard & scoring system

  🎨 More levels with ramps & moving obstacles
---

## 🛠 Tech Stack

* **Three.js** – 3D rendering
* **Vite** – Dev server & bundler
* **JavaScript (ES Modules)** – Core logic

---

## 👨‍💻 Author

Built by **TheClazer**,**Ashitha0409**,**has066** and **ayushranjan28** for CloneFest 2025.

```
```
