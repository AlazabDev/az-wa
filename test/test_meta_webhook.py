# -*- coding: utf-8 -*-
"""
اختبار الربط مع ميتا (WhatsApp Cloud API Webhook).

يغطي:
  1) تحقق ميتا (GET + hub.challenge) برمز صحيح ← يجب أن يُعاد التحدي كما هو.
  2) رفض رمز التحقق الخاطئ (403).
  3) استقبال رسالة نصية واردة (POST) ونجاح المعالجة.
  4) استقبال تحديث حالة تسليم (delivered / read) ونجاح المعالجة.
  5) تجاهل أحداث أرقام غير مسجلة في التطبيق.

الاستخدام:
  WHATSAPP_WEBHOOK_VERIFY_TOKEN=... TEST_PHONE_NUMBER_ID=... \
  SUPABASE_FUNCTION_URL=https://vlahgxkfpzappxtiwhvd.supabase.co/functions/v1 \
  python3 tests/test_meta_webhook.py

كما يمكن التحقق من القاعدة بعد الاختبار (اختياري) بتمرير
  SUPABASE_DB_CHECK=1 SUPABASE_SERVICE_KEY=...
"""
import json
import os
import sys
import urllib.request
import urllib.error

BASE = os.environ.get("SUPABASE_FUNCTION_URL", "https://vlahgxkfpzappxtiwhvd.supabase.co/functions/v1")
WEBHOOK_URL = f"{BASE.rstrip('/')}/whatsapp-webhook"
VERIFY_TOKEN = os.environ.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "")
PHONE_NUMBER_ID = os.environ.get("TEST_PHONE_NUMBER_ID", "100609346426000")
SENDER = os.environ.get("TEST_SENDER_PHONE", "201000000000")

results = []


def req(method: str, url: str, body: dict | None = None, query: str = ""):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url + query, data=data, method=method)
    if data:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def check(name: str, ok: bool, detail: str = ""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  — {detail}" if detail else ""))


# 1) تحقق ميتا برمز صحيح
status, text = req("GET", WEBHOOK_URL, query=f"?hub.mode=subscribe&hub.verify_token={VERIFY_TOKEN}&hub.challenge=CHALLENGE_123")
check("GET verification echoes challenge", status == 200 and text.strip() == "CHALLENGE_123", f"status={status} body={text[:80]!r}")

# 2) رمز خاطئ
status, text = req("GET", WEBHOOK_URL, query="?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=X")
check("GET rejects wrong verify token", status == 403, f"status={status}")

# 3) رسالة نصية واردة
inbound = {
    "object": "whatsapp_business_account",
    "entry": [{
        "id": "WABA_ID",
        "changes": [{
            "field": "messages",
            "value": {
                "metadata": {"phone_number_id": PHONE_NUMBER_ID, "display_phone_number": "15550000000"},
                "contacts": [{"wa_id": SENDER, "profile": {"name": "اختبار ميتا"}}],
                "messages": [{"from": SENDER, "id": f"wamid.TEST_IN_{os.urandom(4).hex()}", "type": "text",
                              "text": {"body": "رسالة اختبار من سكربت الاختبار"}}],
            },
        }],
    }],
}
status, text = req("POST", WEBHOOK_URL, body=inbound)
check("POST inbound text accepted", status == 200 and json.loads(text).get("received") is True, f"status={status} body={text[:80]!r}")

# 3-ب) رسالة واردة من رقم غير مسجل ← يجب أن تُقبل دون أخطاء (يتم تجاهلها داخليا)
unregistered = {
    "object": "whatsapp_business_account",
    "entry": [{"changes": [{"field": "messages", "value": {
        "metadata": {"phone_number_id": "000000000000000"},
        "contacts": [{"wa_id": "201111111111", "profile": {"name": "غير مسجل"}}],
        "messages": [{"from": "201111111111", "id": "wamid.TEST_UNK", "type": "text", "text": {"body": "x"}}],
    }}]}],
}
status, text = req("POST", WEBHOOK_URL, body=unregistered)
check("POST unknown number ignored gracefully", status == 200, f"status={status}")

# 4) تحديث حالة
status_event = {
    "object": "whatsapp_business_account",
    "entry": [{"changes": [{"field": "messages", "value": {
        "metadata": {"phone_number_id": PHONE_NUMBER_ID},
        "statuses": [{"id": "wamid.TEST_OUT_STATUS", "status": "delivered", "recipient_id": SENDER}],
    }}]}],
}
status, text = req("POST", WEBHOOK_URL, body=status_event)
check("POST delivery status accepted", status == 200, f"status={status}")

# 5) تحقق قاعدة البيانات (اختياري) — يعرض آخر صف تم إنشاؤه عبر واجهة REST
if os.environ.get("SUPABASE_DB_CHECK") == "1" and os.environ.get("SUPABASE_PROJECT_URL"):
    import urllib.parse
    rest = os.environ["SUPABASE_PROJECT_URL"].rstrip("/") + "/rest/v1/messages"
    q = "?select=id,direction,content,status&order=created_at.desc&limit=1"
    r = urllib.request.Request(rest + q)
    r.add_header("apikey", os.environ["SUPABASE_SERVICE_KEY"])
    r.add_header("Authorization", "Bearer " + os.environ["SUPABASE_SERVICE_KEY"])
    with urllib.request.urlopen(r, timeout=30) as resp:
        rows = json.loads(resp.read())
    check("DB has newest inbound message", bool(rows) and rows[0]["direction"] == "inbound", json.dumps(rows[:1], ensure_ascii=False)[:200])
else:
    print("SKIP DB check (set SUPABASE_DB_CHECK=1 with SUPABASE_PROJECT_URL/SUPABASE_SERVICE_KEY to enable)")

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
