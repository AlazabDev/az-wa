const fs = require('fs');

const EVENTS = [
  { group: "جهات الاتصال", events: [
    { value: "contact.created", label: "إنشاء جهة اتصال" },
    { value: "contact.updated", label: "تعديل جهة اتصال" },
    { value: "contact.blocked", label: "حظر جهة اتصال" },
    { value: "contact.unblocked", label: "رفع الحظر عن جهة اتصال" },
    { value: "contact.tagged", label: "إضافة وسم لجهة اتصال" },
    { value: "contact.untagged", label: "إزالة وسم من جهة اتصال" },
    { value: "contact.deleted", label: "حذف جهة اتصال" }
  ]},
  { group: "الطلبات", events: [
    { value: "order.created", label: "طلب جديد" },
    { value: "order.paid", label: "دفع الطلب" },
    { value: "order.shipped", label: "شحن الطلب" },
    { value: "order.ready_for_pickup", label: "الطلب جاهز للاستلام" },
    { value: "order.delivered", label: "تسليم الطلب" },
    { value: "order.cancelled", label: "إلغاء الطلب" },
    { value: "order.refunded", label: "استرداد الطلب" },
    { value: "product.created", label: "منتج جديد" },
    { value: "product.updated", label: "تحديث منتج" },
    { value: "cart.abandoned", label: "سلة متروكة" }
  ]},
  { group: "الحجوزات", events: [
    { value: "booking.created", label: "إنشاء حجز" },
    { value: "booking.updated", label: "تعديل حجز" },
    { value: "booking.cancelled", label: "إلغاء حجز" },
    { value: "booking.confirmed", label: "تأكيد حجز" }
  ]},
  { group: "الحملات", events: [
    { value: "campaign.completed", label: "اكتمال الحملة" },
    { value: "campaign.failed", label: "فشل الحملة" }
  ]},
  { group: "الرسائل", events: [
    { value: "message.received", label: "وصول رسالة" },
    { value: "message.sent", label: "إرسال رسالة" },
    { value: "conversation.created", label: "إنشاء محادثة" },
    { value: "conversation.assigned", label: "إسناد محادثة" },
    { value: "conversation.transferred", label: "تحويل محادثة" },
    { value: "conversation.closed", label: "إغلاق محادثة" },
    { value: "conversation.reopened", label: "إعادة فتح محادثة" },
    { value: "conversation.muted", label: "كتم محادثة" },
    { value: "conversation.unmuted", label: "إلغاء كتم محادثة" },
    { value: "conversation.archived", label: "أرشفة محادثة" },
    { value: "conversation.unarchived", label: "استعادة محادثة" },
    { value: "conversation.tagged", label: "إضافة وسم لمحادثة" },
    { value: "conversation.untagged", label: "إزالة وسم من محادثة" },
    { value: "message.delivered", label: "تسليم رسالة" },
    { value: "message.read", label: "قراءة رسالة" },
    { value: "message.failed", label: "فشل رسالة" },
    { value: "conversation.unassigned", label: "إلغاء إسناد محادثة" }
  ]},
  { group: "الأتمتة", events: [
    { value: "flow.completed", label: "اكتمل التدفق" },
    { value: "flow.handoff_requested", label: "طلب تحويل لموظف" },
    { value: "conversation.csat_received", label: "وصل تقييم رضا" }
  ]},
  { group: "الفوترة", events: [
    { value: "invoice.paid", label: "دفعت الفاتورة" }
  ]}
];
