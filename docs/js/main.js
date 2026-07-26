import { initViewer, loadCloud } from './viewer.js';

// ---- Edit these two arrays to match your actual datasets and methods ----
const DATASETS = [
  { slug: 'MipNerf', name: 'MipNerf' },
  { slug: 'Temples', name: 'Temples' },
  { slug: 'video', name: 'Object scan' }
];

const METHODS = [
  { slug: 'sp_sg', name: 'SP + SG' },
  { slug: 'disk', name: 'DISK' },
  { slug: 'loftr', name: 'LoFTR' },
  { slug: 'aliked', name: 'Aliked' },
  { slug: 'mast3r', name: 'MASt3R' },
  { slug: 'vggt', name: 'VGGT', format: 'glb'}
];

// Reference image column for the grid — kept separate from METHODS
// since it's not a reconstruction and shouldn't be clickable to load
// into the point-cloud viewer, just shown for visual comparison.
const GROUND_TRUTH = { slug: 'ground_truth', name: 'Ground Truth' };
// ---------------------------------------------------------------------

const state = {
  dataset: DATASETS[0].slug,
  method: METHODS[METHODS.length - 1].slug
};

function gridImagePath(datasetSlug, methodSlug) {
  return `assets/images/grid/${datasetSlug}/${methodSlug}.png`;
}
function cloudPath(datasetSlug, methodSlug) {
  const method = METHODS.find((m) => m.slug === methodSlug);
  const ext = (method && method.format) || 'ply';
  return `assets/pointclouds/${datasetSlug}/${methodSlug}.${ext}`;
}
function placeholderDataUri(label) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='160'>
    <rect width='100%' height='100%' fill='#e7e9e7'/>
    <text x='50%' y='50%' font-size='11' font-family='monospace' fill='#8a8f8a'
      text-anchor='middle' dominant-baseline='middle'>${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildGrid() {
  const gridEl = document.getElementById('comparison-grid');
  let html = '<div class="grid-row grid-header"><div class="grid-cell grid-corner"></div>';
  html += `<div class="grid-cell grid-label method-col-label ground-truth-col-label">${GROUND_TRUTH.name}</div>`;
  METHODS.forEach(m => {
    html += `<div class="grid-cell grid-label method-col-label">${m.name}</div>`;
  });
  html += '</div>';

  DATASETS.forEach(d => {
    html += `<div class="grid-row" data-dataset="${d.slug}">
      <div class="grid-cell grid-label dataset-row-label">${d.name}</div>
      <div class="grid-cell thumb-cell ground-truth-cell" data-dataset="${d.slug}" aria-label="Ground truth for ${d.name}">
        <img src="${gridImagePath(d.slug, GROUND_TRUTH.slug)}" alt="Ground truth for ${d.name}" loading="lazy"
          onerror="this.onerror=null;this.src='${placeholderDataUri(GROUND_TRUTH.name)}'">
      </div>`;
    METHODS.forEach(m => {
      html += `<div class="grid-cell thumb-cell" data-dataset="${d.slug}" data-method="${m.slug}" tabindex="0" role="button" aria-label="${m.name} on ${d.name}">
        <img src="${gridImagePath(d.slug, m.slug)}" alt="${m.name} on ${d.name}" loading="lazy"
          onerror="this.onerror=null;this.src='${placeholderDataUri(m.name)}'">
      </div>`;
    });
    html += '</div>';
  });

  gridEl.innerHTML = html;
  gridEl.querySelectorAll('.thumb-cell[data-method]').forEach(cell => {
    const pick = () => { selectDataset(cell.dataset.dataset); selectMethod(cell.dataset.method); };
    cell.addEventListener('click', pick);
    cell.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
  });
}

function buildDatasetTabs() {
  const wrap = document.getElementById('dataset-tabs');
  wrap.innerHTML = DATASETS.map(d =>
    `<button class="tab" data-dataset="${d.slug}">${d.name}</button>`
  ).join('');
  wrap.querySelectorAll('.tab').forEach(btn =>
    btn.addEventListener('click', () => selectDataset(btn.dataset.dataset))
  );
}

function buildMethodCards() {
  const wrap = document.getElementById('method-cards');
  wrap.innerHTML = METHODS.map(m => `
    <button class="method-card" data-method="${m.slug}">
      <img src="${gridImagePath(state.dataset, m.slug)}" alt="${m.name}" loading="lazy"
        onerror="this.onerror=null;this.src='${placeholderDataUri(m.name)}'">
      <span>${m.name}</span>
    </button>`).join('');
  wrap.querySelectorAll('.method-card').forEach(btn =>
    btn.addEventListener('click', () => selectMethod(btn.dataset.method))
  );
}

function highlightSelection() {
  document.querySelectorAll('.thumb-cell').forEach(c =>
    c.classList.toggle('active', c.dataset.dataset === state.dataset && c.dataset.method === state.method)
  );
  document.querySelectorAll('.method-card').forEach(c =>
    c.classList.toggle('active', c.dataset.method === state.method)
  );
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.dataset === state.dataset)
  );
}

async function refreshViewer() {
  const overlay = document.getElementById('viewer-overlay');
  overlay.style.display = 'flex';
  overlay.textContent = 'Loading point cloud…';
  try {
    await loadCloud(cloudPath(state.dataset, state.method));
    overlay.style.display = 'none';
  } catch (e) {
    overlay.innerHTML = `Add <code>${cloudPath(state.dataset, state.method)}</code> to view this reconstruction`;
    overlay.style.display = 'flex';
  }
}

function selectDataset(slug) {
  if (state.dataset === slug) return;
  state.dataset = slug;
  buildMethodCards();
  highlightSelection();
  refreshViewer();
}

function selectMethod(slug) {
  if (state.method === slug) return;
  state.method = slug;
  highlightSelection();
  refreshViewer();
}

document.addEventListener('DOMContentLoaded', () => {
  buildGrid();
  buildDatasetTabs();
  buildMethodCards();
  highlightSelection();
  initViewer('viewer-canvas-container');
  refreshViewer();

  const root = document.documentElement;
  const themeBtn = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('theme');
  if (saved) root.setAttribute('data-theme', saved);
  themeBtn.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
});