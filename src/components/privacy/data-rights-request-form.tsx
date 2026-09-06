'use client';

import { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Espelha `DATA_REQUEST_TYPES` do domínio (LGPD Art. 18). */
const REQUEST_TYPES = [
  { value: 'EXPORT', label: 'Exportar meus dados (acesso)' },
  { value: 'PORTABILITY', label: 'Portabilidade dos dados' },
  { value: 'RECTIFICATION', label: 'Corrigir dados incorretos' },
  { value: 'DELETION', label: 'Excluir meus dados' },
] as const;

type RequestType = (typeof REQUEST_TYPES)[number]['value'];

interface DataRequestResult {
  referenceCode: string;
  type: RequestType;
  status: string;
  slaDueAt: string;
  emailVerificationRequired: boolean;
}

interface DataRightsRequestFormProps {
  /** E-mail pré-preenchido (titular autenticado). Editável quando ausente. */
  defaultEmail?: string;
  /** Quando true, o titular está autenticado e o e-mail é somente leitura. */
  emailLocked?: boolean;
}

const ENDPOINT = '/api/v1/privacy/data-requests';

export function DataRightsRequestForm({
  defaultEmail = '',
  emailLocked = false,
}: DataRightsRequestFormProps) {
  const [type, setType] = useState<RequestType>('EXPORT');
  const [email, setEmail] = useState(defaultEmail);
  const [correction, setCorrection] = useState('');
  const [message, setMessage] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<DataRequestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!privacyAccepted) {
      setError('É necessário aceitar a política de privacidade para abrir o pedido.');
      return;
    }

    let correctionPayload: Record<string, string> | undefined;
    if (type === 'RECTIFICATION') {
      const trimmed = correction.trim();
      if (!trimmed) {
        setError('Descreva os dados que precisam ser corrigidos.');
        return;
      }
      correctionPayload = { details: trimmed };
    }

    setIsSubmitting(true);
    try {
      const response = await apiClient.post<{ data: DataRequestResult | null; error: string | null }>(
        ENDPOINT,
        {
          type,
          channel: 'WEB_PORTAL',
          requesterEmail: email,
          message: message.trim() || undefined,
          correctionPayload,
          privacyAccepted: true,
        },
      );

      if (response.data) {
        setResult(response.data);
        toast.success('Pedido registrado com sucesso.');
      }
    } catch (err) {
      const messageText =
        err instanceof ApiError ? err.message : 'Erro ao registrar o pedido. Tente novamente.';
      setError(messageText);
      toast.error(messageText);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Estado de sucesso ──────────────────────────────────────────────────
  if (result) {
    return (
      <div data-testid="form-data-rights-success" className="bg-card border border-border rounded-2xl p-6 shadow-sm" role="status">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Pedido registrado</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Guarde o código de referência abaixo para acompanhar o andamento.
        </p>
        <p className="mt-3 font-mono text-lg text-foreground">{result.referenceCode}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {result.emailVerificationRequired
            ? 'Enviamos um e-mail de confirmação. Confirme pelo link para que o pedido seja processado.'
            : 'Pedido em processamento.'}{' '}
          Prazo de atendimento até {new Date(result.slaDueAt).toLocaleDateString('pt-BR')}.
        </p>
      </div>
    );
  }

  // ─── Formulário ─────────────────────────────────────────────────────────
  return (
    <form data-testid="form-data-rights" onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
      <div className="space-y-2">
        <Label htmlFor="dsr-type">Tipo de solicitação</Label>
        <Select value={type} onValueChange={(value) => setType(value as RequestType)}>
          <SelectTrigger id="dsr-type" data-testid="form-data-rights-type-select">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {REQUEST_TYPES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dsr-email">E-mail</Label>
        <Input
          id="dsr-email"
          data-testid="form-data-rights-email-input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          readOnly={emailLocked}
          required
          placeholder="voce@exemplo.com"
        />
        <p className="text-xs text-muted-foreground">
          {emailLocked
            ? 'Usaremos o e-mail da sua conta para confirmar a solicitação.'
            : 'Enviaremos um link de verificação para este e-mail antes de processar.'}
        </p>
      </div>

      {type === 'RECTIFICATION' && (
        <div className="space-y-2">
          <Label htmlFor="dsr-correction">Dados a corrigir</Label>
          <Textarea
            id="dsr-correction"
            data-testid="form-data-rights-correction-input"
            value={correction}
            onChange={(event) => setCorrection(event.target.value)}
            placeholder="Descreva quais informações estão incorretas e os valores corretos."
            rows={4}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="dsr-message">Mensagem (opcional)</Label>
        <Textarea
          id="dsr-message"
          data-testid="form-data-rights-message-input"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Algum detalhe adicional sobre o seu pedido."
          rows={3}
          maxLength={2000}
        />
      </div>

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          data-testid="form-data-rights-consent-checkbox"
          checked={privacyAccepted}
          onChange={(event) => setPrivacyAccepted(event.target.checked)}
          className="mt-1"
        />
        <span>
          Declaro que sou o titular dos dados (ou represento legalmente) e aceito a política de
          privacidade.
        </span>
      </label>

      {error && (
        <p data-testid="form-data-rights-error" className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" data-testid="form-data-rights-submit-button" disabled={isSubmitting} className="gap-2">
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Enviar solicitação
      </Button>
    </form>
  );
}
