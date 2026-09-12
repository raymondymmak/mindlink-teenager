"use strict";

/**
 * iOS Safari / Expo web keyboard hangover.
 *
 * react-native-web Dimensions reads window.visualViewport.height. Opening the
 * soft keyboard shrinks that value and Expo's `#root,body,html{height:100%}`
 * shell follows it. Navigating away (Welcome → Chat) unmounts the focused
 * input; iOS often restores the *visible* viewport but does not fire
 * visualViewport `resize`, so RN layouts stay at the keyboard-open height
 * (content crushed at the top, composer floating, empty gap below).
 *
 * KeyboardAvoidingView is a no-op on react-native-web — this is not a KAV
 * leftover. We remember the keyboard-closed height and re-apply it to the
 * document shell whenever nothing editable is focused.
 */

const KEYBOARD_HANGOVER_THRESHOLD = 80;
const KEYBOARD_SETTLE_MS = 350;

const EDITABLE_TAGS = new Set(["input", "textarea", "select"]);

function isEditableTarget(el) {
  if (!el || typeof el !== "object") return false;
  const doc = el.ownerDocument || (typeof document !== "undefined" ? document : null);
  if (doc && el === doc.body) return false;
  const tag = String(el.tagName || "").toLowerCase();
  if (EDITABLE_TAGS.has(tag)) {
    if (tag === "input") {
      const type = String(el.type || "text").toLowerCase();
      if (
        type === "button" ||
        type === "submit" ||
        type === "reset" ||
        type === "checkbox" ||
        type === "radio" ||
        type === "file" ||
        type === "hidden"
      ) {
        return false;
      }
    }
    return true;
  }
  return Boolean(el.isContentEditable);
}

function isEditableFocused(doc) {
  if (!doc || !doc.activeElement) return false;
  return isEditableTarget(doc.activeElement);
}

function readVisualViewportHeight(viewport, fallback) {
  if (viewport && typeof viewport.height === "number" && !Number.isNaN(viewport.height)) {
    return Math.round(viewport.height);
  }
  const n = Number(fallback);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function shouldTreatAsKeyboardHangover({
  visualHeight,
  closedHeight,
  editing,
  threshold = KEYBOARD_HANGOVER_THRESHOLD,
} = {}) {
  if (editing) return false;
  const visual = Number(visualHeight) || 0;
  const closed = Number(closedHeight) || 0;
  return closed > 0 && visual > 0 && closed - visual >= threshold;
}

function nextClosedHeight({
  prev = 0,
  visualHeight = 0,
  layoutHeight = 0,
  editing = false,
  source = "manual",
} = {}) {
  const visual = Number(visualHeight) || 0;
  const layout = Number(layoutHeight) || 0;
  const candidate = Math.max(visual, layout);
  const previous = Number(prev) || 0;

  if (editing) {
    return previous > 0 ? previous : candidate;
  }

  if (source === "resize" || source === "init" || source === "orientation") {
    return candidate > 0 ? candidate : previous;
  }

  if (
    shouldTreatAsKeyboardHangover({
      visualHeight: visual,
      closedHeight: previous,
      editing: false,
    })
  ) {
    return previous;
  }

  return candidate > 0 ? candidate : previous;
}

function pickAppViewportHeight({
  visualHeight = 0,
  layoutHeight = 0,
  closedHeight = 0,
  editing = false,
} = {}) {
  const visual = Number(visualHeight) || 0;
  const layout = Number(layoutHeight) || 0;
  const closed = Number(closedHeight) || 0;
  if (editing && visual > 0) {
    return visual;
  }
  return Math.max(visual, layout, closed);
}

function applyAppShellHeight(height, doc) {
  const target = doc || (typeof document !== "undefined" ? document : null);
  if (!target) return 0;
  const pxHeight = Math.max(0, Math.round(Number(height) || 0));
  if (pxHeight <= 0) return 0;
  const px = `${pxHeight}px`;
  const root = target.documentElement;
  if (root && root.style && typeof root.style.setProperty === "function") {
    root.style.setProperty("--app-height", px);
  }
  const nodes = [root, target.body, target.getElementById && target.getElementById("root")].filter(
    Boolean
  );
  nodes.forEach((node) => {
    if (!node.style) return;
    node.style.height = px;
    node.style.minHeight = px;
    node.style.maxHeight = px;
  });
  return pxHeight;
}

function blurActiveEditable(doc) {
  const target = doc || (typeof document !== "undefined" ? document : null);
  if (!target) return false;
  const el = target.activeElement;
  if (!isEditableTarget(el)) return false;
  if (typeof el.blur === "function") {
    el.blur();
    return true;
  }
  return false;
}

function measureViewport(win, doc) {
  const visual = readVisualViewportHeight(
    win && win.visualViewport,
    win && win.innerHeight
  );
  const layout =
    (doc && doc.documentElement && doc.documentElement.clientHeight) ||
    (win && win.innerHeight) ||
    0;
  return { visual, layout: Math.round(Number(layout) || 0) };
}

function dispatchViewportResize(win) {
  if (!win) return;
  try {
    if (win.visualViewport && typeof win.visualViewport.dispatchEvent === "function") {
      win.visualViewport.dispatchEvent(new Event("resize"));
    }
  } catch {
    // Ignore synthetic-event failures in older WebViews.
  }
  try {
    win.dispatchEvent(new Event("resize"));
  } catch {
    // Ignore.
  }
}

function waitAnimationFrame(win) {
  const raf =
    win && typeof win.requestAnimationFrame === "function"
      ? win.requestAnimationFrame.bind(win)
      : (cb) => setTimeout(cb, 16);
  return new Promise((resolve) => {
    raf(() => resolve());
  });
}

function syncWebViewportShell({
  win = typeof window !== "undefined" ? window : undefined,
  doc = typeof document !== "undefined" ? document : undefined,
  state,
  source = "manual",
  forceClosed = false,
} = {}) {
  if (!win || !doc || !state) {
    return (state && state.closedHeight) || 0;
  }
  const editing = forceClosed ? false : isEditableFocused(doc);
  const { visual, layout } = measureViewport(win, doc);
  const closedHeight = nextClosedHeight({
    prev: state.closedHeight,
    visualHeight: visual,
    layoutHeight: layout,
    editing,
    source,
  });
  state.closedHeight = closedHeight;
  const height = pickAppViewportHeight({
    visualHeight: visual,
    layoutHeight: layout,
    closedHeight,
    editing,
  });
  applyAppShellHeight(height, doc);
  if (forceClosed || !editing) {
    try {
      if (typeof win.scrollTo === "function") {
        win.scrollTo(0, 0);
      }
    } catch {
      // Ignore.
    }
  }
  return height;
}

async function releaseWebKeyboardViewport({
  win = typeof window !== "undefined" ? window : undefined,
  doc = typeof document !== "undefined" ? document : undefined,
  state,
} = {}) {
  if (typeof document === "undefined" && !doc) return 0;
  const targetWin = win || (typeof window !== "undefined" ? window : undefined);
  const targetDoc = doc || document;
  const box =
    state ||
    (targetWin && targetWin.__mindlinkViewportState) || {
      closedHeight: 0,
    };
  blurActiveEditable(targetDoc);
  const height = syncWebViewportShell({
    win: targetWin,
    doc: targetDoc,
    state: box,
    source: "release",
    forceClosed: true,
  });
  dispatchViewportResize(targetWin);
  if (targetWin) {
    await waitAnimationFrame(targetWin);
    await waitAnimationFrame(targetWin);
  }
  syncWebViewportShell({
    win: targetWin,
    doc: targetDoc,
    state: box,
    source: "release",
    forceClosed: true,
  });
  dispatchViewportResize(targetWin);
  return height;
}

function installWebViewportReset({
  win = typeof window !== "undefined" ? window : undefined,
  doc = typeof document !== "undefined" ? document : undefined,
} = {}) {
  if (!win || !doc) {
    return () => {};
  }
  if (win.__mindlinkWebViewportResetInstalled) {
    return win.__mindlinkWebViewportResetCleanup || (() => {});
  }

  const state = { closedHeight: 0 };
  win.__mindlinkViewportState = state;
  win.__mindlinkWebViewportResetInstalled = true;

  let focusTimer = null;
  const settleTimers = [];

  const apply = (source, extra) => {
    syncWebViewportShell({
      win,
      doc,
      state,
      source,
      ...(extra || {}),
    });
  };

  const applyClosedSoon = () => {
    if (focusTimer) {
      clearTimeout(focusTimer);
    }
    focusTimer = setTimeout(() => {
      focusTimer = null;
      if (!isEditableFocused(doc)) {
        apply("release", { forceClosed: true });
        dispatchViewportResize(win);
      }
    }, 0);
    const later = setTimeout(() => {
      if (!isEditableFocused(doc)) {
        apply("release", { forceClosed: true });
        dispatchViewportResize(win);
      }
    }, KEYBOARD_SETTLE_MS);
    settleTimers.push(later);
  };

  const onVisualResize = () => apply("resize");
  const onOrientation = () => {
    state.closedHeight = 0;
    apply("orientation");
  };
  const onFocusIn = () => apply("focusin");
  const onFocusOut = () => applyClosedSoon();
  const onPageShow = () => applyClosedSoon();

  syncWebViewportShell({
    win,
    doc,
    state,
    source: "init",
  });

  if (win.visualViewport) {
    win.visualViewport.addEventListener("resize", onVisualResize);
    win.visualViewport.addEventListener("scroll", onVisualResize);
  }
  win.addEventListener("resize", onVisualResize);
  win.addEventListener("orientationchange", onOrientation);
  win.addEventListener("pageshow", onPageShow);
  doc.addEventListener("focusin", onFocusIn, true);
  doc.addEventListener("focusout", onFocusOut, true);

  const cleanup = () => {
    if (focusTimer) clearTimeout(focusTimer);
    settleTimers.forEach((id) => clearTimeout(id));
    if (win.visualViewport) {
      win.visualViewport.removeEventListener("resize", onVisualResize);
      win.visualViewport.removeEventListener("scroll", onVisualResize);
    }
    win.removeEventListener("resize", onVisualResize);
    win.removeEventListener("orientationchange", onOrientation);
    win.removeEventListener("pageshow", onPageShow);
    doc.removeEventListener("focusin", onFocusIn, true);
    doc.removeEventListener("focusout", onFocusOut, true);
    win.__mindlinkWebViewportResetInstalled = false;
    win.__mindlinkWebViewportResetCleanup = undefined;
    if (win.__mindlinkViewportState === state) {
      win.__mindlinkViewportState = undefined;
    }
  };

  win.__mindlinkWebViewportResetCleanup = cleanup;
  return cleanup;
}

module.exports = {
  KEYBOARD_HANGOVER_THRESHOLD,
  KEYBOARD_SETTLE_MS,
  applyAppShellHeight,
  blurActiveEditable,
  installWebViewportReset,
  isEditableFocused,
  isEditableTarget,
  nextClosedHeight,
  pickAppViewportHeight,
  readVisualViewportHeight,
  releaseWebKeyboardViewport,
  shouldTreatAsKeyboardHangover,
  syncWebViewportShell,
};
