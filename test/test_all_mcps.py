#!/usr/bin/env python3
"""
Multi-Server MCP Verification Test Suite
----------------------------------------
اختبار شامل لخوادم MCP المنشورة على Supabase:
1. daftra-mcp (إدارة الحسابات وفواتير دفترة)
2. magicplan-mcp (مخططات ومشاريع ماجيك بلان)
3. uberfix-mcp (إدارة وبوابة طلبات الصيانة)
"""

import os
import sys
import json
import urllib.request
import urllib.error

# المتغيرات الأساسية
BASE_URL = os.environ.get(
    "SUPABASE_URL", 
    "https://vlahgxkfpzappxtiwhvd.supabase.co/functions/v1"
)
MCP_KEY = os.environ.get("MCP_ACCESS_KEY", "az_df_jCfy6cMh1X6NTxR3OWLuvEFa0si5uZKr05UeoAEs")

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"

SERVERS = [
    {
        "name": "magicplan-mcp",
        "url": f"{BASE_URL}/magicplan-mcp",
        "expected_tools": ["magicplan_list_modules", "magicplan_search_operations", "magicplan_describe_operation", "magicplan_call"]
    },
    {
        "name": "uberfix-mcp",
        "url": f"{BASE_URL}/uberfix-mcp",
        "expected_tools": ["uberfix_create_ticket", "uberfix_get_ticket_status", "uberfix_transition_stage", "uberfix_add_ticket_note", "uberfix_cancel_ticket"]
    },
    {
        "name": "daftra-mcp",
        "url": f"{BASE_URL}/daftra-mcp",
        "expected_tools": ["daftra_list_categories", "daftra_search_operations", "daftra_describe_operation", "daftra_call"]
    }
]

def make_request(url: str, method: str = "GET", payload: dict = None, headers: dict = None):
    req_headers = {"User-Agent": "MCP-Tester/1.0"}
    if headers:
        req_headers.update(headers)
    data = json.dumps(payload).encode("utf-8") if payload else None
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"raw": body}
    except Exception as e:
        return 0, {"error": str(e)}

def test_server(server):
    name = server["name"]
    url = server["url"]
    print(f"\n{BLUE}=== فحص خادم: {name} ==={RESET}")
    
    # 1. فحص الحماية من غير مفتاح (401 Unauthorized)
    status, _ = make_request(url, method="GET")
    if status == 401:
        print(f"  {GREEN}[PASS]{RESET} فحص الأمان: رفض الطلب بدون مفتاح (401)")
    else:
        print(f"  {RED}[FAIL]{RESET} فحص الأمان: المتوقع 401 وحصلنا على {status}")

    # 2. فحص نقطة GET الوصفية مع المفتاح
    status, data = make_request(url, method="GET", headers={"x-mcp-key": MCP_KEY})
    if status == 200 and data.get("name") == name:
        print(f"  {GREEN}[PASS]{RESET} فحص بيانات الخادم: {data.get('name')} (v{data.get('version')})")
    else:
        print(f"  {RED}[FAIL]{RESET} فشل استرجاع معلومات الخادم ({status}): {data}")

    # 3. فحص بروتوكول MCP: tools/list
    mcp_payload = {
        "jsonrpc": "2.0",
        "id": "test-tools-list",
        "method": "tools/list"
    }
    status, data = make_request(url, method="POST", payload=mcp_payload, headers={"x-mcp-key": MCP_KEY})
    if status == 200 and "result" in data:
        tools = [t["name"] for t in data["result"].get("tools", [])]
        print(f"  {GREEN}[PASS]{RESET} نجاح tools/list: تم العثور على {len(tools)} أداة")
        missing = [t for t in server["expected_tools"] if t not in tools]
        if not missing:
            print(f"  {GREEN}[PASS]{RESET} جميع الأدوات المتوقعة مسجلة وجاهزة")
        else:
            print(f"  {YELLOW}[WARN]{RESET} أدوات مفقودة: {missing}")
    else:
        print(f"  {RED}[FAIL]{RESET} خطأ في tools/list ({status}): {data}")

def main():
    print(f"{YELLOW}بدء اختبار منظومة الـ MCP المتصلة بـ Supabase...{RESET}")
    for s in SERVERS:
        test_server(s)
    print(f"\n{GREEN}اكتمل الفحص.{RESET}")

if __name__ == "__main__":
    main()
