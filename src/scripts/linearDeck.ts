/**
 * Linear presentation behavior. One transition per user action.
 * The markup for the current screen is server-rendered; this script
 * moves between the static routes without a second handler on the same event.
 * Route numbers stay on the previous index (source slide minus 2). The
 * counter uses the position in the 49-screen sequence.
 */

type DeckScreen = {
  n: number;
  kind: string;
  title: string;
  transcript: string;
  image?: string;
  inspectImage?: string;
  inspect: boolean;
};

const root = document.querySelector<HTMLElement>('[data-linear-deck]');
if (root && root.dataset.ready !== 'true') {
  root.dataset.ready = 'true';
  const deck = root;

  const screens = JSON.parse(
    document.getElementById('linear-deck-data')?.textContent || '[]',
  ) as DeckScreen[];
  const total = screens.length;
  const first = screens[0]?.n ?? 1;
  const last = screens[screens.length - 1]?.n ?? first;
  const byN = new Map(screens.map((screen) => [screen.n, screen]));
  const frame = root.querySelector<HTMLElement>('[data-frame]')!;
  const shot = root.querySelector<HTMLImageElement>('[data-shot]')!;
  const live = root.querySelector<HTMLElement>('[data-live]')!;
  const progress = root.querySelector<HTMLElement>('[data-progress]')!;
  const prev = root.querySelector<HTMLButtonElement>('[data-prev]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-next]')!;
  const inspectBtn = root.querySelector<HTMLButtonElement>('[data-inspect]')!;
  const fullBtn = root.querySelector<HTMLButtonElement>('[data-fullscreen]')!;
  const inspect = root.querySelector<HTMLElement>('[data-inspect-layer]')!;
  const inspectImg = root.querySelector<HTMLImageElement>('[data-inspect-img]')!;
  const inspectClose = root.querySelector<HTMLButtonElement>('[data-inspect-close]')!;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let current = Number(root.dataset.screen || '1');
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let dragging = false;
  let lastPointer = { x: 0, y: 0 };

  const pad = (n: number) => String(n).padStart(2, '0');
  const screenAt = (n: number) => byN.get(n);
  const positionOf = (n: number) => n - first + 1;

  function rememberReturn() {
    sessionStorage.setItem('fs-linear-return', '1');
  }

  function preload(n: number) {
    for (const i of [n - 1, n, n + 1]) {
      const image = screenAt(i)?.image;
      if (!image) continue;
      const pic = new Image();
      pic.src = image;
    }
  }

  function applyZoom() {
    inspectImg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  function setInspect(open: boolean) {
    if (open) {
      const screen = screenAt(current);
      if (!screen?.inspectImage && !screen?.image) return;
      inspectImg.src = screen.inspectImage || screen.image || '';
      inspectImg.alt = screen.transcript;
      zoom = 1;
      panX = 0;
      panY = 0;
      applyZoom();
      inspect.hidden = false;
      inspectClose.focus();
    } else if (!inspect.hidden) {
      inspect.hidden = true;
      inspectBtn.focus();
    }
  }

  function render(n: number, announce: boolean, historyMode: 'push' | 'replace' | 'none') {
    const screen = screenAt(n);
    if (!screen) return;
    current = n;
    deck.dataset.screen = String(n);
    frame.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.panel !== screen.kind;
    });
    if (screen.kind === 'image' && screen.image) {
      if (shot.getAttribute('src') !== screen.image) shot.src = screen.image;
      shot.alt = screen.transcript;
    }
    progress.textContent = `${pad(positionOf(n))} / ${pad(total)}`;
    prev.disabled = n <= first;
    next.disabled = n >= last;
    inspectBtn.hidden = !screen.inspect;
    document.title = `${screen.title} · Linear Ad Platform`;
    if (announce) live.textContent = `${screen.title}. Screen ${positionOf(n)} of ${total}.`;
    const url = `/work/linear/${n}`;
    if (historyMode === 'push' && location.pathname !== url) history.pushState({ n }, '', url);
    if (historyMode === 'replace') history.replaceState({ n }, '', url);
    preload(n);
    fullBtn.setAttribute('aria-pressed', document.fullscreenElement ? 'true' : 'false');
  }

  function go(n: number) {
    if (!inspect.hidden) return;
    if (n < first || n > last || n === current) return;
    if (reduced) {
      render(n, true, 'push');
      return;
    }
    const dest = n;
    current = dest;
    frame.dataset.moving = 'true';
    window.setTimeout(() => {
      render(dest, true, 'push');
      frame.dataset.moving = 'false';
    }, 140);
  }

  prev.addEventListener('click', () => go(current - 1));
  next.addEventListener('click', () => go(current + 1));

  root.querySelector<HTMLElement>('[data-stage]')?.addEventListener('click', (event) => {
    if (!inspect.hidden || dragging) return;
    const target = event.target as Element | null;
    if (target?.closest('a, button, input, textarea, summary')) return;
    go(current + 1);
  });

  inspectBtn.addEventListener('click', () => setInspect(true));
  inspectClose.addEventListener('click', () => setInspect(false));

  inspect.addEventListener('wheel', (event) => {
    event.preventDefault();
    const nextZoom = Math.min(4, Math.max(1, zoom + (event.deltaY < 0 ? 0.15 : -0.15)));
    zoom = nextZoom;
    if (zoom === 1) {
      panX = 0;
      panY = 0;
    }
    applyZoom();
  }, { passive: false });

  inspectImg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    lastPointer = { x: event.clientX, y: event.clientY };
    inspectImg.setPointerCapture(event.pointerId);
  });
  inspectImg.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    lastPointer = { x: event.clientX, y: event.clientY };
    panX += dx;
    panY += dy;
    applyZoom();
  });
  inspectImg.addEventListener('pointerup', () => {
    dragging = false;
  });

  fullBtn.addEventListener('click', async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await root.requestFullscreen();
    }
    fullBtn.setAttribute('aria-pressed', document.fullscreenElement ? 'true' : 'false');
  });

  window.addEventListener('keydown', (event) => {
    const target = event.target as Element | null;
    if (target?.closest('input, textarea, [contenteditable="true"]')) return;

    if (event.key === 'Escape') {
      if (!inspect.hidden) {
        event.preventDefault();
        setInspect(false);
        return;
      }
      if (document.fullscreenElement) {
        event.preventDefault();
        void document.exitFullscreen();
        return;
      }
      event.preventDefault();
      rememberReturn();
      location.href = '/#work';
      return;
    }

    if (!inspect.hidden) {
      if (event.key === 'ArrowRight') panX -= 40;
      else if (event.key === 'ArrowLeft') panX += 40;
      else if (event.key === 'ArrowDown') panY -= 40;
      else if (event.key === 'ArrowUp') panY += 40;
      else if (event.key === '+' || event.key === '=') zoom = Math.min(4, zoom + 0.2);
      else if (event.key === '-' || event.key === '_') zoom = Math.max(1, zoom - 0.2);
      else return;
      event.preventDefault();
      if (zoom === 1) {
        panX = 0;
        panY = 0;
      }
      applyZoom();
      return;
    }

    const nextKeys = ['ArrowRight', 'ArrowDown', 'PageDown', ' '];
    const prevKeys = ['ArrowLeft', 'ArrowUp', 'PageUp'];
    if (nextKeys.includes(event.key)) {
      if (target?.closest('button, a') && event.key === ' ') return;
      event.preventDefault();
      go(current + 1);
    } else if (prevKeys.includes(event.key)) {
      event.preventDefault();
      go(current - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      go(first);
    } else if (event.key === 'End') {
      event.preventDefault();
      go(last);
    }
  });

  window.addEventListener('popstate', () => {
    const match = location.pathname.match(/\/work\/linear\/(\d+)/);
    const n = match ? Number(match[1]) : current;
    if (n !== current && screenAt(n)) render(n, true, 'none');
  });

  let idle: number | undefined;
  const bar = root.querySelector<HTMLElement>('[data-bar]')!;
  const wake = () => {
    root.dataset.idle = 'false';
    window.clearTimeout(idle);
    idle = window.setTimeout(() => {
      if (!root.contains(document.activeElement)) root.dataset.idle = 'true';
    }, 2800);
  };
  root.addEventListener('pointermove', wake);
  root.addEventListener('pointerdown', wake);
  root.addEventListener('focusin', wake);
  window.addEventListener('keydown', wake);
  wake();
  bar.addEventListener('focusin', () => {
    root.dataset.idle = 'false';
  });

  root.querySelector('[data-return]')?.addEventListener('click', rememberReturn);

  render(current, false, 'replace');
}
