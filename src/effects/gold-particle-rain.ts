/**
 * Mounts a decorative gold-particle overlay on the map page only.
 * Import this module from src/main.ts. No changes to the map controls.
 */
import './gold-particle-rain.css';

const OVERLAY_CLASS = 'gold-rain-overlay';

function mountGoldRain(): void {
  if (document.querySelector(`.${OVERLAY_CLASS}`)) return;

  const overlay = document.createElement('div');
  overlay.className = OVERLAY_CLASS;
  overlay.setAttribute('aria-hidden', 'true');
  document.body.appendChild(overlay);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountGoldRain, { once: true });
} else {
  mountGoldRain();
}
