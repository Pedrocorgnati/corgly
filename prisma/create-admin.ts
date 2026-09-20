/**
 * Cria usuario admin inicial para migrations.
 * Executar uma vez: npx tsx prisma/create-admin.ts
 */

import { PrismaClient, UserRole, SupportedLanguage } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
  });

  if (existingAdmin) {
    console.log(`Admin ja existe: ${existingAdmin.email}`);
    return;
  }

  const passwordHash = await hash('Admin123!', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@corgly.app',
      passwordHash,
      name: 'Admin',
      role: UserRole.ADMIN,
      timezone: 'America/Sao_Paulo',
      preferredLanguage: SupportedLanguage.PT_BR,
      emailConfirmed: true,
    },
  });

  console.log(`Admin criado: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });