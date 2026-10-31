// dryrun.selftest.mjs — runs under plain `node`, no deps. Exits non-zero on failure.
// Pinned by tests/test_dryrun_saurabh.py inside TEST_CMD (loud skip when node absent).
import { clamp } from './dryrun.js';

let failed = 0;
function check(label, got, want) {
  if (!Object.is(got, want)) {
    console.error(`FAIL ${label}: got ${got}, want ${want}`);
    failed += 1;
  }
}

check('in-range', clamp(5, 0, 10), 5);
check('below-lo', clamp(-3, 0, 10), 0);
check('above-hi', clamp(99, 0, 10), 10);
check('on-lo', clamp(0, 0, 10), 0);
check('on-hi', clamp(10, 0, 10), 10);
check('NaN->lo', clamp(NaN, 2, 8), 2);
check('non-number->lo', clamp('7', 2, 8), 2);
check('Infinity->lo', clamp(Infinity, 2, 8), 2);

if (failed) {
  console.error(`dryrun selftest: ${failed} failure(s)`);
  process.exit(1);
}
console.log('dryrun selftest: all clamp() cases passed');
