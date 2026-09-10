"use strict";

const assert = require("assert");
const { colors, radius, fonts, type } = require("../utils/theme");

assert.strictEqual(colors.bg, "#FAFAF9");
assert.strictEqual(colors.surface, "#FFFFFF");
assert.strictEqual(colors.text, "#1C1917");
assert.strictEqual(colors.muted, "#78716C");
assert.strictEqual(colors.border, "#E7E5E4");
assert.strictEqual(colors.accent, "#1D4ED8");
assert.strictEqual(colors.accentSoft, "#EFF6FF");
assert.strictEqual(colors.danger, "#B91C1C");
assert.strictEqual(radius, 8);
assert.ok(fonts.body.startsWith("SpaceGrotesk"));
assert.ok(fonts.title.startsWith("SpaceGrotesk"));
assert.ok(fonts.meta.startsWith("IBMPlexSans"));
assert.ok(fonts.mono.startsWith("IBMPlexMono"));
assert.notStrictEqual(fonts.meta, fonts.mono);
assert.strictEqual(type.title.fontFamily, fonts.title);
assert.strictEqual(type.body.fontFamily, fonts.body);
assert.strictEqual(type.meta.fontFamily, fonts.meta);
assert.strictEqual(type.mono.fontFamily, fonts.mono);
assert.strictEqual(type.title.color, colors.text);
assert.strictEqual(type.body.color, colors.text);
assert.strictEqual(type.meta.color, colors.muted);
assert.strictEqual(type.mono.color, colors.muted);

console.log("theme tokens match DESIGN.md (Plex Sans meta, Mono for IDs only)");
