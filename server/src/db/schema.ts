import { pgTable, serial, text, timestamp, boolean, pgEnum, integer, jsonb } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "MANAGER", "HOSPITAL_ADMIN", "USER"]);
export const taskStatusEnum = pgEnum("task_status", ["PENDING", "IN_PROGRESS", "ON_HOLD", "COMPLETED"]);

export const clients = pgTable("clients", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    driveFolderId: text("drive_folder_id"),
    telegramChatId: text("telegram_chat_id"),
    telegramInviteCode: text("telegram_invite_code"),
    telegramConnectedAt: timestamp("telegram_connected_at"),
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
    clientId: integer("client_id").references(() => clients.id),
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
    authorId: integer("author_id").references(() => users.id),
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
    assigneeId: integer("assignee_id").references(() => users.id),
    authorId: integer("author_id").references(() => users.id),
    templateId: integer("template_id").references(() => taskTemplates.id),
    clientId: integer("client_id").references(() => clients.id),
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
    authorId: integer("author_id").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const taskResponses = pgTable("task_responses", {
    id: serial("id").primaryKey(),
    taskId: integer("task_id").references(() => tasks.id).notNull(),
    submitterId: integer("submitter_id").references(() => users.id),
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
    clientId: integer("client_id").references(() => clients.id).notNull(),
    keywords: jsonb("keywords").$type<string[]>(), // nullable: 플레이스 템플릿은 키워드 불필요
    monitoringScope: jsonb("monitoring_scope").notNull().$type<string[]>(),
    searchType: text("search_type").default("latest").notNull(),
    dateRange: integer("date_range").default(7).notNull(),
    collectCount: integer("collect_count").default(10).notNull(),
    crawlingMethod: text("crawling_method").default("api").notNull(),
    targetPlaces: jsonb("target_places").$type<Array<{ platform: string; url: string; name?: string }>>(),
    targetCafes: jsonb("target_cafes").$type<Array<{ url: string; name?: string }>>(),
    scheduleEnabled: boolean("schedule_enabled").default(false).notNull(),
    scheduleCron: text("schedule_cron"), // cron expression, 예: '0 9 * * *' (매일 9시)
    scheduleLastRunAt: timestamp("schedule_last_run_at"),
    isActive: boolean("is_active").default(true).notNull(),
    analysisMode: text("analysis_mode").default("FULL").notNull(),
    notifyEnabled: boolean("notify_enabled").default(false).notNull(),
    notifyChannels: jsonb("notify_channels").$type<string[]>().default(["telegram"]),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const monitoringResults = pgTable("monitoring_results", {
    id: serial("id").primaryKey(),
    templateId: integer("template_id").references(() => monitoringTemplates.id).notNull(),
    clientId: integer("client_id").references(() => clients.id).notNull(),
    status: monitoringStatusEnum("status").default("PENDING").notNull(),
    posts: jsonb("posts").$type<any[]>(),
    statistics: jsonb("statistics"),
    summary: text("summary"),
    executionTimeMs: integer("execution_time_ms"),
    errorLog: jsonb("error_log"),
    retryCount: integer("retry_count").default(0).notNull(),
    driveFileId: text("drive_file_id"), // 구글 드라이브 HTML 보고서 파일 ID
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ===== 알림 시스템 =====

export const notificationLogs = pgTable("notification_logs", {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").references(() => clients.id),
    channel: text("channel").default("telegram").notNull(),
    messageType: text("message_type").default("monitoring").notNull(),
    content: text("content").notNull(),
    status: text("status").default("sent").notNull(),
    errorMessage: text("error_message"),
    templateId: integer("template_id").references(() => monitoringTemplates.id),
    resultId: integer("result_id").references(() => monitoringResults.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
