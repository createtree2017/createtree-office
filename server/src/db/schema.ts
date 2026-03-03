import { pgTable, serial, text, timestamp, boolean, pgEnum, integer } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "MANAGER", "USER"]);
export const taskStatusEnum = pgEnum("task_status", ["PENDING", "IN_PROGRESS", "ON_HOLD", "COMPLETED"]);

export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    password: text("password").notNull(),
    name: text("name").notNull(),
    role: userRoleEnum("role").default("USER").notNull(),
    isApproved: boolean("is_approved").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const manuals = pgTable("manuals", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    categoryId: text("category_id"),
    authorId: serial("author_id").references(() => users.id),
    minRoleToEdit: userRoleEnum("min_role_to_edit").default("MANAGER").notNull(),
    version: serial("version").default(1).notNull(),
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
