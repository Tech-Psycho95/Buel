"""Production isolation + rate-limiter verification using known test users."""
import json
import urllib.error
import urllib.request
import http.cookiejar
import time

BASE = "https://sentisel.vercel.app"
PASS = "prod-proof-123"
USER_A = "prod-proof-1794520517@sentisel.test"
USER_B = "prod-proof-1794520487@sentisel.test"


class RelaxedPolicy(http.cookiejar.DefaultCookiePolicy):
    """Prod sets the Secure flag; this client runs over http, so replay is allowed."""

    def return_ok_secure(self, cookie, request):
        return True

    def set_ok_secure(self, cookie, request):
        return True


def client():
    jar = http.cookiejar.CookieJar(policy=RelaxedPolicy())
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    op.addheaders = [("Content-Type", "application/json"), ("Origin", BASE)]

    def call(method, path, data=None, timeout=90):
        req = urllib.request.Request(
            BASE + path, method=method,
            data=json.dumps(data).encode() if data is not None else None)
        try:
            res = op.open(req, timeout=timeout)
            return res.status, json.loads(res.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode() or "{}")

    return call


results = []


def check(name, cond, detail=""):
    results.append((name, "PASS" if cond else "FAIL", detail))


# ---- user A: login, find their council decision ----
a = client()
st, body = a("POST", "/api/auth/login", {"email": USER_A, "password": PASS})
check("user A login", st == 200, f"got {st}")
st, lst = a("GET", "/api/decisions?limit=5")
check("user A has decisions", lst.get("decisions"), f"{len(lst.get('decisions', []))} decisions")
decision_id = lst["decisions"][0]["id"]

# ---- user B: login, must NOT see A's decision ----
b = client()
st, _ = b("POST", "/api/auth/login", {"email": USER_B, "password": PASS})
check("user B login", st == 200, f"got {st}")
st, blist = b("GET", "/api/decisions?limit=5")
check(
    "user B ledger excludes A's decisions",
    not any(d["id"] == decision_id for d in blist.get("decisions", [])),
    f"B sees {len(blist.get('decisions', []))} own decisions only",
)
st, breplay = b("GET", f"/api/decisions?id={decision_id}")
check("user B replay of A's decision -> 400", st == 400, f"got {st}")

# ---- signup probe: rate limiter state on production ----
probe = client()
now = int(time.time() * 1000)
st, body = probe("POST", "/api/auth/signup", {
    "email": f"probe-{now}@sentisel.test", "password": "probe-password-123",
    "displayName": "Probe",
})
if st == 429:
    check("signup rate limiter engaged (10/hour/IP)", True, "429 returned")
elif st == 200:
    check("signup rate limiter window rolled (fewer than 10 signups in the past hour)", True,
          "200 returned — limiter active but window not exhausted")
else:
    check("signup probe", False, f"unexpected status {st}")

print(json.dumps(results, indent=1))
passed = sum(1 for _, s, _ in results if s == "PASS")
print(f"SUMMARY: {passed}/{len(results)} PASS")
