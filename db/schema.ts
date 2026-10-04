import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  shortcode: text('shortcode').notNull(),
  sourceUrl: text('source_url').notNull(),
  status: text('status').notNull(),
  error: text('error'),
  failedStage: text('failed_stage'),
  containerId: text('container_id'),
  mediaId: text('media_id'),
  objectKey: text('object_key'),
  videoToken: text('video_token').notNull(),
  publishAttempted: integer('publish_attempted').notNull().default(0),
  leaseId: text('lease_id'),
  leaseUntil: integer('lease_until').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  pollAfter: integer('poll_after').notNull().default(0),
  processingStarted: integer('processing_started'),
  cleanupPending: integer('cleanup_pending').notNull().default(0),
}, t => [uniqueIndex('jobs_shortcode_unique').on(t.shortcode)]);
export const tokenState = sqliteTable('token_state', {
  id: integer('id').primaryKey(), ciphertext: text('ciphertext').notNull(),
  fingerprint: text('fingerprint').notNull(), expiresAt: integer('expires_at').notNull(),
  refreshedAt: integer('refreshed_at').notNull(),
});
export const accessAttempts = sqliteTable('access_attempts', {
  id: text('id').primaryKey(), window: integer('window').notNull(),
  attempts: integer('attempts').notNull(), updatedAt: integer('updated_at').notNull(),
});
