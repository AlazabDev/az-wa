#!/usr/bin/env python3
"""
Daftra MCP Smart Test Suite
---------------------------
اختبار ذكي وشامل لخادم Daftra MCP:
1. التحقق الأمني وفحص الـ 401 (Unauthorized)
2. مصافحة بروتوكول MCP (Initialize & Ping)
3. استكشاف قائمة الأدوات (tools/list)
4. اختبار البحث الدلالي بالعربية والإنجليزية
5. استخراج مخطط العمليات (daftra_describe_operation)
6. قياس نسبة التوفير في الرموز (Compact View vs Full View)
7. اختبار فلترة الحقول المخصصة (Fields Selection)
8. مرونة معالجة الأخطاء والمدخلات الخاطئة
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error

# الإعدادات الافتراضية (يمكن تمريرها كمتغيرات بيئة)
MCP_URL = os.environ.get("MCP_URL", "https://vlahgxkfpzappxtiwhvd.supabase.co/functions/v1/daftra-mcp")
MCP_KEY = os.environ.get("MCP_ACCESS_KEY", "az_df_jCfy6cMh1X6NTxR3OWLuvEFa0si5uZKr05UeoAEs")

# ألوان الطرفية
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

class SmartMcpTester:
    def __init__(self, url: str, key: str):
        self.url = url
        self.key = key
        self.passed = 0
        self.failed = 0
        self.warnings = 0
        self.req_id = 0

    def _post(self, payload: dict, custom_key: str = None) -> tuple[int, dict, float]:
        """إرسال طلب JSON-RPC وقياس زمن الاستجابة"""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        }
        active_key = self.key if custom_key is None else custom_key
        if active_key:
            headers["x-mcp-key"] = active_key

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(self.url, data=data, headers=headers, method="POST")
        
        start_time = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                elapsed = (time.perf_counter() - start_time) * 1000
                res_body = json.loads(resp.read().decode("utf-8"))
                return resp.status, res_body, elapsed
        except urllib.error.HTTPError as e:
            elapsed = (time.perf_counter() - start_time) * 1000
            try:
                err_body = json.loads(e.read().decode("utf-8"))
            except Exception:
                err_body = {"raw_error": e.reason}
            return e.code, err_body, elapsed
        except Exception as e:
            elapsed = (time.perf_counter() - start_time) * 1000
            return 500, {"error": str(e)}, elapsed

    def rpc_call(self, method: str, params: dict = None, custom_key: str = None) -> tuple[int, dict, float]:
        self.req_id += 1
        payload = {
            "jsonrpc": "2.0",
            "id": self.req_id,
            "method": method
        }
        if params is not None:
            payload["params"] = params
        return self._post(payload, custom_key)

    def log_result(self, step_name: str, success: bool, latency: float = 0, note: str = ""):
        if success:
            self.passed += 1
            print(f"  {GREEN}✓ [PASS]{RESET} {step_name} {CYAN}({latency:.1f}ms){RESET} {note}")
        else:
            self.failed += 1
            print(f"  {RED}✗ [FAIL]{RESET} {step_name} {CYAN}({latency:.1f}ms){RESET} {note}")

    def run_all(self):
        print(f"\n{BOLD}{CYAN}═════════════════════════════════════════════════════════════════{RESET}")
        print(f"{BOLD}           Daftra MCP Smart Automated Test Suite                 {RESET}")
        print(f"{CYAN}═════════════════════════════════════════════════════════════════{RESET}")
        print(f"Target URL: {BLUE}{self.url}{RESET}\n")

        # 1. اختبار الحماية والتوثيق
        print(f"{BOLD}[1/8] اختبارات الأمان والتوثيق (Security & Authentication):{RESET}")
        status, body, ms = self.rpc_call("ping", custom_key="")
        self.log_result("رفض الطلبات بدون مفتاح سرّي (Expected 401)", status == 401, ms)

        status, body, ms = self.rpc_call("ping", custom_key="wrong_dummy_key_123")
        self.log_result("رفض المفاتيح الخاطئة (Expected 401)", status == 401, ms)

        # 2. اختبار مصافحة البروتوكول (MCP Handshake)
        print(f"\n{BOLD}[2/8] مصافحة البروتوكول (Protocol Handshake):{RESET}")
        status, body, ms = self.rpc_call("initialize", {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "smart-tester", "version": "1.0"}
        })
        is_init = status == 200 and "result" in body and "protocolVersion" in body["result"]
        self.log_result("تنفيذ بروتوكول Initialize بنجاح", is_init, ms, 
                        f"Server: {body.get('result', {}).get('serverInfo', {}).get('name', 'N/A')}")

        status, body, ms = self.rpc_call("ping")
        self.log_result("فحص الاتصال Ping", status == 200 and "result" in body, ms)

        # 3. استكشاف قائمة الأدوات (Tools Discovery)
        print(f"\n{BOLD}[3/8] استكشاف الأدوات (Tools Discovery):{RESET}")
        status, body, ms = self.rpc_call("tools/list", {})
        tools = body.get("result", {}).get("tools", [])
        tool_names = [t["name"] for t in tools]
        expected_tools = ["daftra_list_categories", "daftra_search_operations", "daftra_describe_operation", "daftra_call"]
        all_found = all(t in tool_names for t in expected_tools)
        self.log_result(f"فحص توفر الأدوات الأساسية ({len(tools)} أدوات)", all_found, ms, f"الأدوات: {tool_names}")

        # 4. اختبار البحث بالعربية والإنجليزية (Semantic Aliases)
        print(f"\n{BOLD}[4/8] فحص محرك البحث الدلالي (Arabic & English Aliases):{RESET}")
        arabic_queries = [
            ("فاتورة", "invoices"),
            ("اوامر العمل", "work_orders"),
            ("عملاء", "clients"),
            ("قيود اليومية", "journals")
        ]
        for ar_query, expected_cat in arabic_queries:
            status, body, ms = self.rpc_call("tools/call", {
                "name": "daftra_search_operations",
                "arguments": {"query": ar_query, "limit": 5}
            })
            content_text = body.get("result", {}).get("content", [{}])[0].get("text", "[]")
            try:
                results = json.loads(content_text)
                found = len(results) > 0
                self.log_result(f"البحث بالعربية عن '{ar_query}'", found, ms, f"عُثر على {len(results)} عملية")
            except Exception:
                self.log_result(f"البحث بالعربية عن '{ar_query}'", False, ms, "فشل تحليل JSON")

        # 5. اختبار استخراج تفاصيل العملية (Describe Operation)
        print(f"\n{BOLD}[5/8] اختبار استخراج تفاصيل ومخطط العملية (Describe Operation):{RESET}")
        status, body, ms = self.rpc_call("tools/call", {
            "name": "daftra_describe_operation",
            "arguments": {"operation_id": "get_invoices"}
        })
        content_text = body.get("result", {}).get("content", [{}])[0].get("text", "{}")
        has_schema = "get_invoices" in content_text and "/invoices" in content_text
        self.log_result("جلب مواصفات عملية 'get_invoices'", has_schema, ms)

        # 6. قياس نسبة تقليص الرموز (Token & Payload Optimization)
        print(f"\n{BOLD}[6/8] قياس نسبة توفير الرموز (Token Optimization Benchmark):{RESET}")
        # جلب بحجم كامل
        status_full, body_full, ms_full = self.rpc_call("tools/call", {
            "name": "daftra_call",
            "arguments": {"operation_id": "get_invoices", "view": "full", "query": {"limit": 5}}
        })
        text_full = json.dumps(body_full)
        size_full = len(text_full.encode("utf-8"))

        # جلب مضغوط (Compact)
        status_comp, body_comp, ms_comp = self.rpc_call("tools/call", {
            "name": "daftra_call",
            "arguments": {"operation_id": "get_invoices", "view": "compact", "query": {"limit": 5}}
        })
        text_comp = json.dumps(body_comp)
        size_comp = len(text_comp.encode("utf-8"))

        reduction = ((size_full - size_comp) / size_full * 100) if size_full > 0 else 0
        passed_savings = size_comp <= size_full
        self.log_result(
            f"مقارنة حجم البيانات (Full: {size_full} B | Compact: {size_comp} B)",
            passed_savings,
            ms_comp,
            f"نسبة التوفير: {reduction:.1f}%"
        )

        # 7. اختبار فلترة الحقول المخصصة (Fields Selection)
        print(f"\n{BOLD}[7/8] اختبار فلترة الحقول المحددة (Custom Fields):{RESET}")
        status, body, ms = self.rpc_call("tools/call", {
            "name": "daftra_call",
            "arguments": {
                "operation_id": "get_invoices",
                "fields": ["id", "client_id", "total", "status"],
                "query": {"limit": 3}
            }
        })
        res_text = body.get("result", {}).get("content", [{}])[0].get("text", "")
        self.log_result("استدعاء عملية مع تحديد fields مخصصة", status == 200 and not body.get("isError", False), ms)

        # 8. اختبار مرونة معالجة الأخطاء (Error Resilience)
        print(f"\n{BOLD}[8/8] اختبار مرونة معالجة الأخطاء (Error Handling):{RESET}")
        status, body, ms = self.rpc_call("tools/call", {
            "name": "daftra_call",
            "arguments": {"operation_id": "non_existing_fake_op_999"}
        })
        is_err_handled = body.get("result", {}).get("isError") is True or "error" in str(body)
        self.log_result("التعامل الذكي مع معرف عملية غير موجود (Graceful Error)", is_err_handled, ms)

        status, body, ms = self.rpc_call("tools/call", {
            "name": "unsupported_tool_xyz",
            "arguments": {}
        })
        is_tool_err = "error" in body or (body.get("result", {}).get("isError") is True)
        self.log_result("رفض استدعاء أداة غير مسجلة بالخادم", is_tool_err, ms)

        # التقرير الختامي
        total = self.passed + self.failed
        success_rate = (self.passed / total * 100) if total > 0 else 0
        print(f"\n{CYAN}═════════════════════════════════════════════════════════════════{RESET}")
        print(f"{BOLD}                    التقرير الختامي للاختبارات                     {RESET}")
        print(f"{CYAN}═════════════════════════════════════════════════════════════════{RESET}")
        print(f"إجمالي الاختبارات : {total}")
        print(f"الناجحة          : {GREEN}{self.passed}{RESET}")
        print(f"الفاشلة          : {RED}{self.failed}{RESET}")
        print(f"معدل النجاح      : {GREEN if success_rate >= 80 else RED}{success_rate:.1f}%{RESET}")
        print(f"{CYAN}═════════════════════════════════════════════════════════════════{RESET}\n")

if __name__ == "__main__":
    tester = SmartMcpTester(MCP_URL, MCP_KEY)
    tester.run_all()
