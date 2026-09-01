# AzWA Hub

AzWA WhatsApp Business Operations OS

أريد بناء تطبيق Production-Grade باسم:

AzWA

يكون مركز التحكم المركزي الكامل لجميع حسابات وأرقام WhatsApp Business Platform التابعة للمؤسسة.

التطبيق ليس مخصصًا لرقم WhatsApp واحد، وممنوع بناء أي جزء من النظام بافتراض وجود WABA_ID أو PHONE_NUMBER_ID واحد ثابت.

الهدف هو إنشاء WhatsApp Business Operations OS لإدارة وتشغيل ومراقبة جميع أرقام WhatsApp الحالية والمستقبلية من منصة واحدة.

1. بيانات Meta الأساسية

التطبيق

App Name: AzWA
Meta App ID: 1061494059972503
Namespace: azwhatsapp

Domains

alazab.com
wa.alazab.com

URLs

Privacy Policy:
https://alazab.com/privacy-policy

Terms of Service:
https://alazab.com/terms-of-service

Data Deletion:
https://alazab.com/data-deletion

Business Portfolio الرئيسي

Meta Business Portfolio ID:
314437023701205

هذا هو Business Portfolio الرئيسي الذي يجب أن تتمحور حوله بنية Meta داخل النظام.

2. بنية WhatsApp الحالية

المرجع الإنتاجي المدقق بتاريخ 2026-08-31:

1 Business Portfolio
6 WABAs
8 WhatsApp Phone Numbers

Runtime discovery من Meta هو المصدر التشغيلي النهائي، وهذه الأعداد مرجع تدقيق فقط وليست قيمًا Hardcoded للتوجيه.

للتفاصيل الحالية راجع قسم Audited inventory baseline في `PRODUCTION.md`. الأصول التاريخية التي تختفي من Meta تُعلّم missing/inactive ولا تُحذف من السجل.

العلاقة الصحيحة:

Business Portfolio
│
├── WABA
│ ├── Phone Number
│ ├── Phone Number
│ └── ...
│
├── WABA
│ └── Phone Number
│
└── ...

ممنوع إنشاء علاقة One-to-One بين WABA ورقم WhatsApp.

يجب أن تكون:

Business Portfolio 1:N WABAs
WABA 1:N Phone Numbers

3. قاعدة أساسية غير قابلة للتفاوض

ممنوع الاعتماد على:

WABA_ID=
WHATSAPP_PHONE_NUMBER_ID=

كإعداد عالمي للتطبيق.

كل Business Portfolio وWABA وPhone Number يجب أن يكون Entity مستقلة داخل PostgreSQL.

أي عملية داخل النظام يجب أن يتم تنفيذها داخل Scope واضح:

business_portfolio_id
waba_id
whatsapp_number_id

ويجب الفصل بين Internal UUID وبين Meta ID.

مثال:

whatsapp_numbers.id

هو UUID داخلي.

بينما:

whatsapp_numbers.meta_phone_number_id

هو:

<META_PHONE_NUMBER_ID>

ونفس الأمر بالنسبة إلى WABA وBusiness Portfolio.

4. الهدف النهائي

من خلال AzWA أريد إدارة:

Business Portfolios
WABAs
WhatsApp Numbers
Messages
Conversations
Contacts
Media
Templates
Campaigns
Automations
Webhooks
Credentials
Meta API
Queues
Workers
Errors
Alerts
Health
Analytics
Users
Teams
Permissions
Integrations
Audit Logs

من منصة واحدة.

5. Global Scope

يجب أن يكون هناك Scope Selector رئيسي أعلى التطبيق:

All Numbers

Business Portfolio

WABA

WhatsApp Number

عند اختيار:

All Numbers

يعرض النظام البيانات المجمعة لجميع الأرقام.

عند اختيار WABA يعرض فقط بيانات الـWABA والأرقام التابعة لها.

عند اختيار رقم معين يتم تشغيل التطبيق بالكامل داخل Context هذا الرقم.

الـScope يجب أن يؤثر على:

Dashboard
Inbox
Contacts
Media
Templates
Campaigns
Automation
Analytics
Errors
Logs
Health

6. Dashboard

أنشئ Dashboard رئيسية تعرض:

Business Portfolios
WABAs
WhatsApp Numbers

Healthy Numbers
Warning Numbers
Critical Numbers

Messages Today
Incoming Messages
Outgoing Messages

Sent
Delivered
Read
Failed

Open Conversations
Contacts

Media Received

Templates
Approved Templates
Rejected Templates

Running Campaigns

Webhook Errors
API Errors
Queue Backlog

مع Filters:

Business
WABA
Phone Number
Date Range

7. إدارة WABAs

صفحة:

WABAs

تعرض:

WABA ID
Name
Business Portfolio
Number Count
Status
Templates
Messages
Errors
Health
Last Sync

عند فتح WABA يتم عرض:

Overview
Phone Numbers
Templates
Campaigns
Messages
Webhooks
Health
Errors
Logs
Settings

8. إدارة أرقام WhatsApp

صفحة:

WhatsApp Numbers

تعرض جميع الأرقام الحالية والمستقبلية.

Columns:

Number
Internal Name
Verified Name
Phone Number ID
WABA ID
Status
Quality Rating
Messaging Limit
Webhook Status
Messages Today
Last Incoming
Last Outgoing
API Health
Errors
Actions

Actions:

Open Inbox
Overview
Send Message
Send Test Message
Sync
Test API
Test Webhook
View Templates
View Media
View Errors
View Logs
Configuration

9. Number Discovery & Synchronization

أنشئ Meta Sync Engine.

Workflow:

Business Portfolio
↓
Discover / Sync WABAs
↓
Discover / Sync Phone Numbers
↓
Compare With PostgreSQL
↓
Insert New
Update Existing
Mark Missing
↓
Sync Report

الأرقام الثمانية في المرجع المدقق تستخدم كـInitial Production Import فقط، مع بقاء Runtime discovery هو المصدر التشغيلي.

لا تجعلها Hardcoded داخل Business Logic.

إضافة الرقم العاشر مستقبلًا يجب ألا تحتاج تعديل الكود.

المطلوب فقط:

Discover
→ Import
→ Configure Credential
→ Verify
→ Enable

10. Unified Inbox

أنشئ Inbox مركزيًا لكل أرقام WhatsApp.

يجب دعم:

All Numbers Inbox

WABA Inbox

Single Number Inbox

كل Conversation يجب أن تكون مرتبطة بـ:

contact_id
whatsapp_number_id

لا تخلط محادثات العميل نفسه إذا تواصل مع رقمين مختلفين.

مثال:

Customer A → +201115723930
Customer A → +201092750351

هما مساران منفصلان للمحادثة.

11. الرسائل

دعم:

Text
Image
Video
Audio
Voice Notes
PDF
Documents
Location
Contacts
Interactive Messages
Buttons
Lists
Template Messages
Replies

كل رسالة يجب أن تحتوي:

wamid
conversation_id
contact_id
whatsapp_number_id
direction
type
body
caption
reply_to_message_id
status
timestamp
raw_payload

wamid يجب أن يكون Unique عند وجوده.

12. إرسال الرسائل

عند إنشاء رسالة جديدة يجب تحديد:

Send From

ويتم الاختيار من أرقام WhatsApp التي:

Enabled
Authorized For User
API Healthy

داخل Conversation موجودة، الرد يجب أن يخرج افتراضيًا من نفس رقم WhatsApp الذي استقبل المحادثة.

لا تغير Sender تلقائيًا.

13. Message Status Engine

تابع دورة الرسالة:

queued
submitted
sent
delivered
read
failed

ولا تكتفِ بحقل Status واحد.

أنشئ:

message_status_history

ليحتفظ بكل تغيرات الحالة.

14. Contacts / CRM

أنشئ Contact Center يحتوي:

WhatsApp ID
Phone
Name
Profile Name
Email
Company
Tags
Source
Assigned Agent
Notes
First Interaction
Last Interaction
Conversation Count
Message Count
Custom Fields

Contact واحدة يمكن أن تتفاعل مع أكثر من WhatsApp Number.

صفحة Contact تعرض Unified Timeline، ولكن كل Event يجب أن يعرض الرقم الذي تم من خلاله التواصل.

15. Media Center

يجب إنشاء Media Pipeline حقيقية.

عند استقبال:

image
video
audio
voice
document
PDF
Excel
Word

يتم:

Webhook
↓
Identify WhatsApp Number
↓
Extract media_id
↓
Queue media-download
↓
Request Media URL From Meta
↓
Streaming Download
↓
Permanent Storage
↓
Database Metadata

لا تعتمد على رابط Meta المؤقت كمسار تخزين دائم.

احفظ:

media_id
message_id
contact_id
whatsapp_number_id
filename
mime_type
size
sha256
storage_provider
storage_bucket
storage_path
received_at

16. Webhook Gateway

استخدم Webhook مركزي:

POST https://wa.alazab.com/webhooks/meta/whatsapp

ولا تنشئ Webhook منفصل إجباريًا لكل رقم.

Workflow:

Meta Webhook
↓
Validate X-Hub-Signature-256
↓
Persist Raw Event
↓
Identify WABA
↓
Identify Phone Number
↓
Deduplicate
↓
Queue
↓
Return HTTP 200
↓
Async Worker
↓
Process

حدد الرقم من:

metadata.phone_number_id

17. Unknown Number Events

إذا وصل Webhook إلى Phone Number ID غير موجود في قاعدة البيانات:

لا تحذف Event.

احفظه كـ:

unmapped_number_event

وارفع Alert:

Unknown WhatsApp Phone Number

ثم اسمح للAdmin بعمل:

Discover
Import
Map

18. Webhook Events

أنشئ جدول:

webhook_events

يحتوي:

id
business_portfolio_id
waba_id
whatsapp_number_id

meta_waba_id
meta_phone_number_id

event_type
message_id

payload

signature_valid
deduplication_key

received_at
queued_at
processed_at

status
attempts
error

19. Template Manager

Templates مرتبطة بالـWABA، وليس بالتطبيق كله.

يجب أن يحتوي Template على:

waba_id
name
category
language
status
quality
components
last_synced_at

يدعم:

List
Search
Sync
Create
Preview
Duplicate
Submit
Delete

مع:

Header
Body
Footer
Buttons
Quick Replies
URL Buttons
Phone Buttons
Variables

وعند إرسال Template يجب التأكد أن Sender Number ينتمي إلى نفس WABA.

20. Campaign Manager

أنشئ Campaign System.

كل Campaign يجب أن يحتوي:

name
sender_whatsapp_number_id
template_id
audience
schedule
status
created_by

Audience:

Tags
Contacts
CSV
Custom Filters

Statuses:

Draft
Scheduled
Running
Paused
Completed
Failed

Workflow:

Campaign
↓
Recipients
↓
Queue
↓
Workers
↓
Rate Limiter
↓
Meta API

لا ترسل حملة كاملة داخل HTTP Request واحدة.

21. Campaign Analytics

لكل Campaign:

Total
Queued
Sent
Delivered
Read
Failed

Delivery Rate
Read Rate
Failure Rate

Responses
Opt-outs

22. Automation Engine

أنشئ Automation Engine.

Triggers:

Message Received
Keyword Received
Media Received
New Contact
Message Delivered
Message Read
Message Failed
Webhook Error

Conditions:

WABA
WhatsApp Number
Contact Tag
Message Type
Keyword
Contact Field
Time

Actions:

Send Message
Send Template
Assign Agent
Add Tag
Remove Tag
Save Media
Call Webhook
Call External API
Update Contact
Create Internal Task

23. Credential Management

لا تفترض Access Token واحدة.

أنشئ:

meta_credentials

يدعم:

Business-level credential
WABA-level credential
Phone-level credential
System User credential

Fields:

id
business_portfolio_id
waba_id
whatsapp_number_id
credential_type
secret_reference
expires_at
status
last_verified_at
last_used_at

لا تعرض Secret أو Access Token للFrontend.

لا تسجل Tokens في Logs.

24. Credential Resolver

أنشئ Backend Service:

resolveCredential(whatsappNumberId)

وهو المسؤول وحده عن تحديد الـCredential المناسبة عند الاتصال بـMeta.

لا تجعل Frontend أو Route يختار Token بنفسه.

25. Meta Integration Layer

أنشئ Client مركزي:

MetaGraphClient

ثم Services:

BusinessService
WabaService
PhoneNumberService
MessageService
TemplateService
MediaService
WebhookService

ممنوع توزيع:

fetch("https://graph.facebook.com/...")

داخل Components وRoutes بشكل عشوائي.

26. API Logs

سجل جميع Meta Graph Requests.

Fields:

request_id
whatsapp_number_id
waba_id
endpoint
method
http_status
duration
meta_error_code
meta_error_message
created_at

مع منع تخزين Access Token.

27. Error Center

أنشئ مركز أخطاء موحد.

يدعم:

Authentication Error
Permission Error
Expired Credential
Rate Limit
Template Error
Message Failure
Webhook Failure
Media Failure
Invalid Recipient
Number Failure
Queue Failure

ويعرض:

Error Code
Title
WABA
WhatsApp Number
Timestamp
Occurrences
Last Occurrence
Status
Raw Error

28. Health Monitoring

Health مستقلة لكل رقم.

افحص:

Meta API
Webhook
Token / Credential
Last Incoming
Last Outgoing
Message Failure Rate
Media Pipeline
Queue
Quality Rating
Number Status

Status:

Healthy
Warning
Critical
Offline

ثم أنشئ Health مجمعة على:

Phone Number
WABA
Business Portfolio
Global

29. Alerts

أنشئ Alerts عند:

Webhook Failure
API Failure Spike
Credential Failure
Phone Number Disconnected
Quality Rating Drop
Template Rejected
Message Failure Spike
Queue Backlog
Media Download Failure
Unknown Phone Number

30. Users / Teams / RBAC

Roles:

Super Admin
Admin
Supervisor
Agent
Marketing
Developer
Viewer

Permissions:

business.read
wabas.read
wabas.manage

numbers.read
numbers.manage

messages.read
messages.send

contacts.read
contacts.manage

media.read

templates.read
templates.manage

campaigns.read
campaigns.create
campaigns.send

automation.manage

webhooks.read
webhooks.manage

credentials.manage

health.read
errors.read
logs.read

users.manage
settings.manage

31. Number-Level Permissions

أنشئ:

user_number_access

بحيث يمكن مثلًا:

Agent A

+201115723930 → Read + Send

+201092750351 → Read

+12064795608 → No Access

ويجب أيضًا دعم:

user_waba_access
user_business_access

32. Audit Logs

سجل كل عملية إدارية مهمة:

actor_user_id

business_portfolio_id
waba_id
whatsapp_number_id

action
entity_type
entity_id

old_value
new_value

ip
timestamp

مثل:

Credential Changed
Number Added
Number Disabled
Template Deleted
Campaign Started
Permission Changed
Webhook Configuration Changed

33. Analytics

أنشئ Analytics تدعم:

Global
Business
WABA
Phone Number

Metrics:

Incoming Messages
Outgoing Messages
Sent
Delivered
Read
Failed

Delivery Rate
Read Rate
Failure Rate

Contacts
New Contacts
Conversations

Average Response Time

Media Volume

Template Usage
Campaign Performance

API Errors
Webhook Errors

34. Number Comparison

أنشئ شاشة مقارنة لكل الأرقام الحالية المكتشفة وأي أرقام مستقبلية.

Columns / Metrics:

Messages
Incoming
Outgoing
Delivery Rate
Read Rate
Failure Rate
Contacts
Conversations
Response Time
Media
API Errors
Webhook Errors
Health
Quality

35. Search

Global Search عبر كل الأرقام المسموح للمستخدم الوصول إليها.

Search by:

Phone
Contact
Message
Message ID
Filename
Template
Campaign
WABA
Phone Number ID

36. Internal Number Metadata

اسمح بإضافة:

internal_name
department
country
purpose
tags

لكل WhatsApp Number.

لا تعتمد فقط على الرقم كاسم داخل الواجهة.

37. Database

استخدم PostgreSQL.

الجداول الأساسية:

organizations

business_portfolios
wabas
whatsapp_numbers
meta_credentials

contacts
contact_tags

conversations
conversation_assignments

messages
message_status_history

media

templates
template_versions

campaigns
campaign_recipients

automation_rules
automation_runs

webhook_events

api_requests
api_errors

alerts
health_checks

users
teams
roles
permissions

user_business_access
user_waba_access
user_number_access

integrations
outgoing_webhooks

jobs
dead_letter_jobs

audit_logs
system_settings

38. Queue Architecture

أنشئ Queues مستقلة:

webhook-events
media-downloads
message-send
campaign-send
automation
template-sync
meta-sync
analytics
failed-jobs

كل Job يحتوي:

id
type
payload
attempt
max_attempts
created_at
started_at
completed_at
failed_at
error

39. Retry & Idempotency

طبق:

Exponential Backoff
Idempotency
Deduplication
Dead Letter Queue

خصوصًا على:

Webhook Events
wamid
Message Statuses
Outgoing Messages
Campaign Recipients
Media Downloads
Automation Runs

لا تعيد إرسال Message إذا كان هناك احتمال أنها أُرسلت بالفعل.

40. Realtime

استخدم Realtime لتحديث:

Inbox
Message Status
Campaign Progress
Alerts
Health
Webhook Events
Queue Status

بدون Refresh.

41. UI

Frontend:

React
TypeScript
Vite
Tailwind CSS
shadcn/ui

التصميم:

Enterprise
Clean
Technical
Fast
Desktop-first
Responsive

ألوان AzWA:

Primary: #030957
Secondary: #FFB900
Background: Light

Sidebar قابلة للطي.

42. Sidebar

Overview

Inbox
Contacts
Media

Templates
Campaigns
Automation

────────────────

WhatsApp Infrastructure

Business Portfolio
WABAs
Phone Numbers
Webhooks
Credentials

────────────────

Operations

Health
Alerts
Errors
Queues
Dead Letter Queue
API Logs
Webhook Events

────────────────

Analytics
Reports

────────────────

Administration

Users
Teams
Roles & Permissions
Integrations
Audit Logs
Settings

43. Top Bar

اعرض دائمًا:

Current Scope

Business
WABA
WhatsApp Number

System Health

Notifications

User

44. Backend Architecture

استخدم:

Node.js
TypeScript
PostgreSQL

ويمكن استخدام Supabase لـ:

PostgreSQL
Authentication
Realtime
Storage

البنية:

React Frontend
↓
Internal Backend API
↓
Application Services
↓
Meta Integration Layer
↓
Meta Graph API

والاستقبال:

Meta Webhooks
↓
Webhook Gateway
↓
Signature Validation
↓
Raw Event Persistence
↓
Deduplication
↓
Queue
↓
Workers
↓
PostgreSQL
↓
Realtime UI

45. Security

طبق:

Authentication
RBAC
Input Validation
Rate Limiting
Secure Headers
Encrypted Secrets
Webhook Signature Validation
Audit Logging
Session Security
API Request Validation

لا ترسل Secrets إلى Browser.

46. No Fake Features

لا تفترض أن WhatsApp Business Platform تسمح بكل وظائف تطبيق WhatsApp على الهاتف.

أي وظيفة غير متاحة رسميًا عبر Meta API يجب أن تظهر:

Not Available Through Current WhatsApp Business API

ولا تنشئ تنفيذًا وهميًا.

47. Source of Truth

استخدم:

PostgreSQL

كمصدر Operational History.

واستخدم:

Meta

كمصدر External Platform State.

المزامنة مع Meta لا يجب أن تمسح التاريخ المحلي.

48. Production Requirement

لا أريد Prototype أو Dashboard شكلية.

المطلوب:

Real PostgreSQL Schema
Real Migrations
Real Authentication
Real RBAC

Real Meta Graph Integration

Real Multi-WABA Support
Real Multi-Number Support

Real Webhook
Real Queue
Real Workers

Real Messaging
Real Media Download

Real Templates
Real Campaigns

Real Error Handling
Real Logging
Real Monitoring

Mock Data مسموحة فقط أثناء تطوير UI وتكون مفصولة كليًا عن Production Data Layer.

49. التنفيذ

ابدأ بالترتيب التالي فقط:

Phase 1 — Foundation

Repository Architecture
Database Schema
Migrations
Authentication
RBAC

Business Portfolio
WABAs
WhatsApp Numbers
Credentials

Phase 2 — Meta Control Plane

MetaGraphClient
Business Sync
WABA Sync
Phone Number Sync
Credential Resolution
Connection Tests

Phase 3 — Webhook Infrastructure

Webhook Endpoint
Verification
X-Hub-Signature-256 Validation
Raw Events
Deduplication
Queue
Workers
Dead Letter Queue

Phase 4 — Messaging

Contacts
Conversations
Messages
Status History
Unified Inbox
Sending

Phase 5 — Media

Media Detection
Download Queue
Streaming Download
Permanent Storage
Media Manager

Phase 6

Templates
Campaigns
Automation

Phase 7

Analytics
Health
Alerts
Errors
Integrations
Audit

50. أول نتيجة مطلوبة

قبل بناء عشرات الشاشات، أنشئ أولًا نسخة تشغيلية حقيقية تعرض:

Business Portfolio:
314437023701205

وتحتها الـ7 WABAs والـ9 أرقام الفعلية:

314437023701205

│
├── 2154838801923462
│ └── +201092750351
│ Phone Number ID: 1011864912017679
│
├── 1527103499063250
│ └── +201146395966
│ Phone Number ID: 1197837903405393
│
├── 1303965001665007
│ └── +201146397010
│ Phone Number ID: 1061490140383829
│
├── 2144651456337012
│ └── +12054605650
│ Phone Number ID: 1020054711186921
│
├── 1458856398934130
│ ├── +12064795608
│ │ Phone Number ID: 1032441389943808
│ │
│ └── +12083799564
│ Phone Number ID: 952530191273396
│
└── 459851797218855
├── +15557285727
│ Phone Number ID: 644995285354639
│
└── +15557245001
Phone Number ID: 527697617099639

ثم اختبر لكل رقم:

Meta Connectivity
WABA Mapping
Phone Number Mapping
Credential
Webhook
Send Capability
Receive Capability
Media Capability

واعرض:

PASS
WARNING
FAIL

لكل اختبار.

51. تعريف المنتج النهائي

AzWA ليس:

WhatsApp Inbox

وليس:

WhatsApp Dashboard

وليس:

Application For One WhatsApp Number

AzWA هو:

Central WhatsApp Business Operations OS

يجب أن يعمل كـControl Plane مركزي للبنية الحالية:

1 Business Portfolio
7 WABAs
9 WhatsApp Numbers

ويكون جاهزًا من نفس Architecture لدعم:

N Business Portfolios
N WABAs
N WhatsApp Numbers
N Users
N Teams
N Integrations

بدون إعادة تصميم النظام أو Hardcoding أي رقم أو WABA.

ابدأ بالتنفيذ على البيانات الفعلية الموضحة أعلاه، وابنِ الأساس أولًا قبل الانتقال إلى تفاصيل الواجهة.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://azwa-os.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9ecf9450-ce25-4d0b-9327-d25914477ada).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
