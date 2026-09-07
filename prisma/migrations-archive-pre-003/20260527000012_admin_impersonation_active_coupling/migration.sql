-- AC2 fix: couple active-session state to the admin/student identity.
--
-- MySQL has no partial/filtered indexes, so single-active-session-per-admin is
-- enforced via a CHECK constraint (MySQL 8.0.16+) plus the existing UNIQUE
-- indexes on activeAdminKey/activeStudentKey. The CHECK pins the active keys to
-- the row's own adminId/studentId while the session is open and forces them NULL
-- once closed:
--   * open (endedAt IS NULL)  => activeAdminKey = adminId AND activeStudentKey = studentId
--   * closed (endedAt NOT NULL)=> activeAdminKey IS NULL AND activeStudentKey IS NULL
-- Because an open row must carry activeAdminKey = adminId, two open rows for the
-- same admin would collide on the UNIQUE index -> at most one active session per
-- admin (idem per student). NULLs do not collide, so any number of closed rows
-- coexist. endReason is required on close for an auditable end-state.
--
-- endedById is intentionally NOT forced NOT NULL: the endedBy FK is ON DELETE SET
-- NULL, so requiring it would make deleting the closing user violate the CHECK.
-- The auditable close-out is carried by endedAt + endReason.
ALTER TABLE `admin_impersonation_sessions`
  ADD CONSTRAINT `admin_impersonation_sessions_active_state_chk`
  CHECK (
    (
      `endedAt` IS NULL
      AND `activeAdminKey` = `adminId`
      AND `activeStudentKey` = `studentId`
      AND `endReason` IS NULL
      AND `endedById` IS NULL
    )
    OR
    (
      `endedAt` IS NOT NULL
      AND `activeAdminKey` IS NULL
      AND `activeStudentKey` IS NULL
      AND `endReason` IS NOT NULL
    )
  );
