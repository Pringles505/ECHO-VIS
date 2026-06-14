// Lightweight cross-module bridge so PropertiesPanel (and anything else)
// can open the docs page at a specific anchor without prop-drilling or store changes.
let _open = null;

export const docsNav = {
  /** Called once by App.jsx to register the navigation handler. */
  register(fn) { _open = fn; },
  /** Open the docs page and scroll to `anchor` (e.g. "animation", "link"). */
  open(anchor = '') { _open?.(anchor); },
};
