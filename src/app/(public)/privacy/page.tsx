import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants/routes';

export const metadata: Metadata = {
  title: 'Política de Privacidade',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Política de Privacidade</h1>
          <p className="text-sm text-muted-foreground mt-2">Última atualização: março de 2026</p>
        </div>

        <div className="space-y-6 text-foreground">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Dados que Coletamos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Coletamos informações que você nos fornece diretamente, como nome, email, país e fuso horário
              ao criar sua conta. Durante o uso do serviço, coletamos dados sobre suas sessões de aula,
              feedback e histórico de pagamentos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Uso dos Dados</h2>
            <p className="text-muted-foreground leading-relaxed">
              Utilizamos seus dados para: fornecer e melhorar o serviço, processar pagamentos,
              enviar notificações sobre suas aulas, e comunicações de marketing (mediante consentimento).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Compartilhamento de Dados</h2>
            <p className="text-muted-foreground leading-relaxed">
              Não vendemos seus dados pessoais. Compartilhamos dados apenas com prestadores de
              serviços necessários para operar a plataforma (Stripe para pagamentos, serviços de
              videoconferência para aulas), sempre sob acordos de proteção de dados.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              Usamos cookies essenciais para manter sua sessão autenticada e cookies de análise
              (mediante consentimento) para entender como a plataforma é utilizada. Você pode
              gerenciar suas preferências de cookies a qualquer momento.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Seus Direitos (LGPD/GDPR)</h2>
            <p className="text-muted-foreground leading-relaxed">
              Você tem o direito de: acessar seus dados, corrigir informações incorretas, solicitar
              a exclusão da sua conta, exportar seus dados, e revogar consentimentos.
              Para exercer seus direitos, acesse as configurações da sua conta ou entre em contato com o suporte.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Segurança</h2>
            <p className="text-muted-foreground leading-relaxed">
              Implementamos medidas técnicas e organizacionais para proteger seus dados, incluindo
              criptografia em trânsito (HTTPS) e em repouso, e autenticação por JWT com tokens de curta duração.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Contato</h2>
            <p className="text-muted-foreground leading-relaxed">
              Para questões relacionadas à privacidade ou para exercer seus direitos, entre em contato
              através do suporte na plataforma ou pelo email de contato disponível na página principal.
            </p>
          </section>
        </div>

        <div className="mt-8 pt-6 border-t border-border">
          <Link href={ROUTES.TERMS} className="text-primary text-sm font-medium hover:underline mr-4">
            Termos de Uso
          </Link>
          <Link href={ROUTES.HOME} className="text-muted-foreground text-sm hover:underline">
            ← Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
