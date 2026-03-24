'use client';

import { useState } from 'react';
import { Download, Trash2, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';
import { Button } from '@/components/ui/button';
import { DeleteAccountModal } from '@/components/auth/delete-account-modal';

export function LgpdSection() {
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      await apiClient.post(API.AUTH.EXPORT_DATA, {});
      toast.success(
        'Solicitação de exportação recebida. Você receberá um email com seus dados em breve.',
        { duration: 6000 }
      );
    } catch {
      toast.error('Erro ao solicitar exportação. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Privacidade e dados (LGPD)</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Em conformidade com a LGPD e GDPR, você pode solicitar a exportação ou exclusão dos seus dados pessoais a qualquer momento.
      </p>

      <div className="space-y-4">
        {/* Export data */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Exportar meus dados</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Receba uma cópia de todos os dados associados à sua conta
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleExportData}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Exportar dados
          </Button>
        </div>

        <div className="border-t border-border" />

        {/* Delete account */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-destructive">Excluir minha conta</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Exclusão permanente com carência de 30 dias
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="gap-2"
            onClick={() => setIsDeleteModalOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            Excluir conta
          </Button>
        </div>
      </div>

      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
      />
    </div>
  );
}
