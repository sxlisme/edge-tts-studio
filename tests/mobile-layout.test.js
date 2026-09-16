import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [html, script, styles] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../static/app.js", import.meta.url), "utf8"),
  readFile(new URL("../static/styles.css", import.meta.url), "utf8"),
]);

test("native mobile workspace keeps only the focused synthesis flow", () => {
  assert.match(html, /class="mobile-bottom-nav"[^>]*aria-hidden="true"[^>]*hidden/);
  assert.match(script, /Android\|iPhone\|iPad\|iPod/);
  assert.match(script, /document\.body\.classList\.add\("mobile-app"\)/);

  assert.match(styles, /body\.mobile-app \.input-panel,[\s\S]*?body\.mobile-app \.settings-panel \{[\s\S]*?display: block !important;/);
  assert.match(styles, /body\.mobile-app \.voice-library \{ display: block !important; \}/);
  assert.match(styles, /body\.mobile-app \.voice-summary \{[\s\S]*?display: grid !important;/);
  assert.match(styles, /body\.mobile-app \.mobile-bottom-nav \{ display: none !important; \}/);
});

test("native mobile workspace reserves system safe areas and touch targets", () => {
  assert.match(styles, /--mobile-safe-top: max\(env\(safe-area-inset-top, 0px\), 24px\)/);
  assert.match(styles, /--mobile-safe-bottom: max\(env\(safe-area-inset-bottom, 0px\), 20px\)/);
  assert.match(styles, /body\.mobile-app \.ui-select-trigger \{[\s\S]*?height: 50px;/);
  assert.match(styles, /body\.mobile-app \.button-generate \{ min-height: 48px; height: 48px; \}/);
  assert.match(styles, /body\.mobile-app input\[type="range"\] \{[\s\S]*?height: 32px;/);
});
