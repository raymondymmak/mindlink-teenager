#!/usr/bin/env node
/**
 * MindLink developer-settings checkpointers (Lumo MIN-6).
 *
 * Static analysis of the demo header (no browser, no Expo server):
 *   node scripts/verify-developer-settings.mjs --structure
 *   node scripts/verify-developer-settings.mjs --actions
 *
 * --structure
 *   Demo header exposes one developer-settings control. Save pack, Load pack,
 *   Reset Demo, and the teen/clinician mode toggle are not four sibling header
 *   buttons; they render under the menu.
 *
 * --actions
 *   Those four actions stay reachable from that menu. Reset still goes through
 *   confirmation before wipe.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const parser = require("@babel/parser");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BUTTONS = new Set([
  "Pressable",
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableNativeFeedback",
  "Button",
]);

const TERMINALS = new Set([
  "savePack",
  "loadPack",
  "confirmReset",
  "resetDemo",
  "setMode",
  "clearOnDeviceRecords",
]);

const ACTION_KINDS = ["mode", "save", "load", "reset"];

function argHas(flag) {
  return process.argv.includes(flag);
}

function usage() {
  console.error(
    "Usage: node scripts/verify-developer-settings.mjs --structure | --actions"
  );
}

function parseProgram(source, filename) {
  return parser.parse(source, {
    sourceType: "module",
    plugins: ["jsx"],
    errorRecovery: false,
  });
}

function childNodes(node) {
  const kids = [];
  if (!node || typeof node !== "object") return kids;
  for (const key of Object.keys(node)) {
    if (
      key === "loc" ||
      key === "start" ||
      key === "end" ||
      key === "range" ||
      key === "leadingComments" ||
      key === "trailingComments" ||
      key === "innerComments"
    ) {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item.type === "string") kids.push(item);
      }
    } else if (value && typeof value.type === "string") {
      kids.push(value);
    }
  }
  return kids;
}

function walk(node, visit) {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return;
  visit(node);
  for (const child of childNodes(node)) walk(child, visit);
}

function isFunctionNode(node) {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "ObjectMethod" ||
    node.type === "ClassMethod"
  );
}

function jsxName(name) {
  if (!name) return "";
  if (name.type === "JSXIdentifier") return name.name;
  if (name.type === "JSXMemberExpression") {
    return `${jsxName(name.object)}.${jsxName(name.property)}`;
  }
  if (name.type === "JSXNamespacedName") {
    return `${name.namespace.name}:${name.name.name}`;
  }
  return "";
}

function attrSource(value, source) {
  if (!value) return "true";
  if (value.type === "StringLiteral") return value.value;
  if (value.type === "JSXExpressionContainer") {
    const expr = value.expression;
    if (!expr || expr.type === "JSXEmptyExpression") return "";
    if (expr.type === "StringLiteral") return expr.value;
    return source.slice(expr.start, expr.end);
  }
  return source.slice(value.start, value.end);
}

function jsxTree(node, source) {
  if (!node) return [];
  switch (node.type) {
    case "JSXElement":
      return [elementFrom(node, source)];
    case "JSXFragment":
      return node.children.flatMap((child) => jsxChildren(child, source));
    case "ParenthesizedExpression":
      return jsxTree(node.expression, source);
    case "ConditionalExpression":
      return [...jsxTree(node.consequent, source), ...jsxTree(node.alternate, source)];
    case "LogicalExpression":
      return [...jsxTree(node.left, source), ...jsxTree(node.right, source)];
    case "SequenceExpression":
      return node.expressions.flatMap((expr) => jsxTree(expr, source));
    default:
      return [];
  }
}

function jsxChildren(child, source) {
  if (!child) return [];
  if (child.type === "JSXText" || child.type === "JSXEmptyExpression") return [];
  if (child.type === "JSXElement") return [elementFrom(child, source)];
  if (child.type === "JSXFragment") {
    return child.children.flatMap((item) => jsxChildren(item, source));
  }
  if (child.type === "JSXExpressionContainer") {
    if (!child.expression || child.expression.type === "JSXEmptyExpression") return [];
    return jsxTree(child.expression, source);
  }
  return [];
}

function elementFrom(node, source) {
  const name = jsxName(node.openingElement.name);
  const attrs = {};
  let onPress = "";
  for (const attr of node.openingElement.attributes) {
    if (attr.type !== "JSXAttribute") continue;
    const key = jsxName(attr.name);
    const value = attrSource(attr.value, source);
    attrs[key] = value;
    if (key === "onPress") onPress = value;
  }
  const texts = [];
  const children = [];
  for (const child of node.children) {
    if (child.type === "JSXText") {
      const text = child.value.replace(/\s+/g, " ").trim();
      if (text) texts.push(text);
      continue;
    }
    if (
      child.type === "JSXExpressionContainer" &&
      child.expression &&
      child.expression.type !== "JSXEmptyExpression"
    ) {
      texts.push(source.slice(child.expression.start, child.expression.end).trim());
    }
    children.push(...jsxChildren(child, source));
  }
  return { name, attrs, texts, onPress, children };
}

function collectReturns(body, source) {
  const found = [];
  function rec(node) {
    if (!node || typeof node !== "object" || typeof node.type !== "string") return;
    if (node.type === "ReturnStatement") {
      if (node.argument) found.push(...jsxTree(node.argument, source));
      return;
    }
    for (const child of childNodes(node)) {
      if (isFunctionNode(child)) continue;
      rec(child);
    }
  }
  rec(body);
  return found;
}

function unwrapCallback(node) {
  if (!node) return null;
  if (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    (node.callee.name === "useCallback" || node.callee.name === "useMemo")
  ) {
    return node.arguments[0] || null;
  }
  return node;
}

function componentTree(fn, source) {
  if (!fn) return [];
  if (fn.body?.type === "BlockStatement") return collectReturns(fn.body, source);
  return jsxTree(fn.body, source);
}

function collectComponents(ast, source) {
  const map = new Map();
  walk(ast, (node) => {
    if (node.type === "FunctionDeclaration" && node.id && /^[A-Z]/.test(node.id.name)) {
      map.set(node.id.name, componentTree(node, source));
    }
    if (
      node.type === "VariableDeclarator" &&
      node.id?.type === "Identifier" &&
      /^[A-Z]/.test(node.id.name)
    ) {
      const fn = unwrapCallback(node.init);
      if (
        fn &&
        (fn.type === "ArrowFunctionExpression" || fn.type === "FunctionExpression")
      ) {
        map.set(node.id.name, componentTree(fn, source));
      }
    }
  });
  return map;
}

function defaultExportName(ast) {
  let name = null;
  walk(ast, (node) => {
    if (node.type !== "ExportDefaultDeclaration") return;
    const decl = node.declaration;
    if (decl.type === "FunctionDeclaration" && decl.id) name = decl.id.name;
    if (decl.type === "Identifier") name = decl.name;
  });
  return name;
}

function expand(elements, components, depth) {
  if (depth > 8) return elements;
  const out = [];
  for (const el of elements) {
    if (components.has(el.name)) {
      out.push(...expand(components.get(el.name), components, depth + 1));
      continue;
    }
    out.push({
      name: el.name,
      attrs: el.attrs,
      texts: el.texts,
      onPress: el.onPress,
      children: expand(el.children, components, depth + 1),
    });
  }
  return out;
}

function walkTree(elements, ancestors, visit) {
  for (const el of elements) {
    visit(el, ancestors);
    walkTree(el.children, ancestors.concat(el), visit);
  }
}

function isMenuElement(el) {
  if (!el) return false;
  if (el.name === "Modal") return true;
  if (String(el.attrs?.accessibilityRole || "") === "menu") return true;
  if (el.attrs?.testID === "developer-settings-menu") return true;
  return false;
}

function labelBlob(el) {
  const parts = [];
  if (el.texts?.length) parts.push(el.texts.join(" "));
  for (const key of ["accessibilityLabel", "accessibilityHint", "title"]) {
    if (el.attrs?.[key]) parts.push(String(el.attrs[key]));
  }
  for (const child of el.children || []) parts.push(labelBlob(child));
  return parts.join(" ");
}

function actionKinds(el) {
  if (el.attrs?.testID === "developer-settings") return new Set();
  const blob = labelBlob(el);
  const testID = el.attrs?.testID || "";
  const kinds = new Set();
  if (testID === "save-demo-pack" || /\bSave pack\b/.test(blob)) kinds.add("save");
  if (testID === "load-demo-pack" || /\bLoad pack\b/.test(blob)) kinds.add("load");
  if (testID === "reset-demo" || /\bReset Demo\b/.test(blob)) kinds.add("reset");
  if (
    testID === "developer-settings-mode" ||
    /\btoggleLabel\b/.test(blob) ||
    /Show clinician/.test(blob) ||
    /Show teen/.test(blob) ||
    /modeToggleLabel/.test(blob)
  ) {
    kinds.add("mode");
  }
  return kinds;
}

function headerModel(programs) {
  const components = new Map();
  let headerName = null;
  const sources = [];
  for (const program of programs) {
    sources.push(program.source);
    const local = collectComponents(program.ast, program.source);
    for (const [name, tree] of local) {
      components.set(name, tree);
    }
    headerName = defaultExportName(program.ast) || headerName;
  }
  if (!headerName || !components.has(headerName)) {
    for (const name of components.keys()) {
      if (name === "DemoHeaderActions") headerName = name;
    }
  }
  if (!headerName || !components.has(headerName)) {
    return { error: "Demo header component was not found", buttons: [], source: sources.join("\n") };
  }
  const expanded = expand(components.get(headerName), components, 0);
  const buttons = [];
  const testIds = [];
  walkTree(expanded, [], (el, ancestors) => {
    if (el.attrs?.testID) testIds.push(el.attrs.testID);
    if (!BUTTONS.has(el.name)) return;
    buttons.push({
      el,
      menu: ancestors.some(isMenuElement),
      kinds: actionKinds(el),
    });
  });
  return {
    buttons,
    testIds,
    source: sources.join("\n"),
  };
}

function analyzeStructure(programs) {
  const errors = [];
  const model = headerModel(programs);
  if (model.error) errors.push(model.error);
  const headerButtons = (model.buttons || []).filter((button) => !button.menu);
  const menuButtons = (model.buttons || []).filter((button) => button.menu);
  const entryIds = (model.testIds || []).filter((id) => id === "developer-settings");

  if (entryIds.length !== 1) {
    errors.push(
      `Expected a single testID="developer-settings" entry point, found ${entryIds.length}`
    );
  }
  if (headerButtons.length !== 1) {
    errors.push(
      `Expected one header control, found ${headerButtons.length} sibling header button(s)`
    );
  } else {
    const only = headerButtons[0];
    if (only.el.attrs?.testID !== "developer-settings") {
      errors.push("The header control is missing testID developer-settings");
    }
    if (!/Developer settings/.test(labelBlob(only.el))) {
      errors.push('The header control is not labeled "Developer settings"');
    }
    if (only.kinds.size > 0) {
      errors.push(
        `Header control still exposes demo actions directly: ${[...only.kinds].join(", ")}`
      );
    }
  }

  const headerKinds = new Set();
  for (const button of headerButtons) {
    for (const kind of button.kinds) headerKinds.add(kind);
  }
  if (headerKinds.size > 0) {
    errors.push(
      `Mode, Save pack, Load pack, or Reset Demo still render as header buttons (${[...headerKinds].join(", ")})`
    );
  }

  for (const kind of ACTION_KINDS) {
    const matches = menuButtons.filter((button) => button.kinds.has(kind));
    if (matches.length < 1) {
      errors.push(`"${kind}" is not under the developer settings menu`);
    }
  }

  const siblingHeaderActions = headerButtons.filter((button) => button.kinds.size > 0);
  if (siblingHeaderActions.length >= 4) {
    errors.push("Save pack, Load pack, Reset Demo, and the mode toggle are four sibling header buttons");
  }

  return { ok: errors.length === 0, errors };
}

function stripComments(code) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];
    if (quote) {
      out += c;
      if (c === "\\" && i + 1 < code.length) {
        out += code[i + 1];
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < code.length && code[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) i += 1;
      i += 2;
      out += " ";
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function blankStrings(code) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < code.length) {
    const c = code[i];
    if (quote) {
      if (c === "\\" && i + 1 < code.length) {
        out += "  ";
        i += 2;
        continue;
      }
      if (c === quote) {
        quote = null;
        out += c;
      } else {
        out += c === "\n" ? "\n" : " ";
      }
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function identifiers(code) {
  const cleaned = blankStrings(stripComments(String(code || "")));
  const names = new Set();
  for (const match of cleaned.matchAll(/\b[A-Za-z_$][\w$]*\b/g)) names.add(match[0]);
  return names;
}

function lookupBindings(programs, name) {
  const bodies = [];
  for (const program of programs) {
    walk(program.ast, (node) => {
      if (
        node.type === "VariableDeclarator" &&
        node.id?.type === "Identifier" &&
        node.id.name === name &&
        node.init
      ) {
        bodies.push(program.source.slice(node.init.start, node.init.end));
      }
      if (node.type === "FunctionDeclaration" && node.id?.name === name && node.body) {
        bodies.push(program.source.slice(node.body.start, node.body.end));
      }
      if (
        node.type === "JSXAttribute" &&
        jsxName(node.name) === name &&
        node.value?.type === "JSXExpressionContainer" &&
        node.value.expression
      ) {
        bodies.push(
          program.source.slice(node.value.expression.start, node.value.expression.end)
        );
      }
    });
  }
  return bodies;
}

function referencedActions(expr, programs, depth = 0, seen = new Set()) {
  const found = new Set();
  if (!expr || depth > 8) return found;
  for (const name of identifiers(expr)) {
    if (TERMINALS.has(name)) found.add(name);
    if (seen.has(name)) continue;
    seen.add(name);
    if (TERMINALS.has(name)) continue;
    for (const body of lookupBindings(programs, name)) {
      for (const hit of referencedActions(body, programs, depth + 1, seen)) {
        found.add(hit);
      }
    }
  }
  return found;
}

function confirmResetBodies(programs) {
  const bodies = [];
  for (const program of programs) {
    walk(program.ast, (node) => {
      let fn = null;
      if (node.type === "FunctionDeclaration" && node.id?.name === "confirmReset") fn = node;
      if (node.type === "VariableDeclarator" && node.id?.name === "confirmReset") {
        fn = unwrapCallback(node.init);
      }
      if (
        fn &&
        (fn.type === "ArrowFunctionExpression" ||
          fn.type === "FunctionExpression" ||
          fn.type === "FunctionDeclaration") &&
        fn.body
      ) {
        bodies.push(program.source.slice(fn.body.start, fn.body.end));
      }
    });
  }
  return bodies;
}

function confirmationGatesReset(body) {
  const stripped = stripComments(body);
  const confirmAt = ["window.confirm", "Alert.alert"].reduce((found, token) => {
    const index = stripped.indexOf(token);
    if (index < 0) return found;
    return found < 0 ? index : Math.min(found, index);
  }, -1);
  if (confirmAt < 0) return false;
  const calls = [...stripped.matchAll(/\bresetDemo\s*\(/g)];
  if (calls.length < 1) return false;
  if (!calls.every((match) => match.index > confirmAt)) return false;
  if (!/window\.confirm|\bCancel\b/.test(stripped)) return false;
  return true;
}

function menuButton(model, kind) {
  return (model.buttons || []).find((button) => button.menu && button.kinds.has(kind));
}

function analyzeActions(programs) {
  const errors = [];
  const structure = analyzeStructure(programs);
  if (!structure.ok) errors.push(...structure.errors.map((error) => `structure: ${error}`));

  const model = headerModel(programs);
  const source = model.source || "";
  if (!/modeToggleLabel\s*\(/.test(stripComments(source))) {
    errors.push("Mode toggle label no longer comes from modeToggleLabel (Show clinician / Show teen)");
  }

  const expectations = [
    { kind: "mode", label: "mode toggle", needs: ["setMode"] },
    { kind: "save", label: "Save pack", needs: ["savePack"], testID: "save-demo-pack", text: "Save pack" },
    { kind: "load", label: "Load pack", needs: ["loadPack"], testID: "load-demo-pack", text: "Load pack" },
    {
      kind: "reset",
      label: "Reset Demo",
      needs: ["confirmReset"],
      testID: "reset-demo",
      text: "Reset Demo",
    },
  ];

  for (const expectation of expectations) {
    const button = menuButton(model, expectation.kind);
    if (!button) {
      errors.push(`${expectation.label} is not a menu item`);
      continue;
    }
    if (expectation.testID && button.el.attrs?.testID !== expectation.testID) {
      errors.push(`${expectation.label} menu item is missing testID ${expectation.testID}`);
    }
    if (expectation.text && !labelBlob(button.el).includes(expectation.text)) {
      errors.push(`${expectation.label} menu item does not show "${expectation.text}"`);
    }
    const reached = referencedActions(button.el.onPress || "", programs);
    for (const name of expectation.needs) {
      if (!reached.has(name)) {
        errors.push(`${expectation.label} menu item does not reach ${name}`);
      }
    }
    if (expectation.kind === "reset" && reached.has("resetDemo") && !reached.has("confirmReset")) {
      errors.push("Reset Demo calls resetDemo without confirmation");
    }
  }

  const bodies = confirmResetBodies(programs);
  if (bodies.length < 1) {
    errors.push("confirmReset is missing");
  }
  for (const body of bodies) {
    if (!confirmationGatesReset(body)) {
      errors.push("confirmReset wipes the demo without a confirmation step");
    }
  }

  return { ok: errors.length === 0, errors };
}

function programFrom(source, filename = "fixture.js") {
  return { filename, source, ast: parseProgram(source, filename) };
}

function loadHeaderPrograms() {
  const dir = path.join(root, "components");
  const programs = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".js")) continue;
    const full = path.join(dir, file);
    const source = fs.readFileSync(full, "utf8");
    const related =
      source.includes("function DemoHeaderActions") ||
      source.includes("function DeveloperSettingsMenu") ||
      source.includes('testID="developer-settings"') ||
      source.includes("testID='developer-settings'");
    if (!related) continue;
    programs.push(programFrom(source, full));
  }
  return programs;
}

function loadActionPrograms() {
  const programs = loadHeaderPrograms();
  const hook = path.join(root, "components", "useDemoPackActions.js");
  const source = fs.readFileSync(hook, "utf8");
  programs.push(programFrom(source, hook));
  return programs;
}

const BAD_HEADER = `
export default function DemoHeaderActions() {
  const toggleLabel = modeToggleLabel(mode);
  return (
    <View>
      <TouchableOpacity onPress={toggleMode}><Text>{toggleLabel}</Text></TouchableOpacity>
      <TouchableOpacity testID="save-demo-pack" onPress={savePack}><Text>Save pack</Text></TouchableOpacity>
      <TouchableOpacity testID="load-demo-pack" onPress={loadPack}><Text>Load pack</Text></TouchableOpacity>
      <TouchableOpacity testID="reset-demo" onPress={confirmReset}><Text>Reset Demo</Text></TouchableOpacity>
    </View>
  );
}
`;

const GOOD_HEADER = `
function DeveloperSettingsMenu({ toggleLabel, onToggleMode, onSave, onLoad, onReset }) {
  return (
    <Modal visible transparent>
      <View accessibilityRole="menu" testID="developer-settings-menu">
        <Pressable onPress={onToggleMode} testID="developer-settings-mode" accessibilityLabel={toggleLabel}>
          <Text>{toggleLabel}</Text>
        </Pressable>
        <Pressable onPress={onSave} testID="save-demo-pack" accessibilityLabel="Save pack">
          <Text>Save pack</Text>
        </Pressable>
        <Pressable onPress={onLoad} testID="load-demo-pack" accessibilityLabel="Load pack">
          <Text>Load pack</Text>
        </Pressable>
        <Pressable onPress={onReset} testID="reset-demo" accessibilityLabel="Reset Demo">
          <Text>Reset Demo</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

export default function DemoHeaderActions() {
  const toggleLabel = modeToggleLabel(mode);
  const toggleMode = () => {
    setMode(mode === "clinician" ? "teen" : "clinician");
  };
  const closeThen = (action) => () => {
    action();
  };
  return (
    <View>
      <Pressable testID="developer-settings" accessibilityLabel="Developer settings">
        <Text>Developer settings</Text>
      </Pressable>
      {open ? (
        <DeveloperSettingsMenu
          toggleLabel={toggleLabel}
          onToggleMode={closeThen(toggleMode)}
          onSave={closeThen(savePack)}
          onLoad={closeThen(loadPack)}
          onReset={closeThen(confirmReset)}
        />
      ) : null}
    </View>
  );
}
`;

const GOOD_HOOK = `
export function useDemoPackActions() {
  const resetDemo = async () => {};
  const confirmReset = () => {
    if (typeof window !== "undefined") {
      if (window.confirm("Reset the demo?")) resetDemo();
      return;
    }
    Alert.alert("Reset the demo?", "wipe", [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: () => resetDemo() },
    ]);
  };
}
`;

const UNCONFIRMED_HOOK = `
export function useDemoPackActions() {
  const resetDemo = async () => {};
  const confirmReset = () => {
    resetDemo();
  };
}
`;

function assertSelfTests() {
  const badStructure = analyzeStructure([programFrom(BAD_HEADER)]);
  if (badStructure.ok) {
    throw new Error("structure detector accepted four sibling header buttons");
  }
  const goodStructure = analyzeStructure([programFrom(GOOD_HEADER)]);
  if (!goodStructure.ok) {
    throw new Error(`structure detector rejected a valid menu: ${goodStructure.errors.join("; ")}`);
  }
  const goodActions = analyzeActions([programFrom(GOOD_HEADER), programFrom(GOOD_HOOK)]);
  if (!goodActions.ok) {
    throw new Error(`actions detector rejected a valid menu: ${goodActions.errors.join("; ")}`);
  }
  const directReset = GOOD_HEADER.replace(
    "onReset={closeThen(confirmReset)}",
    "onReset={closeThen(resetDemo)}"
  );
  const skipped = analyzeActions([programFrom(directReset), programFrom(GOOD_HOOK)]);
  if (skipped.ok) {
    throw new Error("actions detector accepted Reset Demo without confirmReset");
  }
  const unconfirmed = analyzeActions([programFrom(GOOD_HEADER), programFrom(UNCONFIRMED_HOOK)]);
  if (unconfirmed.ok) {
    throw new Error("actions detector accepted confirmReset that wipes without asking");
  }
}

function report(label, result) {
  if (!result.ok) {
    for (const error of result.errors) console.error(`${label}: ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${label}: ok`);
}

function main() {
  const structure = argHas("--structure");
  const actions = argHas("--actions");
  if (!structure && !actions) {
    usage();
    process.exit(1);
  }
  assertSelfTests();
  if (structure) report("developer-settings structure", analyzeStructure(loadHeaderPrograms()));
  if (actions) report("developer-settings actions", analyzeActions(loadActionPrograms()));
  if (process.exitCode) process.exit(process.exitCode);
}

main();
