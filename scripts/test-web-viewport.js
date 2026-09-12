"use strict";

const assert = require("assert");
const {
  KEYBOARD_HANGOVER_THRESHOLD,
  applyAppShellHeight,
  blurActiveEditable,
  isEditableFocused,
  isEditableTarget,
  nextClosedHeight,
  pickAppViewportHeight,
  readVisualViewportHeight,
  shouldTreatAsKeyboardHangover,
  syncWebViewportShell,
  installWebViewportReset,
} = require("../utils/webViewport");

function testEditableDetection() {
  assert.strictEqual(isEditableTarget(null), false);
  assert.strictEqual(isEditableTarget({ tagName: "DIV" }), false);
  assert.strictEqual(isEditableTarget({ tagName: "INPUT", type: "text" }), true);
  assert.strictEqual(isEditableTarget({ tagName: "INPUT", type: "button" }), false);
  assert.strictEqual(isEditableTarget({ tagName: "TEXTAREA" }), true);
  assert.strictEqual(isEditableTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.strictEqual(
    isEditableFocused({ activeElement: { tagName: "INPUT", type: "text" } }),
    true
  );
  assert.strictEqual(
    isEditableFocused({ activeElement: { tagName: "BUTTON" } }),
    false
  );
}

function testReadVisualViewportHeight() {
  assert.strictEqual(readVisualViewportHeight({ height: 512.4 }, 800), 512);
  assert.strictEqual(readVisualViewportHeight(null, 800), 800);
  assert.strictEqual(readVisualViewportHeight(undefined, 0), 0);
}

function testHangoverDetection() {
  assert.strictEqual(
    shouldTreatAsKeyboardHangover({
      visualHeight: 500,
      closedHeight: 844,
      editing: false,
    }),
    true
  );
  assert.strictEqual(
    shouldTreatAsKeyboardHangover({
      visualHeight: 500,
      closedHeight: 844,
      editing: true,
    }),
    false
  );
  assert.strictEqual(
    shouldTreatAsKeyboardHangover({
      visualHeight: 830,
      closedHeight: 844,
      editing: false,
    }),
    false
  );
  assert.ok(KEYBOARD_HANGOVER_THRESHOLD >= 50);
}

function testClosedHeightMemory() {
  assert.strictEqual(
    nextClosedHeight({
      prev: 844,
      visualHeight: 500,
      layoutHeight: 500,
      editing: true,
      source: "resize",
    }),
    844
  );

  assert.strictEqual(
    nextClosedHeight({
      prev: 844,
      visualHeight: 720,
      layoutHeight: 720,
      editing: false,
      source: "resize",
    }),
    720
  );

  assert.strictEqual(
    nextClosedHeight({
      prev: 844,
      visualHeight: 500,
      layoutHeight: 500,
      editing: false,
      source: "release",
    }),
    844
  );

  assert.strictEqual(
    nextClosedHeight({
      prev: 0,
      visualHeight: 844,
      layoutHeight: 844,
      editing: false,
      source: "init",
    }),
    844
  );
}

function testPickAppViewportHeight() {
  assert.strictEqual(
    pickAppViewportHeight({
      visualHeight: 500,
      layoutHeight: 844,
      closedHeight: 844,
      editing: true,
    }),
    500
  );
  assert.strictEqual(
    pickAppViewportHeight({
      visualHeight: 500,
      layoutHeight: 500,
      closedHeight: 844,
      editing: false,
    }),
    844
  );
  assert.strictEqual(
    pickAppViewportHeight({
      visualHeight: 844,
      layoutHeight: 844,
      closedHeight: 844,
      editing: false,
    }),
    844
  );
}

function makeDoc({ focused, clientHeight = 844 } = {}) {
  const styles = {};
  const node = (id) => ({
    id,
    style: {
      height: "",
      minHeight: "",
      maxHeight: "",
      setProperty(key, value) {
        styles[key] = value;
      },
    },
  });
  const root = node("html");
  const body = node("body");
  const app = node("root");
  return {
    documentElement: Object.assign(root, { clientHeight }),
    body,
    getElementById(id) {
      return id === "root" ? app : null;
    },
    activeElement: focused || body,
    styles,
    app,
  };
}

function testApplyAppShellHeight() {
  const doc = makeDoc();
  const applied = applyAppShellHeight(844, doc);
  assert.strictEqual(applied, 844);
  assert.strictEqual(doc.documentElement.style.height, "844px");
  assert.strictEqual(doc.body.style.minHeight, "844px");
  assert.strictEqual(doc.app.style.maxHeight, "844px");
  assert.strictEqual(doc.styles["--app-height"], "844px");
}

function testBlurActiveEditable() {
  const input = { tagName: "INPUT", type: "text", blurCalls: 0, blur() { this.blurCalls += 1; } };
  const doc = makeDoc({ focused: input });
  assert.strictEqual(blurActiveEditable(doc), true);
  assert.strictEqual(input.blurCalls, 1);
  const idle = makeDoc();
  assert.strictEqual(blurActiveEditable(idle), false);
}

function testSyncRestoresClosedHeightAfterHangover() {
  const input = { tagName: "INPUT", type: "text", blur() {} };
  const doc = makeDoc({ focused: input, clientHeight: 500 });
  const win = {
    innerHeight: 500,
    visualViewport: { height: 500 },
    scrollToCalls: 0,
    scrollTo() {
      this.scrollToCalls += 1;
    },
  };
  const state = { closedHeight: 844 };

  const openHeight = syncWebViewportShell({
    win,
    doc,
    state,
    source: "resize",
    forceClosed: false,
  });
  assert.strictEqual(openHeight, 500, "focused input still uses visual viewport");
  assert.strictEqual(state.closedHeight, 844, "closed height is remembered while editing");

  const restored = syncWebViewportShell({
    win,
    doc,
    state,
    source: "release",
    forceClosed: true,
  });
  assert.strictEqual(restored, 844, "navigate/blur reapplies the closed height");
  assert.strictEqual(doc.app.style.height, "844px");
  assert.ok(win.scrollToCalls > 0);
}

function testInstallAppliesClosedHeightOnFocusOut() {
  return new Promise((resolve, reject) => {
    const listeners = {};
    const input = { tagName: "INPUT", type: "text", blur() {} };
    const doc = makeDoc({ focused: input, clientHeight: 844 });
    doc.addEventListener = (type, handler) => {
      listeners[type] = handler;
    };
    doc.removeEventListener = () => {};
    const win = {
      innerHeight: 844,
      visualViewport: {
        height: 844,
        addEventListener(type, handler) {
          listeners[`vv:${type}`] = handler;
        },
        removeEventListener() {},
        dispatchEvent() {},
      },
      addEventListener(type, handler) {
        listeners[type] = handler;
      },
      removeEventListener() {},
      dispatchEvent() {},
      scrollTo() {},
    };

    const cleanup = installWebViewportReset({ win, doc });
    try {
      assert.strictEqual(doc.app.style.height, "844px");

      win.visualViewport.height = 500;
      doc.documentElement.clientHeight = 500;
      win.innerHeight = 500;
      listeners["vv:resize"]();
      assert.strictEqual(doc.app.style.height, "500px", "keyboard-open height while focused");

      doc.activeElement = doc.body;
      listeners.focusout();
    } catch (error) {
      cleanup();
      reject(error);
      return;
    }

    setTimeout(() => {
      try {
        assert.strictEqual(
          doc.app.style.height,
          "844px",
          "focusout restores remembered closed height"
        );
        cleanup();
        resolve();
      } catch (error) {
        cleanup();
        reject(error);
      }
    }, 20);
  });
}

async function main() {
  testEditableDetection();
  testReadVisualViewportHeight();
  testHangoverDetection();
  testClosedHeightMemory();
  testPickAppViewportHeight();
  testApplyAppShellHeight();
  testBlurActiveEditable();
  testSyncRestoresClosedHeightAfterHangover();
  await testInstallAppliesClosedHeightOnFocusOut();
  console.log("web viewport keyboard-hangover helpers passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
