import './gold-particle-rain.css';

const OVERLAY_ID = 'gold-particle-rain-overlay';
const PARTICLE_COUNT = 52;

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
    particle.style.setProperty('--size', `${2 + Math.random() * 5}px`);
    particle.style.setProperty('--duration', `${6 + Math.random() * 10}s`);
    particle.style.setProperty('--delay', `${-Math.random() * 16}s`);
    particle.style.setProperty('--drift', `${-9 + Math.random() * 18}vw`);
    particle.style.setProperty('--sway', `${-3 + Math.random() * 6}vw`);
    particle.style.setProperty('--opacity', `${0.35 + Math.random() * 0.6}`);
    particle.style.setProperty('--blur', `${Math.random() * 0.8}px`);

    overlay.appendChild(particle);
  }

  document.body.appendChild(overlay);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createGoldRain, { once: true });
} else {
  createGoldRain();
}
