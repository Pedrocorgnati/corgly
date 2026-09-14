import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    /**
     * Prefixo `_` = descarte deliberado, nao esquecimento.
     *
     * Sem estes tres padroes, `no-unused-vars` acusa exatamente os casos em que
     * a variavel EXISTE para nao ser usada: parametro que so espelha a
     * assinatura de uma interface externa (o stub de `@upstash/redis` precisa
     * de `expire(_key, _seconds)` para casar com o contrato real), o idioma de
     * descarte por destructuring (`const { expiresAt: _e, ...signal } = row`) e
     * o `catch (_err)` que ignora o erro de proposito. Renomear com `_` e a
     * forma de DECLARAR a intencao; o linter passa a cobrar apenas o resto.
     */
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    /**
     * Debito de lint pre-existente: 29 erros em 13 arquivos legados, rebaixados
     * para warning por decisao do operador em 2026-09-09 (loop
     * 09-06-corgly-saas-agenda-google-bloqueio-ocupado, decisao pendente dos itens
     * 019/020, que travavam no gate `npm run lint` por causa destes arquivos).
     *
     * O rebaixamento e por arquivo E por regra: fora desta lista as mesmas regras
     * continuam erro, entao codigo novo segue barrado pelo gate. Corrigir um dos
     * arquivos abaixo permite remover a entrada correspondente desta lista.
     */
    files: [
      "scripts/trigger-cron.js",
      "src/components/admin/AnalyticsFunnel.tsx",
      "src/components/calendar/CancelConfirmDialog.tsx",
      "src/components/content/ContentResourcePanel.tsx",
      "src/components/credits/credit-expiry-alert.tsx",
      "src/components/dev/DataTestOverlay.tsx",
      "src/components/landing/language-flags.tsx",
      "src/components/session/VideoPanel.tsx",
      "src/components/shared/language-selector.tsx",
      "src/components/shared/public-footer.tsx",
      "src/hooks/useLandingLocale.ts",
      "src/hooks/useSessionTimer.ts",
      "src/hooks/useYjsProvider.ts",
    ],
    rules: {
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "prefer-const": "warn",
    },
  },
]);

export default eslintConfig;
