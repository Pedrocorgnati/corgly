// Este e o entrypoint de reconcile/recover/evidence da entrega de ebooks.
// Toda a logica vive em src/lib/ebooks/delivery-recovery.ts; aqui so ha casca.
// Sem top-level await: o pacote e CJS e o tsx compila este arquivo como CJS.
import { runEbooksDeliveryRecoveryCli } from '../src/lib/ebooks/delivery-recovery';

void runEbooksDeliveryRecoveryCli(process.argv.slice(2), {
  stdout: (line) => process.stdout.write(line + '\n'),
  stderr: (line) => process.stderr.write(line + '\n'),
}).then((code) => process.exit(code));
