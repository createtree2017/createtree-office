import { pgTable, serial, text, timestamp, boolean, pgEnum, integer, jsonb, date } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "MANAGER", "HOSPITAL_ADMIN", "USER"]);
export const taskStatusEnum = pgEnum("task_status", ["PENDING", "IN_PROGRESS", "ON_HOLD", "COMPLETED"]);

export const clients = pgTable("clients", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    driveFolderId: text("drive_folder_id"),
    telegramChatId: text("telegram_chat_id"),
    telegramInviteCode: text("telegram_invite_code"),
    telegramConnectedAt: timestamp("telegram_connected_at"),
    contractEndedAt: timestamp("contract_ended_at"),      // 계약종료 일시 (null = 활성)
    contractStartDate: date("contract_start_date"),        // 계약시작일
    contractEndDate: date("contract_end_date"),            // 계약만료일
    contractFileDriveId: text("contract_file_drive_id"),  // 계약서 Drive 파일 ID
    contractFileName: text("contract_file_name"),          // 계약서 원본 파일명
    businessRegDriveId: text("business_reg_drive_id"),    // 사업자등록증 Drive 파일 ID
    businessRegFileName: text("business_reg_file_name"),   // 사업자등록증 원본 파일명
    linkedQuotationId: integer("linked_quotation_id"),      // 수동 연결된 견적서 ID
    linkedContractId: integer("linked_contract_id"),        // 수동 연결된 계약서 ID
    sortOrder: integer("sort_order").default(0).notNull(), // 수동 정렬 순서
    deletedAt: timestamp("deleted_at"),                    // 거래처 삭제 일시 (null=활성, not null=삭제됨)
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    password: text("password").notNull(),
    name: text("name").notNull(),
    thumbnail: text("thumbnail"), // 프로필 이미지 용도 (Base64)
    role: userRoleEnum("role").default("USER").notNull(),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
    isApproved: boolean("is_approved").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const manuals = pgTable("manuals", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    categoryId: text("category_id"),
    parentId: integer("parent_id"), // 자기 참조를 위해 references(() => manuals.id)는 타입 문제로 생략하거나 수동 관리
    type: text("type").default("PAGE").notNull(), // PAGE | FOLDER
    icon: text("icon"),
    order: integer("order").default(0).notNull(),
    authorId: integer("author_id").references(() => users.id, { onDelete: "set null" }),
    minRoleToEdit: userRoleEnum("min_role_to_edit").default("MANAGER").notNull(),
    googleFormId: text("google_form_id"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").default("PENDING").notNull(),
    dueDate: timestamp("due_date"),
    assigneeId: integer("assignee_id").references(() => users.id, { onDelete: "set null" }),
    authorId: integer("author_id").references(() => users.id, { onDelete: "set null" }),
    templateId: integer("template_id").references(() => taskTemplates.id, { onDelete: "set null" }),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }),
    driveFolderId: text("drive_folder_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const formSubmissions = pgTable("form_submissions", {
    id: serial("id").primaryKey(),
    googleRowIndex: integer("google_row_index").notNull(),
    formId: text("form_id").notNull(),
    submittedData: jsonb("submitted_data").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const responseStatusEnum = pgEnum("response_status", ["DRAFT", "SUBMITTED"]);

export const taskTemplates = pgTable("task_templates", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    formSchema: jsonb("form_schema").notNull(), // 질문 항목 배열 (JSON)
    authorId: integer("author_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 거래처-서비스 계약 (거래처 ↔ 업무템플릿 N:M)
export const clientServiceContracts = pgTable("client_service_contracts", {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
    templateId: integer("template_id").references(() => taskTemplates.id, { onDelete: "cascade" }).notNull(),
    driveFolderId: text("drive_folder_id"), // 생성된 드라이브 템플릿 폴더 ID
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const taskResponses = pgTable("task_responses", {
    id: serial("id").primaryKey(),
    taskId: integer("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
    submitterId: integer("submitter_id").references(() => users.id, { onDelete: "set null" }),
    responseData: jsonb("response_data").notNull(), // 임시저장 및 제출 데이터 (JSON)
    status: responseStatusEnum("status").default("DRAFT").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ===== 모니터링 시스템 =====

export const monitoringStatusEnum = pgEnum("monitoring_status", ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]);

export const monitoringTemplates = pgTable("monitoring_templates", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    templateType: text("template_type").default("integrated").notNull(), // integrated | place
    clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
    keywords: jsonb("keywords").$type<string[]>(), // nullable: 플레이스 템플릿은 키워드 불필요
    monitoringScope: jsonb("monitoring_scope").notNull().$type<string[]>(),
    searchType: text("search_type").default("latest").notNull(),
    dateRange: integer("date_range").default(7).notNull(),
    collectCount: integer("collect_count").default(10).notNull(),
    crawlingMethod: text("crawling_method").default("api").notNull(),
    targetPlaces: jsonb("target_places").$type<Array<{ platform: string; url: string; name?: string; sortOrder?: string }>>(),
    targetCafes: jsonb("target_cafes").$type<Array<{ url: string; name?: string }>>(),
    scheduleEnabled: boolean("schedule_enabled").default(false).notNull(),
    scheduleCron: text("schedule_cron"), // cron expression, 예: '0 9 * * *' (매일 9시)
    scheduleLastRunAt: timestamp("schedule_last_run_at"),
    isActive: boolean("is_active").default(true).notNull(),
    analysisMode: text("analysis_mode").default("FULL").notNull(),
    notifyEnabled: boolean("notify_enabled").default(false).notNull(),
    notifyChannels: jsonb("notify_channels").$type<string[]>().default(["telegram"]),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const monitoringResults = pgTable("monitoring_results", {
    id: serial("id").primaryKey(),
    templateId: integer("template_id").references(() => monitoringTemplates.id, { onDelete: "set null" }),
    templateName: text("template_name"), // 삭제된 템플릿 이름 보존용
    clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
    status: monitoringStatusEnum("status").default("PENDING").notNull(),
    posts: jsonb("posts").$type<any[]>(),
    statistics: jsonb("statistics"),
    summary: text("summary"),
    executionTimeMs: integer("execution_time_ms"),
    errorLog: jsonb("error_log"),
    retryCount: integer("retry_count").default(0).notNull(),
    driveFileId: text("drive_file_id"), // 구글 드라이브 HTML 보고서 파일 ID
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ===== 알림 시스템 =====

export const notificationLogs = pgTable("notification_logs", {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }),
    channel: text("channel").default("telegram").notNull(),
    messageType: text("message_type").default("monitoring").notNull(),
    content: text("content").notNull(),
    status: text("status").default("sent").notNull(),
    errorMessage: text("error_message"),
    templateId: integer("template_id").references(() => monitoringTemplates.id, { onDelete: "set null" }),
    resultId: integer("result_id").references(() => monitoringResults.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ===== 서비스 상품 마스터 시스템 =====

export const billingTypeEnum = pgEnum("billing_type", [
    "monthly",       // 월정액
    "per_event",     // 건당
    "one_time",      // 일회성
    "quote_based",   // 견적 기반 (문의/컨설팅)
]);

export const priceUnitEnum = pgEnum("price_unit", [
    "per_month",     // 월 단위
    "per_event",     // 회 단위
    "per_person",    // 인당
    "per_item",      // 건당
    "one_time",      // 일회성
]);

export const itemCategoryEnum = pgEnum("item_category", [
    "fixed",         // 고정비 (필수)
    "variable",      // 변동비 (선택/실적 기반)
]);

// 서비스 상품
export const services = pgTable("services", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    billingType: billingTypeEnum("billing_type").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    metadata: jsonb("metadata"), // 서비스별 추가 설정 (JSON)
    linkedTaskTemplateId: integer("linked_task_template_id")
        .references(() => taskTemplates.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 서비스 등급/구간 (예: 10~20명, 1~5명)
export const serviceTiers = pgTable("service_tiers", {
    id: serial("id").primaryKey(),
    serviceId: integer("service_id")
        .references(() => services.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    minQuantity: integer("min_quantity"),
    maxQuantity: integer("max_quantity"),
    sortOrder: integer("sort_order").default(0).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 비용 항목 (예: 운영비, 상품비용, 유튜브 롱폼)
export const serviceItems = pgTable("service_items", {
    id: serial("id").primaryKey(),
    serviceId: integer("service_id")
        .references(() => services.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: itemCategoryEnum("category").notNull(),
    isRequired: boolean("is_required").default(true).notNull(),
    priceUnit: priceUnitEnum("price_unit").notNull(),
    unitLabel: text("unit_label"), // "월", "회", "명", "건"
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 등급별 가격 (항목 × 등급 교차. tierId=null이면 전 등급 공통 단가)
export const serviceItemPrices = pgTable("service_item_prices", {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
        .references(() => serviceItems.id, { onDelete: "cascade" }).notNull(),
    tierId: integer("tier_id")
        .references(() => serviceTiers.id, { onDelete: "cascade" }),
    price: integer("price").notNull(), // 만원 단위
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 계약 할인 정책 (회사 전체 정책)
export const contractDiscountPolicies = pgTable("contract_discount_policies", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    minMonths: integer("min_months").notNull(),
    discountType: text("discount_type").default("percentage").notNull(), // 'percentage' | 'fixed_amount'
    discountRate: integer("discount_rate").notNull(), // percentage: 백분율(5=5%), fixed_amount: 만원 단위
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ===== 견적서 시스템 =====

export const quotationStatusEnum = pgEnum("quotation_status", [
    "draft",       // 초안
    "proposed",    // 제안중
    "approved",    // 승인
]);

export const paymentMethodEnum = pgEnum("payment_method", [
    "lump_sum",       // 일괄 결제
    "installment",    // 분할 결제 (계약기간 월할)
    "monthly_settle", // 월말 실적 정산
]);

// 견적서
export const quotations = pgTable("quotations", {
    id: serial("id").primaryKey(),
    quotationNumber: text("quotation_number").notNull().unique(), // QT-YYYYMMDD-NNN
    clientId: integer("client_id")
        .references(() => clients.id, { onDelete: "cascade" }).notNull(),
    title: text("title").notNull(),
    contractMonths: integer("contract_months").notNull(), // 계약 기간 (개월)
    discountPolicyId: integer("discount_policy_id")
        .references(() => contractDiscountPolicies.id, { onDelete: "set null" }),
    discountApplied: boolean("discount_applied").default(false).notNull(),
    subtotal: integer("subtotal").default(0).notNull(),       // 할인 전 총액 (만원)
    discountAmount: integer("discount_amount").default(0).notNull(), // 할인 금액 (만원)
    totalAmount: integer("total_amount").default(0).notNull(), // 최종 금액 (만원)
    monthlyAmount: integer("monthly_amount").default(0).notNull(), // 월 청구 금액 (만원)
    notes: text("notes"),
    status: quotationStatusEnum("status").default("draft").notNull(),
    validUntil: date("valid_until"),
    createdBy: integer("created_by")
        .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 견적 항목 (가격 시점 보존 — 서비스명/등급명/단가를 별도 저장)
export const quotationItems = pgTable("quotation_items", {
    id: serial("id").primaryKey(),
    quotationId: integer("quotation_id")
        .references(() => quotations.id, { onDelete: "cascade" }).notNull(),
    serviceId: integer("service_id").references(() => services.id, { onDelete: "set null" }),
    serviceName: text("service_name").notNull(), // 시점 보존
    tierId: integer("tier_id"),
    tierName: text("tier_name"),
    itemId: integer("item_id"),
    itemName: text("item_name").notNull(),
    itemCategory: text("item_category").notNull(), // fixed / variable
    itemPriceUnit: text("item_price_unit").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    unitPrice: integer("unit_price").notNull(), // 만원 단위
    amount: integer("amount").notNull(), // quantity * unitPrice
    isRequired: boolean("is_required").default(true).notNull(),
    paymentMethod: paymentMethodEnum("payment_method"), // null이면 기본 월정산
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 견적 내 서비스별 설정 (서비스 단위 메타 정보)
export const quotationServiceConfigs = pgTable("quotation_service_configs", {
    id: serial("id").primaryKey(),
    quotationId: integer("quotation_id")
        .references(() => quotations.id, { onDelete: "cascade" }).notNull(),
    serviceId: integer("service_id").references(() => services.id, { onDelete: "set null" }),
    serviceName: text("service_name").notNull(),
    billingType: text("billing_type").notNull(),
    selectedTierId: integer("selected_tier_id"),
    selectedTierName: text("selected_tier_name"),
    eventFrequency: text("event_frequency"), // 예: "2개월1회", "월1회"
    eventPaymentMethod: paymentMethodEnum("event_payment_method"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ===== 계약서 시스템 =====

export const contractStatusEnum = pgEnum("contract_status", [
    "draft",       // 초안
    "signed",      // 서명 완료
    "active",      // 활성 (진행 중)
    "expired",     // 만료
    "terminated",  // 해지
]);

// 계약서
export const contracts = pgTable("contracts", {
    id: serial("id").primaryKey(),
    contractNumber: text("contract_number").notNull().unique(), // CT-YYYYMMDD-NNN
    quotationId: integer("quotation_id")
        .references(() => quotations.id, { onDelete: "set null" }),
    clientId: integer("client_id")
        .references(() => clients.id, { onDelete: "cascade" }).notNull(),
    title: text("title").notNull(),
    contractMonths: integer("contract_months").notNull(), // 0 = 단건
    startDate: date("start_date"),
    endDate: date("end_date"),
    subtotal: integer("subtotal").default(0).notNull(),
    discountAmount: integer("discount_amount").default(0).notNull(),
    totalAmount: integer("total_amount").default(0).notNull(),
    monthlyAmount: integer("monthly_amount").default(0).notNull(),
    notes: text("notes"),
    commonTerms: text("common_terms"),     // 공통 계약 내용
    specialTerms: text("special_terms"),   // 업체별 특별 조항
    status: contractStatusEnum("status").default("draft").notNull(),
    signedAt: timestamp("signed_at"),
    createdBy: integer("created_by")
        .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
