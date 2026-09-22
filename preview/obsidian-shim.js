/* Preview harness only — a stand-in for the parts of the `obsidian` module
   the tracker touches, so the real renderer can be exercised in a browser.
   Nothing here ships with the plugin. */

const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  "more-horizontal": '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  "rotate-ccw": '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
};

function applyOptions(el, options) {
  if (!options) return el;
  if (typeof options === "string") return (el.className = options), el;
  if (options.cls) el.className = options.cls;
  if (options.text !== undefined) el.textContent = options.text;
  for (const [name, value] of Object.entries(options.attr ?? {})) {
    el.setAttribute(name, String(value));
  }
  return el;
}

Node.prototype.createEl = function (tag, options) {
  return this.appendChild(applyOptions(document.createElement(tag), options));
};
Node.prototype.createDiv = function (options) {
  return this.createEl("div", options);
};
Node.prototype.createSpan = function (options) {
  return this.createEl("span", options);
};
HTMLElement.prototype.addClass = function (...cls) {
  this.classList.add(...cls);
};
HTMLElement.prototype.removeClass = function (...cls) {
  this.classList.remove(...cls);
};
HTMLElement.prototype.toggleClass = function (cls, on) {
  for (const name of cls.split(" ")) this.classList.toggle(name, on);
};
HTMLElement.prototype.setText = function (text) {
  this.textContent = text;
};
HTMLElement.prototype.empty = function () {
  this.replaceChildren();
};

export class Component {
  constructor() {
    this.cleanups = [];
    this.children = [];
    this.loaded = false;
  }
  load() {
    if (this.loaded) return;
    this.loaded = true;
    this.onload?.();
    for (const child of this.children) child.load();
  }
  unload() {
    for (const child of this.children) child.unload();
    for (const cleanup of this.cleanups) cleanup();
  }
  /* A parent that is already loaded loads the child as it takes it, which is
     what Obsidian does and what the deck and the row rely on: they build
     their views inside onload and hand them over. Without it the harness
     draws an empty deck and the thing under test never runs. */
  addChild(child) {
    this.children.push(child);
    if (this.loaded) child.load();
    return child;
  }
  register(cleanup) {
    this.cleanups.push(cleanup);
  }
}

export class MarkdownRenderChild extends Component {
  constructor(containerEl) {
    super();
    this.containerEl = containerEl;
  }
}

export class Menu {
  addItem() {
    return this;
  }
  addSeparator() {
    return this;
  }
  showAtMouseEvent() {
    return this;
  }
  onHide() {}
}

export class Notice {}

export function setIcon(el, name) {
  el.innerHTML = `<svg class="svg-icon lucide-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ""}</svg>`;
}

export function setTooltip(el, text) {
  el.setAttribute("title", text);
}

export function debounce(fn) {
  return Object.assign(fn, { cancel() {} });
}

export function parseYaml() {
  return {};
}

export function stringifyYaml() {
  return "";
}
