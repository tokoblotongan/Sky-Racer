// src/ui/introBanner.ts

export interface IntroBanner {
  show: (arenaName: string, subtitleLabel: string, onSkip?: () => void) => void;
  hide: () => void;
  dispose: () => void;
}

export function createIntroBanner(container: HTMLElement): IntroBanner {
  const root = document.createElement('div');
  root.className = 'sr-intro-banner sr-hud-hidden';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Pratinjau Arena');

  const card = document.createElement('div');
  card.className = 'sr-intro-banner-card';

  const kicker = document.createElement('span');
  kicker.className = 'sr-intro-kicker';
  kicker.textContent = 'ARENA BALAP';

  const titleEl = document.createElement('div');
  titleEl.className = 'sr-intro-title';

  const subEl = document.createElement('div');
  subEl.className = 'sr-intro-sub';

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'sr-intro-skip';
  skipBtn.textContent = 'Ketuk layar / Space / Enter untuk lewati';

  card.appendChild(kicker);
  card.appendChild(titleEl);
  card.appendChild(subEl);
  card.appendChild(skipBtn);
  root.appendChild(card);
  container.appendChild(root);

  let skipHandler: (() => void) | null = null;
  let visible = false;
  let disposed = false;

  const triggerSkip = (e: Event): void => {
    if (!visible || disposed) {
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    skipHandler?.();
  };

  skipBtn.addEventListener('click', triggerSkip);
  root.addEventListener('pointerdown', triggerSkip);

  const show = (arenaName: string, subtitleLabel: string, onSkip?: () => void): void => {
    if (disposed) {
      return;
    }
    skipHandler = onSkip ?? null;
    titleEl.textContent = arenaName;
    subEl.textContent = subtitleLabel;
    visible = true;
    root.classList.remove('sr-hud-hidden');
  };

  const hide = (): void => {
    visible = false;
    skipHandler = null;
    root.classList.add('sr-hud-hidden');
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    hide();
    skipBtn.removeEventListener('click', triggerSkip);
    root.removeEventListener('pointerdown', triggerSkip);
    if (root.parentElement === container) {
      container.removeChild(root);
    }
  };

  return {
    show,
    hide,
    dispose,
  };
}
