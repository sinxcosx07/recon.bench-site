(function () {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w, h, points = [];
  let mx = 0, my = 0;

  function resize() {
    w = canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
    h = canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
  }

  function init() {
    resize();
    const count = window.innerWidth < 640 ? 120 : 240;
    points = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      z: Math.random(),
      r: Math.random() * 1.4 + 0.4
    }));
  }

  window.addEventListener('mousemove', (e) => {
    mx = (e.clientX / window.innerWidth) - 0.5;
    my = (e.clientY / window.innerHeight) - 0.5;
  });

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const dpr = window.devicePixelRatio || 1;
    points.forEach((p) => {
      const parallax = reduceMotion ? 0 : p.z * 22;
      const x = p.x + mx * parallax;
      const y = p.y + my * parallax;
      ctx.beginPath();
      ctx.fillStyle = `rgba(14,124,134,${0.12 + p.z * 0.35})`;
      ctx.arc(x, y, p.r * dpr, 0, Math.PI * 2);
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  init();
  draw();
})();
