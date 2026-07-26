Multi-Method 3D Reconstruction Benchmark

A comparative study of sparse and dense 3D reconstruction pipelines — Superpoint, DISK, LoFTR, Aliked, MASt3R and VGGT — evaluated with hloc, with an interactive point-cloud viewer for side-by-side comparison against ground truth.

Built during a research internship at IIT Roorkee.

What's here
A comparison grid: one row per dataset, one column per method (plus a ground-truth reference column), click any thumbnail to load that reconstruction into the viewer.
An interactive 3D viewer (Three.js) for .ply point clouds and .glb scenes (VGGT), supporting rotate, pan, and zoom.
Write-up of the pipeline, current blockers, and planned work.

Repo structure
.
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── hero-canvas.js       # decorative hero background animation
│   ├── main.js               # datasets/methods config, grid, tabs, cards
│   └── viewer.js             # Three.js point-cloud/scene viewer
├── assets/
│   ├── pipeline/              # pipeline diagram
│   ├── images/grid/{dataset}/{method}.jpg   # grid thumbnails + ground_truth.jpg
│   └── pointclouds/{dataset}/{method}.ply|.glb
