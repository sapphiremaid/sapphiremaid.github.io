import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

test("app composes recovery feedback only from canonical explicit/collision truth", () => {
  assert.match(source, /import\s+\{\s*createRecoveryFeedbackState,\s*stepRecoveryFeedback\s*\}\s+from\s+"\.\/core\/recovery-feedback\.js"/);
  assert.match(source, /let recoveryFeedbackState = createRecoveryFeedbackState\(\)/);
  assert.match(
    source,
    /stepRecoveryFeedback\(recoveryFeedbackState,\s*\{\s*explicitRecovery:\s*recovering,\s*requiresRecovery:\s*collision\.requiresRecovery === true,\s*reducedMotion:\s*Boolean\(reducedMotionQuery\?\.matches\),\s*\}\)/,
  );
});

test("recovery acknowledgement uses the existing non-modal route status seam", () => {
  assert.match(
    source,
    /recoveryFeedback\.presentation\.announcement[\s\S]*setRouteChoiceStatus\(recoveryFeedback\.presentation\.announcement\)/,
  );
});
