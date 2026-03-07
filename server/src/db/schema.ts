import { pgTable, serial, text, timestamp, boolean, pgEnum, integer, jsonb } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "MANAGER", "HOSPITAL_ADMIN", "USER"]);
export const taskStatusEnum = pgEnum("task_status", ["PENDING", "IN_PROGRESS", "ON_HOLD", "COMPLETED"]);

export const clients = pgTable("clients", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    driveFolderId: text("drive_folder_id"),
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
