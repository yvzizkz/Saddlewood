"""Dry run of payments-accounting.py.patch's cutover, against a temp copy.

Never touches the live bot: the state, the log and Joist are stand-ins, and
nothing goes over the network (urlopen is replaced and records what it got).

    cp ~/dev/Saddlewood-KB/bot/accounting.py /tmp/pc/bot/   # then, in /tmp/pc:
    git apply <site>/docs/bot-patches/payments-accounting.py.patch
    python3 -I <site>/docs/bot-patches/check_payments_cutover.py /tmp/pc/bot/accounting.py

The fixture is shaped like the live accounting_state.json on 2026-10-23:
P1-P6 recorded in Joist before the patch (already on Money by hand), P7
pending. Expect: the first push sends nothing and marks P1-P6 'pre-cutover';
a second push marks nothing new; recording P7 sends P7 alone, once.
"""

import importlib.util
import json
import os
import sys
import tempfile
import urllib.request

PRE = [(1, "8009-05", 15000, "2026-07-28"), (2, "8009-06", 75000, "2026-08-05"), (3, "8009-7", 6600, "2026-08-26"),
       (4, "8009-08", 22257.19, "2026-10-06"), (5, "8009-09", 2100, "2026-10-06"), (6, "8009-04", 30000, "2026-07-15")]


def proposal(n, invoice, amount, date, status):
    return {"n": n, "invoice": invoice, "client": "AFT", "amount": amount, "date": date, "status": status,
            "joist_id": f"j{n}", "evidence": "Melio payment", "recorded_at": "2026-10-06T20:11:37" if status == "recorded" else None}


def main(path):
    tmp = tempfile.mkdtemp()
    spec = importlib.util.spec_from_file_location("accounting_under_test", path)
    acc = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(acc)
    acc.STATE = os.path.join(tmp, "accounting_state.json")
    acc.LOG = os.path.join(tmp, "bot-accounting.log")
    with open(acc.STATE, "w") as f:
        json.dump({"proposals": [proposal(*x, "recorded") for x in PRE] + [proposal(7, "8009-10", 25000, "2026-10-15", "pending")]}, f)

    class FakeJoist:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def invoice(self, _id):
            return {"amount_outstanding": 25000}

        def record_payment(self, _id, _amount, _date):
            return {"amount_outstanding": 0}

    acc.Joist = FakeJoist
    sent = []

    class Res:
        def __init__(self, body):
            self.body = body

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return json.dumps({"ok": True, "status": "recorded"}).encode()

    def urlopen(req, timeout=None):
        sent.append(json.loads(req.data))
        return Res(req.data)

    urllib.request.urlopen = urlopen
    os.environ["OPS_AGENT_TOKEN"] = "dry-run"
    os.environ["OPS_SITE_URL"] = "http://dry-run.invalid"
    sys.modules.pop("ops_board", None)

    def state():
        with open(acc.STATE) as f:
            return {p["n"]: p for p in json.load(f)["proposals"]}

    fails = []

    def check(ok, what):
        print(("ok   " if ok else "FAIL ") + what)
        if not ok:
            fails.append(what)

    took = acc.push_app_payments()
    st = state()
    check(took == 0 and sent == [], f"first push sends none of P1-P6 (took {took}, sent {[b['pNumber'] for b in sent]})")
    check(all(st[n]["app"] == {**st[n]["app"], "ok": True, "status": "pre-cutover"} for n, *_ in PRE), "P1-P6 marked app.status 'pre-cutover'")
    check("app" not in st[7], "pending P7 untouched")

    before = json.dumps(state(), sort_keys=True)
    took = acc.push_app_payments()
    check(took == 0 and sent == [] and json.dumps(state(), sort_keys=True) == before, "second push marks nothing new and sends nothing")

    out = acc.record(7, "Lando")
    st = state()
    check(out.startswith("✅"), f"record P7: {out[:60]}")
    check([b["pNumber"] for b in sent] == [7] and sent[0]["amountCents"] == 2_500_000, f"recording P7 sends P7 alone (sent {[b['pNumber'] for b in sent]})")
    check(st[7]["app"].get("ok") is True and st[7]["app"].get("due") is True, "P7 marked sent")

    took = acc.push_app_payments()
    check(took == 0 and len(sent) == 1, "a later push does not send P7 again")
    print("PASS" if not fails else f"FAIL ({len(fails)})")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
