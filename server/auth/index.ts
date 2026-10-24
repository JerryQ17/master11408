import { betterAuth } from 'better-auth';
import { APIError, getSessionFromCtx } from 'better-auth/api';
import { passkey } from '@better-auth/passkey';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import type { Bindings } from '../env';
import { sessionFields } from '../../shared/auth-config';
import { consumeLimit, forbidden, readAccess, readInvite } from './access';

export function createAuth(env: Bindings) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error('BETTER_AUTH_SECRET is not configured; run pnpm setup:local');
  }
  let verifiedEpoch: number | undefined;
  return betterAuth({
    appName: '11408 Study',
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.AUTH_BASE_URL,
    trustedOrigins: [env.AUTH_BASE_URL],
    database: drizzleAdapter(drizzle(env.DB, { schema }), {
      provider: 'sqlite',
      schema,
      transaction: false,
    }),
    emailAndPassword: { enabled: false },
    session: {
      additionalFields: sessionFields,
      cookieCache: { enabled: false },
      expiresIn: 60 * 60 * 24 * 7,
    },
    advanced: {
      useSecureCookies: env.AUTH_BASE_URL.startsWith('https://'),
      ipAddress: {
        ipAddressHeaders:
          env.AUTH_RP_ID === 'localhost' || env.AUTH_BASE_URL.includes('localhost')
            ? []
            : ['cf-connecting-ip'],
      },
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customStorage: { consume: (key, rule) => consumeLimit(env.DB, `auth:${key}`, rule) },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const access = await readAccess(env.DB, session.userId);
            if (
              access.status !== 'active' ||
              verifiedEpoch === undefined ||
              access.auth_epoch !== verifiedEpoch
            )
              forbidden();
            return { data: { ...session, authEpoch: verifiedEpoch } };
          },
        },
      },
    },
    plugins: [
      passkey({
        rpID: env.AUTH_RP_ID,
        rpName: '11408 Study',
        origin: env.AUTH_BASE_URL,
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        registration: {
          requireSession: false,
          resolveUser: async ({ context }) => {
            const invite = await readInvite(env.DB, context);
            return { id: invite.user_id, name: invite.email, displayName: invite.name };
          },
          afterVerification: async ({ ctx, context, user, verification }) => {
            const info = verification.registrationInfo;
            if (!info?.userVerified)
              throw new APIError('FORBIDDEN', { message: '需要验证设备上的 PIN 或生物识别' });
            const currentSession = await getSessionFromCtx(ctx);
            let inviteId: string | null = null;
            let access = await readAccess(env.DB, user.id);
            if (context) {
              if (currentSession) forbidden();
              const invite = await readInvite(env.DB, context);
              if (invite.user_id !== user.id) forbidden();
              inviteId = invite.id;
              access = invite;
            } else {
              // getSessionFromCtx resolves the Session during the official handler.
              if (
                !currentSession ||
                currentSession.user.id !== user.id ||
                access.status !== 'active' ||
                currentSession.session.authEpoch !== access.auth_epoch
              )
                forbidden();
            }
            verifiedEpoch = access.auth_epoch;
            await env.DB.batch([
              env.DB.prepare('DELETE FROM registration_authorizations WHERE expires_at <= ?').bind(
                Date.now(),
              ),
              env.DB.prepare(
                `INSERT INTO registration_authorizations (credential_id,user_id,invite_id,auth_epoch,expires_at)
              VALUES (?,?,?,?,?) ON CONFLICT(credential_id) DO UPDATE SET user_id=excluded.user_id,invite_id=excluded.invite_id,auth_epoch=excluded.auth_epoch,expires_at=excluded.expires_at`,
              ).bind(info.credential.id, user.id, inviteId, verifiedEpoch, Date.now() + 120000),
            ]);
          },
        },
        authentication: {
          afterVerification: async ({ verification, clientData }) => {
            if (!verification.authenticationInfo.userVerified) forbidden();
            const credential = await env.DB.prepare(
              'SELECT user_id FROM passkey WHERE credential_id = ?',
            )
              .bind(clientData.id)
              .first<{ user_id: string }>();
            if (!credential) forbidden();
            const access = await readAccess(env.DB, credential.user_id);
            if (access.status !== 'active') forbidden();
            verifiedEpoch = access.auth_epoch;
          },
        },
      }),
    ],
  });
}
