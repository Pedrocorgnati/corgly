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
]);

export default eslintConfig;
