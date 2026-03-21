import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants/routes';

export const metadata: Metadata = {
  title: 'Termos de Uso',
};

export default function TermsPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Termos de Uso</h1>
          <p className="text-sm text-muted-foreground mt-2">Última atualização: março de 2026</p>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Aceitação dos Termos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Ao acessar e usar a plataforma Corgly, você concorda em cumprir e estar vinculado a estes Termos de Uso.
              Se você não concordar com qualquer parte destes termos, não poderá acessar o serviço.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Descrição do Serviço</h2>
            <p className="text-muted-foreground leading-relaxed">
              A Corgly é uma plataforma de aprendizado de português brasileiro com professor nativo,
              oferecendo aulas individuais ao vivo por videoconferência. Os créditos adquiridos são
              válidos por 6 meses a partir da data de compra.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Conta de Usuário</h2>
            <p className="text-muted-foreground leading-relaxed">
              Você é responsável por manter a confidencialidade da sua conta e senha e por restringir
              o acesso ao seu computador. Você concorda em aceitar responsabilidade por todas as
              atividades que ocorram em sua conta.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Política de Cancelamento</h2>
            <p className="text-muted-foreground leading-relaxed">
              Cancelamentos devem ser realizados com no mínimo 24 horas de antecedência. Cancelamentos
              com menos de 24 horas resultarão na dedução do crédito correspondente. Não haverá
              reembolso de créditos por sessões não canceladas com antecedência.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Pagamentos e Reembolsos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Todos os pagamentos são processados com segurança via Stripe. Os créditos não são
              reembolsáveis após a compra, exceto em casos de erros de cobrança comprovados.
              Créditos expiram 6 meses após a data de compra.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Conduta do Usuário</h2>
            <p className="text-muted-foreground leading-relaxed">
              Você concorda em usar o serviço apenas para fins legais e de maneira que não infrinja
              os direitos de terceiros. É proibido gravar as aulas sem o consentimento explícito do professor.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Contato</h2>
            <p className="text-muted-foreground leading-relaxed">
              Para dúvidas sobre estes Termos de Uso, entre em contato conosco através do suporte disponível na plataforma.
            </p>
          </section>
        </div>

        <div className="mt-8 pt-6 border-t border-border">
          <Link href={ROUTES.PRIVACY} className="text-primary text-sm font-medium hover:underline mr-4">
            Política de Privacidade
          </Link>
          <Link href={ROUTES.HOME} className="text-muted-foreground text-sm hover:underline">
            ← Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
