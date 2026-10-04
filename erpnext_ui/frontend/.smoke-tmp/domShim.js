// Minimal DOM so app modules with import-time browser side effects (i18n sets
// document.documentElement.lang) can load in node. Effects never run under
// renderToString, so nothing else should need this.
const makeNode = () => {
  const node = {
    nodeType: 1, style: {}, children: [], childNodes: [], textContent: "",
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    appendChild(c) { node.children.push(c); return c; },
    insertBefore(c) { node.children.push(c); return c; },
    removeChild() {}, remove() {}, cloneNode: () => node,
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    focus() {}, blur() {}, click() {},
    ownerDocument: null, firstChild: null, lastChild: null,
  };
  return node;
};

globalThis.document = globalThis.document || {
  documentElement: Object.assign(makeNode(), { lang: "en", dir: "ltr" }),
  body: makeNode(),
  head: makeNode(),
  createElement: () => makeNode(),
  createElementNS: () => makeNode(),
  createTextNode: (t) => ({ nodeType: 3, textContent: t, style: {}, setAttribute() {}, appendChild() {} }),
  createComment: (t) => ({ nodeType: 8, textContent: t }),
  createDocumentFragment: () => makeNode(),
  querySelectorAll: () => [],
  getElementsByTagName: () => [],
  querySelector: () => null,
  getElementById: () => null,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.window = globalThis.window || {
  document: globalThis.document,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {},
  removeEventListener() {},
  location: { href: "http://localhost/", pathname: "/", search: "" },
  getComputedStyle: () => ({ getPropertyValue: () => "" }),
};
// node 23 exposes a getter-only navigator; define over it.
try {
  Object.defineProperty(globalThis, "navigator", {
    value: { language: "en", userAgent: "node" },
    configurable: true,
    writable: true,
  });
} catch {}
