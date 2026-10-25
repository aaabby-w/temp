import './gold-particle-rain.css';

const OVERLAY_ID = 'gold-particle-rain-overlay';
const PARTICLE_COUNT = 85;

function createGoldRain() {
  if (document.getElementById(OVERLAY_ID)) return;

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'gold-rain-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const particle = document.createElement('span');
    particle.className = `gold-rain-particle${Math.random() > 0.72 ? ' is-sparkle' : ''}`;

    // Each particle gets its own position, speed, size, delay, and sideways drift.
    particle.style.setProperty('--left', `${Math.random() * 100}%`);
    particle.style.setProperty('--size', `${2 + Math.random() * 4}px`);
    particle.style.setProperty('--duration', `${2.2 + Math.random() * 2.8}s`);
    particle.style.setProperty('--delay', `${-Math.random() * 5}s`);
    particle.style.setProperty('--drift', `${-12 + Math.random() * 24}vw`);
    particle.style.setProperty('--sway', `${-4 + Math.random() * 8}vw`);
    particle.style.setProperty('--opacity', `${0.45 + Math.random() * 0.55}`);
    particle.style.setProperty('--bounce', `${0.15 + Math.random() * 0.45}s`);
    overlay.appendChild(particle);
  }

  document.body.appendChild(overlay);

const saved = localStorage.getItem('gold-rain-enabled');
const enabled = saved !== 'false';

overlay.classList.toggle('is-disabled', !enabled);

const toggle = document.createElement('button');
toggle.type = 'button';
toggle.className = 'gold-rain-toggle';
toggle.setAttribute('aria-pressed', String(enabled));
toggle.setAttribute('aria-label', 'Toggle gold particle rain');

toggle.innerHTML = `
  <span class="gold-toggle-icon" aria-hidden="true">✧</span>
  <span class="gold-toggle-label">金粒子效果</span>
  <span class="gold-toggle-track">
    <span class="gold-toggle-knob"></span>
  </span>
`;

function updateToggle(on: boolean) {
  overlay.classList.toggle('is-disabled', !on);
  toggle.classList.toggle('is-on', on);
  toggle.setAttribute('aria-pressed', String(on));
  toggle.setAttribute('aria-label', on ? '关闭金币雨' : '开启金币雨');
  localStorage.setItem('gold-rain-enabled', String(on));
}

toggle.addEventListener('click', () => {
  updateToggle(toggle.getAttribute('aria-pressed') !== 'true');
});

document.body.appendChild(toggle);
updateToggle(enabled);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createGoldRain, { once: true });
} else {
  createGoldRain();
}
