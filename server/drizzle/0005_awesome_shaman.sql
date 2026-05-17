ALTER TYPE "public"."sales_status" ADD VALUE IF NOT EXISTS 'blacklisted' BEFORE 'unsubscribed';
