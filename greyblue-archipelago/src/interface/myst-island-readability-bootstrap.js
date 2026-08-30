import {
  deriveMystIslandReadability,
  mystIslandReadabilityPublicState,
} from './myst-island-readability.js';

const priorDescriptor = Object.getOwnPropertyDescriptor(globalThis, '__greyblueState');
const priorGet = typeof priorDescriptor?.get === 'function' ? priorDescriptor.get.bind(globalThis) : null;
const priorSet = typeof priorDescriptor?.set === 'function' ? priorDescriptor.set.bind(globalThis) : null;
let currentState = priorGet ? priorGet() : globalThis.__greyblueState ?? null;
let disposed = false;
let lastKey = '';

function ensureNode() {
  let node = document.querySelector('#greyblue-myst-island-readability');
  if (node) return node;
  const hud = document.querySelector('#hud');
  if (!hud) return null;
  node = document.createElement('section');
  node.id = 'greyblue-myst-island-readability';
  node.hidden = true;
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  node.setAttribute('aria-atomic', 'true');
  Object.assign(node.style, {
    display: 'grid',
    gap: '2px',
    marginTop: '9px',
    paddingTop: '8px',
    borderTop: '1px solid #a7c0c84d',
  });
  hud.append(node);
  return node;
}

function render(view) {
  globalThis.__greyblueMystIslandReadability = mystIslandReadabilityPublicState(view);
  const node = ensureNode();
  if (!node) return;
  const key = `${view.active}|${view.phase}|${view.text}`;
  if (key === lastKey) return;
  lastKey = key;
  node.hidden = !view.active;
  if (!view.active) {
    node.replaceChildren();
    return;
  }

  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'Myst Island';
  eyebrow.style.cssText = 'font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#c3d5d9';
  const line = document.createElement('strong');
  line.textContent = view.text;
  line.style.cssText = 'font-size:13px;font-weight:650;color:#eef7f8';
  node.replaceChildren(eyebrow, line);
}

function apply(state) {
  render(deriveMystIslandReadability(state));
}

if (!priorDescriptor || priorDescriptor.configurable) {
  Object.defineProperty(globalThis, '__greyblueState', {
    configurable: true,
    enumerable: true,
    get() { return priorGet ? priorGet() : currentState; },
    set(value) {
      if (priorSet) priorSet(value);
      currentState = priorGet ? priorGet() : value;
      if (!disposed) apply(currentState);
    },
  });
}

apply(currentState);

globalThis.addEventListener?.('beforeunload', () => {
  disposed = true;
  document.querySelector('#greyblue-myst-island-readability')?.remove();
  delete globalThis.__greyblueMystIslandReadability;
}, { once: true });
