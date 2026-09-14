#!/usr/bin/env bash
# Teste de db_reachable (scripts/bootstrap.sh) com npx stubado pelo PATH.
# Casos: P1000, P1001, P1002, P1017, Prisma CLI ausente, DATABASE_URL ausente,
# banco em dia e banco com migration pendente. GAP-01 (loop 09-06), ST001.
# Uso: bash scripts/tests/db-reachable.test.sh   (exit 0 so com os 8 casos OK)
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

# Carrega so a funcao, sem executar o entrypoint do bootstrap.
eval "$(awk '/^db_reachable\(\) \{/{f=1} f{print} f&&/^\}/{exit}' scripts/bootstrap.sh)"
if ! declare -F db_reachable >/dev/null; then
  echo "FALHOU carga: db_reachable nao encontrada em scripts/bootstrap.sh"
  exit 1
fi

STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT

cat > "$STUB_DIR/npx" <<'STUB'
#!/usr/bin/env bash
# Stub de npx para o teste de db_reachable. Le STUB_CASO.
caso="${STUB_CASO:-}"
if [ "$caso" = "cli_ausente" ]; then
  echo "npm error could not determine executable to run" >&2
  exit 1
fi
for a in "$@"; do
  if [ "$a" = "--version" ]; then
    echo "prisma : 5.22.0"
    exit 0
  fi
done
if [[ " $* " == *" migrate status "* ]]; then
  case "$caso" in
    p1000) echo "Error: P1000: Authentication failed against database server at 127.0.0.1, the provided database credentials for ci are not valid."; exit 1 ;;
    p1001) echo "Error: P1001: Can't reach database server at 127.0.0.1:3306"; exit 1 ;;
    p1002) echo "Error: P1002: The database server at 127.0.0.1:3306 was reached but timed out."; exit 1 ;;
    p1017) echo "Error: P1017: Server has closed the connection."; exit 1 ;;
    env_ausente) echo "Error: Environment variable not found: DATABASE_URL."; exit 1 ;;
    em_dia) echo "Database schema is up to date!"; exit 0 ;;
    pendente)
      echo "Following migration have not yet been applied:"
      echo "20260914065547_canonical_timezone_setting_row"
      exit 1 ;;
  esac
fi
echo "stub npx: chamada inesperada (caso=$caso): $*" >&2
exit 1
STUB
chmod +x "$STUB_DIR/npx"
export PATH="$STUB_DIR:$PATH"

falhas=0
for par in p1000:1 p1001:1 p1002:1 p1017:1 cli_ausente:2 env_ausente:1 em_dia:0 pendente:0; do
  caso="${par%%:*}"
  esperado="${par##*:}"
  export STUB_CASO="$caso"
  if db_reachable; then rc=0; else rc=$?; fi
  if [ "$rc" = "$esperado" ]; then
    echo "OK $caso: rc=$rc"
  else
    echo "FALHOU $caso: esperado $esperado, obtido $rc"
    falhas=$((falhas + 1))
  fi
done

echo "RESULTADO: $falhas falha(s) em 8 casos"
[ "$falhas" -eq 0 ] || exit 1
exit 0
