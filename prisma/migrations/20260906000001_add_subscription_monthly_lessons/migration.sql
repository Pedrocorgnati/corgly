-- AddColumn: subscriptions.monthlyLessons (eixo canonico novo do plano de assinatura)
--
-- Volume mensal contratado (10 ou 20 aulas/mes), espelhando os planos publicos
-- da landing. NULL significa assinatura legada: continua precificada e creditada
-- por `weeklyFrequency`, que permanece NOT NULL e nao muda de semantica.
ALTER TABLE `subscriptions` ADD COLUMN `monthlyLessons` INTEGER NULL;
