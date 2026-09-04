#!/bin/bash
# Every suite, each against a freshly created database.
cd "$(dirname "$0")/.." || exit 1
FAILED=0
run() {
  echo ""
  echo "═══ $1 ═══"
  bash tests-react/run.sh "$1" "$2" || FAILED=1
}
node tests-react/t_gst_parity.cjs || FAILED=1     # no server needed
run tests-react/t_smoke.cjs --virgin
run tests-react/t_e2e.cjs
run tests-react/t_flows.cjs
run tests-react/t_drill.cjs
run tests-react/t_docperiod.cjs
run tests-react/t_letterhead.cjs
run tests-react/t_noexit.cjs
run tests-react/t_print_mobile.cjs
run tests/t_gstguard.cjs
run tests-react/t_security.cjs --virgin
echo ""
echo "═══ offline edition ═══"
node build_local.cjs >/dev/null 2>&1 && node tests-react/t_local.cjs || FAILED=1
echo ""
[ $FAILED -eq 0 ] && echo "ALL SUITES PASSED" || echo "SOME SUITES FAILED"
exit $FAILED
