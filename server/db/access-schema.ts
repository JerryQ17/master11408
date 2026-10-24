import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth-schema';

export const userAccess = sqliteTable('user_access', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id),
  status: text('status', { enum: ['active', 'recovery_pending'] })
    .notNull()
    .default('active'),
  authEpoch: integer('auth_epoch').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});
export const enrollmentInvites = sqliteTable('enrollment_invites', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  targetUserId: text('target_user_id')
    .notNull()
    .references(() => user.id),
  purpose: text('purpose', { enum: ['enrollment', 'recovery'] }).notNull(),
  authEpoch: integer('auth_epoch').notNull(),
  expiresAt: integer('expires_at').notNull(),
  consumedAt: integer('consumed_at'),
  consumedPasskeyId: text('consumed_passkey_id'),
  revokedAt: integer('revoked_at'),
});
export const registrationAuthorizations = sqliteTable('registration_authorizations', {
  credentialId: text('credential_id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  inviteId: text('invite_id').references(() => enrollmentInvites.id),
  authEpoch: integer('auth_epoch').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
export const authAuditEvents = sqliteTable('auth_audit_events', {
  id: text('id').primaryKey(),
  targetUserId: text('target_user_id')
    .notNull()
    .references(() => user.id),
  action: text('action').notNull(),
  actor: text('actor').notNull(),
  createdAt: integer('created_at').notNull(),
  detailsJson: text('details_json').notNull().default('{}'),
});
