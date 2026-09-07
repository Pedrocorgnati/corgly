-- CreateTable support_tickets
CREATE TABLE `support_tickets` (
  `id`         VARCHAR(191) NOT NULL,
  `subject`    VARCHAR(200) NOT NULL,
  `status`     ENUM('OPEN','PENDING','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
  `priority`   ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  `userId`     VARCHAR(191) NULL,
  `sessionId`  VARCHAR(191) NULL,
  `resolvedAt` DATETIME(3) NULL,
  `createdAt`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`  DATETIME(3) NOT NULL,

  INDEX `support_tickets_status_priority_idx` (`status`, `priority`),
  INDEX `support_tickets_userId_idx` (`userId`),
  INDEX `support_tickets_sessionId_idx` (`sessionId`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable support_messages
CREATE TABLE `support_messages` (
  `id`         VARCHAR(191) NOT NULL,
  `ticketId`   VARCHAR(191) NOT NULL,
  `authorId`   VARCHAR(191) NULL,
  `authorRole` ENUM('STUDENT','ADMIN','SYSTEM') NOT NULL,
  `body`       TEXT NOT NULL,
  `isInternal` BOOLEAN NOT NULL DEFAULT false,
  `createdAt`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `support_messages_ticketId_createdAt_idx` (`ticketId`, `createdAt`),
  INDEX `support_messages_authorId_idx` (`authorId`),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey support_tickets.userId -> users.id
ALTER TABLE `support_tickets`
  ADD CONSTRAINT `support_tickets_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey support_tickets.sessionId -> sessions.id
ALTER TABLE `support_tickets`
  ADD CONSTRAINT `support_tickets_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `sessions`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey support_messages.ticketId -> support_tickets.id
ALTER TABLE `support_messages`
  ADD CONSTRAINT `support_messages_ticketId_fkey`
    FOREIGN KEY (`ticketId`) REFERENCES `support_tickets`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey support_messages.authorId -> users.id
ALTER TABLE `support_messages`
  ADD CONSTRAINT `support_messages_authorId_fkey`
    FOREIGN KEY (`authorId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
