-- Create session health domain for realtime operational observability
CREATE TABLE `session_health` (
  `id`                  VARCHAR(191) NOT NULL,
  `sessionId`           VARCHAR(191) NOT NULL,
  `participantId`       VARCHAR(191) NULL,
  `participantRole`     ENUM('STUDENT','ADMIN') NOT NULL,
  `eventType`           ENUM('METRIC_SNAPSHOT','CONNECTION_STATE','RECONNECT_ATTEMPT','RECONNECT_SUCCESS','RECONNECT_FAILED') NOT NULL DEFAULT 'METRIC_SNAPSHOT',
  `occurredAt`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `latencyMs`           INTEGER NULL,
  `jitterMs`            INTEGER NULL,
  `packetLossPercent`   DECIMAL(5, 2) NULL,
  `webrtcState`         ENUM('NEW','CHECKING','CONNECTED','COMPLETED','DISCONNECTED','FAILED','CLOSED') NOT NULL,
  `reconnectAttempt`    INTEGER NOT NULL DEFAULT 0,
  `reconnectReason`     VARCHAR(255) NULL,
  `reconnectSuccessful` BOOLEAN NULL,
  `metadata`            JSON NULL,
  `createdAt`           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `session_health_sessionId_occurredAt_idx` (`sessionId`, `occurredAt`),
  INDEX `session_health_sessionId_participantRole_occurredAt_idx` (`sessionId`, `participantRole`, `occurredAt`),
  INDEX `session_health_participantId_occurredAt_idx` (`participantId`, `occurredAt`),
  INDEX `session_health_webrtcState_occurredAt_idx` (`webrtcState`, `occurredAt`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `session_health`
  ADD CONSTRAINT `session_health_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `session_health`
  ADD CONSTRAINT `session_health_participantId_fkey`
    FOREIGN KEY (`participantId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
