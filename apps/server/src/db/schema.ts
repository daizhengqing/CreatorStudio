import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  source: text('source').notNull(),
  sourceUrl: text('source_url'),
  relativePath: text('relative_path').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  duration: integer('duration'),
  width: integer('width'),
  height: integer('height'),
  hasAudio: integer('has_audio', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

export const downloadTasks = sqliteTable('download_tasks', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  platform: text('platform').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  resolution: integer('resolution'),
  status: text('status').notNull(),
  progress: integer('progress').notNull().default(0),
  error: text('error'),
  assetId: text('asset_id'),
  createdAt: integer('created_at').notNull(),
});

export const exportTasks = sqliteTable('export_tasks', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull(),
  status: text('status').notNull(),
  progress: integer('progress').notNull().default(0),
  outputFile: text('output_file'),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
});
