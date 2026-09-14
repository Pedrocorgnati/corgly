/**
 * Migracao idempotente de LESSON_1_PARROT para o banco.
 *
 * Cria um Exercise com 8 ExerciseItem (MULTIPLE_CHOICE) e traducoes PT_BR/EN_US.
 * Usa upsert por internalTitle para ser idempotente.
 *
 * Ordem das alternativas: usa distributeQuestion() de answer-distribution.ts
 * (hash FNV-1a do id da questao) para preservar a ordem que o aluno ja ve.
 *
 * Execucao: npx tsx prisma/migrate-lesson-1-parrot.ts
 */

import {
  ExerciseItemKind,
  ExerciseStatus,
  Prisma,
  PrismaClient,
  SupportedLanguage,
  UserRole,
} from '@prisma/client';
import { LESSON_1_PARROT } from '../src/lib/exercises/lesson-1-parrot';
import { distributeQuestion } from '../src/lib/exercises/answer-distribution';
import { OPTION_LETTERS } from '../src/lib/exercises/types';

const prisma = new PrismaClient();

const INTERNAL_TITLE = 'O aluno que conversou com o papagaio';

async function findMigrationOwner() {
  // Busca o primeiro usuario admin (role ADMIN)
  const admin = await prisma.user.findFirst({
    where: {
      role: UserRole.ADMIN,
    },
  });

  if (admin) {
    console.log(`Usando usuario admin existente: ${admin.email}`);
    return admin.id;
  }

  // Se nao existe admin, tenta buscar qualquer usuario
  const anyUser = await prisma.user.findFirst();

  if (anyUser) {
    console.log(`Nenhum admin encontrado. Usando usuario existente: ${anyUser.email}`);
    return anyUser.id;
  }

  throw new Error(
    'Nenhum usuario encontrado no banco. Crie um usuario admin antes de rodar a migracao.'
  );
}

async function main() {
  console.log('Iniciando migracao de LESSON_1_PARROT...\n');

  const adminId = await findMigrationOwner();
  const publishedAt = new Date();

  const exercise = await prisma.$transaction(async (tx) => {
    const migratedExercise = await tx.exercise.upsert({
      where: { internalTitle: INTERNAL_TITLE },
      update: {
        supportLanguage: SupportedLanguage.PT_BR,
        level: LESSON_1_PARROT.level,
        status: ExerciseStatus.PUBLISHED,
        publishedAt,
      },
      create: {
        internalTitle: INTERNAL_TITLE,
        supportLanguage: SupportedLanguage.PT_BR,
        level: LESSON_1_PARROT.level,
        status: ExerciseStatus.PUBLISHED,
        publishedAt,
        createdById: adminId,
      },
    });

    const translations = [
      {
        locale: SupportedLanguage.PT_BR,
        title: LESSON_1_PARROT.title,
        summary: LESSON_1_PARROT.grammarPoint.explanation.pt,
      },
      {
        locale: SupportedLanguage.EN_US,
        title: 'The student who talked to the parrot',
        summary: LESSON_1_PARROT.grammarPoint.explanation.en,
      },
    ] as const;

    for (const translation of translations) {
      await tx.exerciseTranslation.upsert({
        where: {
          exerciseId_locale: {
            exerciseId: migratedExercise.id,
            locale: translation.locale,
          },
        },
        update: {
          title: translation.title,
          summary: translation.summary,
        },
        create: {
          exerciseId: migratedExercise.id,
          ...translation,
        },
      });
    }

    await tx.exerciseTranslation.deleteMany({
      where: {
        exerciseId: migratedExercise.id,
        locale: { notIn: translations.map(({ locale }) => locale) },
      },
    });

    const positions = LESSON_1_PARROT.questions.map((_, index) => index + 1);
    for (const [index, question] of LESSON_1_PARROT.questions.entries()) {
      const distributed = distributeQuestion(question);
      const correctIndex = OPTION_LETTERS.indexOf(distributed.correctLetter);
      if (correctIndex < 0) {
        throw new Error(`Gabarito invalido para a questao ${question.id}.`);
      }

      const payload: Prisma.InputJsonObject = {
        prompt: distributed.prompt,
        options: distributed.options.map(({ letter, text }) => ({ letter, text })),
      };
      const answerKey: Prisma.InputJsonObject = {
        correctIndex,
        correctLetter: distributed.correctLetter,
      };
      const item = {
        kind: ExerciseItemKind.MULTIPLE_CHOICE,
        payload,
        answerKey,
        acceptWithoutAccent: false,
        maxSeconds: null,
        promptAudioAssetId: null,
        answerAudioAssetId: null,
        imageAssetId: null,
        imageAlt: null,
      };

      await tx.exerciseItem.upsert({
        where: {
          exerciseId_position: {
            exerciseId: migratedExercise.id,
            position: index + 1,
          },
        },
        update: item,
        create: {
          exerciseId: migratedExercise.id,
          position: index + 1,
          ...item,
        },
      });
    }

    await tx.exerciseItem.deleteMany({
      where: {
        exerciseId: migratedExercise.id,
        position: { notIn: positions },
      },
    });

    return tx.exercise.findUniqueOrThrow({
      where: { internalTitle: INTERNAL_TITLE },
      include: { translations: true, items: true },
    });
  });

  console.log('Migracao concluida com sucesso!');
  console.log(`- Exercise ID: ${exercise.id}`);
  console.log(`- Internal Title: ${exercise.internalTitle}`);
  console.log(`- Level: ${exercise.level}`);
  console.log(`- Status: ${exercise.status}`);
  console.log(`- Items: ${exercise.items.length}`);
  console.log(`- Translations: ${exercise.translations.length}`);
}

main()
  .catch((e) => {
    console.error('Erro na migracao:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
