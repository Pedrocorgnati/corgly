'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Trash2, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';
import { Button } from '@/components/ui/button';
import { DeleteAccountModal } from '@/components/auth/delete-account-modal';

export function LgpdSection() {
  // Ate 2026-09-07 esta copy era portugues cravado e ignorava o idioma escolhido
  // pelo usuario.
  const t = useTranslations('auth.lgpd');
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      await apiClient.post(API.AUTH.EXPORT_DATA, {});
      toast.success(t('exportRequestedToast'), { duration: 6000 });
    } catch {
      toast.error(t('exportErrorToast'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div data-testid="profile-lgpd-section" className="bg-card border border-border rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">{t('title')}</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        {t('desc')}
      </p>

      <div className="space-y-4">
        {/* Export data */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{t('exportTitle')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('exportDesc')}
            </p>
          </div>
          <Button
            data-testid="profile-lgpd-export-button"
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
            {t('exportButton')}
          </Button>
        </div>

        <div className="border-t border-border" />

        {/* Delete account */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-destructive">{t('deleteTitle')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('deleteDesc')}
            </p>
          </div>
          <Button
            data-testid="profile-lgpd-delete-account-button"
            variant="destructive"
            size="sm"
            className="gap-2"
            onClick={() => setIsDeleteModalOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            {t('deleteButton')}
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
