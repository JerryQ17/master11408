-- These triggers extend the generated auth schema; WebAuthn verification remains in Better Auth.
CREATE UNIQUE INDEX passkey_credential_unique ON passkey(credential_id);
--> statement-breakpoint
CREATE TRIGGER passkey_requires_authorization BEFORE INSERT ON passkey
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM registration_authorizations r
    JOIN user_access a ON a.user_id = r.user_id
    LEFT JOIN enrollment_invites i ON i.id = r.invite_id
    WHERE r.credential_id = NEW.credential_id AND r.user_id = NEW.user_id
      AND r.auth_epoch = a.auth_epoch
      AND r.expires_at > CAST(unixepoch('subsecond') * 1000 AS INTEGER)
      AND (
        (r.invite_id IS NULL AND a.status = 'active') OR
        (i.target_user_id = NEW.user_id AND i.auth_epoch = a.auth_epoch
          AND i.consumed_at IS NULL AND i.revoked_at IS NULL
          AND i.expires_at > CAST(unixepoch('subsecond') * 1000 AS INTEGER)
          AND ((i.purpose = 'enrollment' AND a.status = 'active') OR
               (i.purpose = 'recovery' AND a.status = 'recovery_pending')))
      )
  ) THEN RAISE(ABORT, 'PASSKEY_AUTHORIZATION_INVALID') END;
END;
--> statement-breakpoint
CREATE TRIGGER passkey_complete_enrollment AFTER INSERT ON passkey
BEGIN
  UPDATE enrollment_invites SET
    consumed_at = CAST(unixepoch('subsecond') * 1000 AS INTEGER),
    consumed_passkey_id = NEW.id
  WHERE id = (SELECT invite_id FROM registration_authorizations WHERE credential_id = NEW.credential_id);

  DELETE FROM passkey WHERE user_id = NEW.user_id AND id != NEW.id
    AND EXISTS (
      SELECT 1 FROM registration_authorizations r JOIN enrollment_invites i ON i.id = r.invite_id
      WHERE r.credential_id = NEW.credential_id AND i.purpose = 'recovery'
    );

  UPDATE user_access SET status = 'active', updated_at = CAST(unixepoch('subsecond') * 1000 AS INTEGER)
    WHERE user_id = NEW.user_id;

  INSERT INTO auth_audit_events (id,target_user_id,action,actor,created_at,details_json)
    VALUES (lower(hex(randomblob(16))),NEW.user_id,'passkey_registered',NEW.user_id,
      CAST(unixepoch('subsecond') * 1000 AS INTEGER),json_object('passkeyId',NEW.id));

  DELETE FROM registration_authorizations WHERE credential_id = NEW.credential_id;
END;
--> statement-breakpoint
CREATE TRIGGER passkey_keep_last BEFORE DELETE ON passkey
WHEN (SELECT status FROM user_access WHERE user_id = OLD.user_id) = 'active'
  AND (SELECT count(*) FROM passkey WHERE user_id = OLD.user_id) <= 1
BEGIN
  SELECT RAISE(ABORT, 'LAST_PASSKEY_REQUIRED');
END;
--> statement-breakpoint
CREATE TRIGGER session_epoch_guard BEFORE INSERT ON session
WHEN NOT EXISTS (
  SELECT 1 FROM user_access WHERE user_id = NEW.user_id
    AND status = 'active' AND auth_epoch = NEW.auth_epoch
)
BEGIN
  SELECT RAISE(ABORT, 'SESSION_EPOCH_INVALID');
END;
