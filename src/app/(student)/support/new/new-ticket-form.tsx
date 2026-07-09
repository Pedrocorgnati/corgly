'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ROUTES } from '@/lib/constants/routes';
import { apiClient, ApiError } from '@/lib/api-client';
import { revalidateSupport } from '@/actions/support';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  SUPPORT_TICKET_PRIORITIES,
} from '@/lib/support/ticket.schema';

/**
 * ST-38: formulário de abertura de chamado.
 *
 * Os campos de texto (assunto/prioridade/mensagem) são validados no client com
 * o MESMO contrato do boundary da API (espelha `createTicketSchema`), dando
 * feedback imediato. Os anexos são coletados como `File` e convertidos no
 * descritor sanitizado que a API persiste no manifest (filename/mimeType/
 * sizeBytes). O binário em si é resolvido pela camada de upload (Asset): a
 * linkagem durável Asset<->SupportMessage chega em T-067; aqui enviamos o
 * manifest, coerente com o que a rota POST aceita hoje.
 */

const PRIORITY_OPTIONS: { value: (typeof SUPPORT_TICKET_PRIORITIES)[number]; label: string }[] = [
  { value: 'LOW', label: 'Baixa' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'Alta' },
  { value: 'URGENT', label: 'Urgente' },
];

const formSchema = z.object({
  subject: z.string().trim().min(3, 'Assunto muito curto.').max(200, 'Assunto muito longo.'),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES),
  message: z.string().trim().min(1, 'Mensagem obrigatória.').max(10_000, 'Mensagem muito longa.'),
});

type FormValues = z.infer<typeof formSchema>;

const ACCEPT_ATTR = ALLOWED_ATTACHMENT_MIME_TYPES.join(',');

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface CreatedTicket {
  id: string;
}

export function NewTicketForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onBlur',
    defaultValues: { subject: '', priority: 'NORMAL', message: '' },
  });

  // RHF registra `priority` por register; o Select (base-ui) e controlado e
  // espelha o valor via setValue (mesmo padrao de register-form.tsx).
  register('priority');
  const priority = watch('priority');

  const handleAddFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);

    setAttachments((current) => {
      const next = [...current];
      for (const file of incoming) {
        if (next.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
          toast.error(`Máximo de ${MAX_ATTACHMENTS_PER_MESSAGE} anexos por chamado.`);
          break;
        }
        if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.type as never)) {
          toast.error(`"${file.name}": tipo de arquivo não suportado.`);
          continue;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          toast.error(`"${file.name}" excede o limite de 10 MiB.`);
          continue;
        }
        if (next.some((f) => f.name === file.name && f.size === file.size)) {
          continue;
        }
        next.push(file);
      }
      return next;
    });

    // Permite re-selecionar o mesmo arquivo após remover.
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((current) => current.filter((_, i) => i !== index));
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = {
        subject: values.subject,
        priority: values.priority,
        message: values.message,
        attachments: attachments.map((file) => ({
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        })),
      };

      const created = await apiClient.post<{ data: CreatedTicket }>(
        '/api/v1/support/tickets',
        payload,
      );

      await revalidateSupport();
      toast.success('Chamado aberto! Nossa equipe vai responder por aqui.');
      router.push(ROUTES.SUPPORT);
      router.refresh();

      return created;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'RATE_LIMITED') {
          toast.error('Muitas solicitações. Tente novamente em alguns minutos.');
        } else {
          toast.error(err.message);
        }
        return;
      }
      toast.error('Não foi possível abrir o chamado. Tente novamente.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="subject">Assunto</Label>
        <Input
          id="subject"
          placeholder="Ex.: Não consigo entrar na minha aula"
          aria-invalid={!!errors.subject}
          {...register('subject')}
        />
        {errors.subject && (
          <p className="text-xs text-destructive">{errors.subject.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="priority">Prioridade</Label>
        <Select
          value={priority}
          onValueChange={(v) =>
            setValue('priority', v as FormValues['priority'], {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
        >
          <SelectTrigger id="priority" aria-invalid={!!errors.priority} className="w-full">
            <SelectValue placeholder="Selecione a prioridade" />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.priority && (
          <p className="text-xs text-destructive">{errors.priority.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="message">Mensagem</Label>
        <Textarea
          id="message"
          rows={6}
          placeholder="Descreva o que aconteceu com o máximo de detalhes possível."
          aria-invalid={!!errors.message}
          {...register('message')}
        />
        {errors.message && (
          <p className="text-xs text-destructive">{errors.message.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Anexos (opcional)</Label>
        <p className="text-xs text-muted-foreground">
          Até {MAX_ATTACHMENTS_PER_MESSAGE} arquivos, 10 MiB cada. Imagens, PDF ou texto.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={(e) => handleAddFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
          Adicionar anexo
        </Button>

        {attachments.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {attachments.map((file, index) => (
              <li
                key={`${file.name}-${file.size}`}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-foreground">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatBytes(file.size)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remover ${file.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting} className="gap-1.5">
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? 'Enviando...' : 'Abrir chamado'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isSubmitting}
          onClick={() => router.push(ROUTES.SUPPORT)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
