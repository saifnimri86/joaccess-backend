export type Lang = "en" | "ar";

export const translations = {
  en: {
    nav_dashboard:   "Dashboard",
    nav_locations:   "Locations",
    nav_users:       "Users",
    nav_reviews:     "Reviews",
    nav_reports:     "Reports",
    nav_ai:          "AI Insights",
    nav_signout:     "Sign out",
    nav_admin_label: "Admin Panel",

    auth_title:    "JOAccess Admin",
    auth_subtitle: "Restricted access — admins only",
    auth_email:    "Email",
    auth_password: "Password",
    auth_signin:   "Sign in",
    auth_signing:  "Signing in…",
    auth_footer:   "JOAccess — Jordan University of Science & Technology",
    auth_invalid:  "Invalid credentials or not an admin account.",

    dash_title:           "Dashboard",
    dash_subtitle:        "Platform overview — JOAccess Jordan",
    dash_users:           "Users",
    dash_locations:       "Locations",
    dash_verified:        "Verified",
    dash_pending:         "Pending",
    dash_reviews:         "Reviews",
    dash_reports:         "Reports",
    dash_verif_rate:      "Verification Rate",
    dash_avg_rating:      "Avg Rating",
    dash_monthly_locs:    "Monthly Locations Added",
    dash_monthly_users:   "Monthly User Signups",
    dash_categories:      "Location Categories",
    dash_rating_dist:     "Rating Distribution",
    dash_top_locations:   "Top Locations by Reviews",
    dash_recent_reviews:  "Recent Reviews",
    dash_error:           "Failed to load dashboard data. Is the backend running?",

    loc_title:        "Locations",
    loc_subtitle:     "{{n}} total locations",
    loc_search:       "Search by name or address…",
    loc_all_cats:     "All categories",
    loc_all_status:   "All status",
    loc_verified_f:   "Verified",
    loc_pending_f:    "Pending",
    loc_col_name:     "Name",
    loc_col_cat:      "Category",
    loc_col_creator:  "Creator",
    loc_col_rating:   "Rating",
    loc_col_status:   "Status",
    loc_col_added:    "Added",
    loc_col_actions:  "Actions",
    loc_empty:        "No locations found",
    loc_verify:       "Verify",
    loc_unverify:     "Unverify",
    loc_del_title:    "Delete Location",
    loc_del_desc:     "Permanently delete \"{{name}}\"? This removes all reviews, reports, and photos.",

    usr_title:       "Users",
    usr_subtitle:    "{{n}} registered users",
    usr_search:      "Search by username or email…",
    usr_col_user:    "User",
    usr_col_type:    "Type",
    usr_col_locs:    "Locations",
    usr_col_reviews: "Reviews",
    usr_col_role:    "Role",
    usr_col_joined:  "Joined",
    usr_col_actions: "Actions",
    usr_empty:       "No users found",
    usr_admin:       "Admin",
    usr_user:        "User",
    usr_del_title:   "Delete User",
    usr_del_desc:    "Delete \"{{username}}\" ({{email}})? This removes all their locations and reviews.",

    rev_title:       "Reviews",
    rev_subtitle:    "{{n}} total reviews",
    rev_col_loc:     "Location",
    rev_col_user:    "User",
    rev_col_rating:  "Rating",
    rev_col_comment: "Comment",
    rev_col_date:    "Date",
    rev_col_actions: "Actions",
    rev_empty:       "No reviews yet",
    rev_no_comment:  "No comment",
    rev_del_title:   "Delete Review",
    rev_del_desc:    "Delete this review by \"{{user}}\" on \"{{location}}\"? This cannot be undone.",

    rep_title:       "Reports",
    rep_subtitle:    "{{n}} total reports",
    rep_col_loc:     "Location",
    rep_col_reporter:"Reporter",
    rep_col_reason:  "Reason",
    rep_col_desc:    "Description",
    rep_col_status:  "Status",
    rep_col_date:    "Date",
    rep_col_actions: "Actions",
    rep_empty:       "No reports — all clear",
    rep_no_desc:     "No description",
    rep_resolved:    "Resolved",
    rep_open:        "Open",
    rep_resolve:     "Resolve",
    rep_del_title:   "Delete Report",
    rep_del_desc:    "Delete this report from \"{{reporter}}\"? It will be removed permanently.",

    ai_title:       "AI Insights",
    ai_subtitle:    "Powered by Gemma 4 — analyzes platform data and generates recommendations",
    ai_card_title:  "Gemma 4 Platform Analysis",
    ai_card_desc:   "Sends your platform statistics to Gemma 4 and receives a full analysis with actionable recommendations for improving JOAccess.",
    ai_run:         "Run AI Analysis",
    ai_regen:       "Regenerate Analysis",
    ai_analyzing:   "Analyzing platform data…",
    ai_last_gen:    "Last generated: {{time}}",
    ai_err_title:   "Analysis failed",
    ai_analysis:    "Platform Analysis",
    ai_recs:        "Recommendations",
    ai_empty:       "Click the button above to run your first analysis",

    common_cancel: "Cancel",
    common_delete: "Delete",
    common_rev_per_abbr: "rev",
  },

  ar: {
    nav_dashboard:   "لوحة التحكم",
    nav_locations:   "المواقع",
    nav_users:       "المستخدمون",
    nav_reviews:     "التقييمات",
    nav_reports:     "البلاغات",
    nav_ai:          "تحليل الذكاء الاصطناعي",
    nav_signout:     "تسجيل الخروج",
    nav_admin_label: "لوحة الإدارة",

    auth_title:    "مدير جو-أكسس",
    auth_subtitle: "وصول مقيد — المدراء فقط",
    auth_email:    "البريد الإلكتروني",
    auth_password: "كلمة المرور",
    auth_signin:   "تسجيل الدخول",
    auth_signing:  "جاري التسجيل…",
    auth_footer:   "جو-أكسس — جامعة العلوم والتكنولوجيا الأردنية",
    auth_invalid:  "بيانات اعتماد غير صحيحة أو الحساب ليس مدير.",

    dash_title:           "لوحة التحكم",
    dash_subtitle:        "نظرة عامة على المنصة — جو-أكسس الأردن",
    dash_users:           "المستخدمون",
    dash_locations:       "المواقع",
    dash_verified:        "موثق",
    dash_pending:         "قيد الانتظار",
    dash_reviews:         "التقييمات",
    dash_reports:         "البلاغات",
    dash_verif_rate:      "معدل التحقق",
    dash_avg_rating:      "متوسط التقييم",
    dash_monthly_locs:    "المواقع المضافة شهرياً",
    dash_monthly_users:   "اشتراكات المستخدمين شهرياً",
    dash_categories:      "فئات المواقع",
    dash_rating_dist:     "توزيع التقييمات",
    dash_top_locations:   "أفضل المواقع حسب التقييمات",
    dash_recent_reviews:  "أحدث التقييمات",
    dash_error:           "فشل تحميل البيانات. هل الخادم يعمل؟",

    loc_title:        "المواقع",
    loc_subtitle:     "{{n}} موقع إجمالي",
    loc_search:       "البحث بالاسم أو العنوان…",
    loc_all_cats:     "جميع الفئات",
    loc_all_status:   "جميع الحالات",
    loc_verified_f:   "موثق",
    loc_pending_f:    "قيد الانتظار",
    loc_col_name:     "الاسم",
    loc_col_cat:      "الفئة",
    loc_col_creator:  "المنشئ",
    loc_col_rating:   "التقييم",
    loc_col_status:   "الحالة",
    loc_col_added:    "تاريخ الإضافة",
    loc_col_actions:  "الإجراءات",
    loc_empty:        "لا توجد مواقع",
    loc_verify:       "توثيق",
    loc_unverify:     "إلغاء التوثيق",
    loc_del_title:    "حذف الموقع",
    loc_del_desc:     "حذف \"{{name}}\" نهائياً؟ سيتم إزالة جميع التقييمات والبلاغات والصور.",

    usr_title:       "المستخدمون",
    usr_subtitle:    "{{n}} مستخدم مسجل",
    usr_search:      "البحث باسم المستخدم أو البريد الإلكتروني…",
    usr_col_user:    "المستخدم",
    usr_col_type:    "النوع",
    usr_col_locs:    "المواقع",
    usr_col_reviews: "التقييمات",
    usr_col_role:    "الدور",
    usr_col_joined:  "تاريخ الانضمام",
    usr_col_actions: "الإجراءات",
    usr_empty:       "لا يوجد مستخدمون",
    usr_admin:       "مدير",
    usr_user:        "مستخدم",
    usr_del_title:   "حذف المستخدم",
    usr_del_desc:    "حذف \"{{username}}\" ({{email}})؟ سيتم إزالة جميع مواقعه وتقييماته.",

    rev_title:       "التقييمات",
    rev_subtitle:    "{{n}} تقييم إجمالي",
    rev_col_loc:     "الموقع",
    rev_col_user:    "المستخدم",
    rev_col_rating:  "التقييم",
    rev_col_comment: "التعليق",
    rev_col_date:    "التاريخ",
    rev_col_actions: "الإجراءات",
    rev_empty:       "لا توجد تقييمات بعد",
    rev_no_comment:  "لا يوجد تعليق",
    rev_del_title:   "حذف التقييم",
    rev_del_desc:    "حذف تقييم \"{{user}}\" على \"{{location}}\"؟ لا يمكن التراجع.",

    rep_title:       "البلاغات",
    rep_subtitle:    "{{n}} بلاغ إجمالي",
    rep_col_loc:     "الموقع",
    rep_col_reporter:"المُبلِّغ",
    rep_col_reason:  "السبب",
    rep_col_desc:    "الوصف",
    rep_col_status:  "الحالة",
    rep_col_date:    "التاريخ",
    rep_col_actions: "الإجراءات",
    rep_empty:       "لا توجد بلاغات — كل شيء على ما يرام",
    rep_no_desc:     "لا يوجد وصف",
    rep_resolved:    "تم الحل",
    rep_open:        "مفتوح",
    rep_resolve:     "حل",
    rep_del_title:   "حذف البلاغ",
    rep_del_desc:    "حذف بلاغ \"{{reporter}}\"؟ سيتم إزالته نهائياً.",

    ai_title:       "تحليل الذكاء الاصطناعي",
    ai_subtitle:    "مدعوم بـ Gemma 4 — يحلل بيانات المنصة ويولد توصيات",
    ai_card_title:  "تحليل منصة Gemma 4",
    ai_card_desc:   "يرسل إحصائيات منصتك إلى Gemma 4 ويستقبل تحليلاً كاملاً مع توصيات قابلة للتنفيذ.",
    ai_run:         "تشغيل التحليل",
    ai_regen:       "إعادة التوليد",
    ai_analyzing:   "جاري تحليل بيانات المنصة…",
    ai_last_gen:    "آخر توليد: {{time}}",
    ai_err_title:   "فشل التحليل",
    ai_analysis:    "تحليل المنصة",
    ai_recs:        "التوصيات",
    ai_empty:       "انقر على الزر أعلاه لتشغيل أول تحليل",

    common_cancel: "إلغاء",
    common_delete: "حذف",
    common_rev_per_abbr: "تقييم",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function translate(
  lang: Lang,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  let text = (translations[lang][key] ?? translations.en[key]) as string;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`{{${k}}}`, String(v));
    });
  }
  return text;
}

// ─── Enum label maps ─────────────────────────────────────────────────────────
// Values come from the backend as raw English strings. These maps provide
// Arabic translations; English falls back to a capitalized/spaced form.

const CATEGORY_AR: Record<string, string> = {
  restaurant: "مطعم",
  government:  "حكومي",
  park:        "حديقة",
  shopping:    "تسوق",
  healthcare:  "رعاية صحية",
  education:   "تعليم",
  hotels:      "فنادق",
  mosque:      "مسجد",
  library:     "مكتبة",
  gym:         "صالة رياضية",
  pharmacy:    "صيدلية",
};

const USER_TYPE_AR: Record<string, string> = {
  individual:   "فرد",
  organization: "مؤسسة",
};

const REPORT_REASON_AR: Record<string, string> = {
  "Inaccurate Information": "معلومات غير دقيقة",
  "Location Closed/Moved": "الموقع مغلق / انتقل",
  "Inappropriate Content":  "محتوى غير لائق",
  "Safety Issue":           "مشكلة أمنية",
  "Other":                  "أخرى",
};

function toEnLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

export function localizeCategory(lang: Lang, value: string): string {
  return lang === "ar" ? (CATEGORY_AR[value] ?? value) : toEnLabel(value);
}

export function localizeUserType(lang: Lang, value: string): string {
  return lang === "ar" ? (USER_TYPE_AR[value] ?? value) : toEnLabel(value);
}

export function localizeReportReason(lang: Lang, value: string): string {
  return lang === "ar" ? (REPORT_REASON_AR[value] ?? value) : value;
}
