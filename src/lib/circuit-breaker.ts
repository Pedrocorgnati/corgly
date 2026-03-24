/**
 * Circuit Breaker — prevenção de cascading failures.
 *
 * Estados:
 *   CLOSED    — operação normal; falhas são contadas.
 *   OPEN      — falhas superaram threshold; requests são rejeitadas imediatamente.
 *   HALF_OPEN — após timeout, uma request de teste é permitida para verificar recuperação.
 *
 * Uso:
 *   const breaker = getCircuitBreaker('resend-email', { failureThreshold: 5 });
 *   const result = await breaker.execute(() => fetch(...));
 */

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  failureThreshold: number;  // falhas consecutivas para abrir
  successThreshold: number;  // sucessos em half-open para fechar
  timeoutMs: number;         // ms em OPEN antes de tentar half-open
  fallback?: () => unknown;  // retorno quando OPEN sem fallback lança erro
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  successThreshold: 2,
  timeoutMs: 30_000,
};

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;

  constructor(
    public readonly name: string,
    private readonly options: CircuitBreakerOptions,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed < this.options.timeoutMs) {
        if (this.options.fallback) {
          return this.options.fallback() as T;
        }
        throw new Error(`Circuit breaker [${this.name}] is OPEN — service unavailable.`);
      }
      this.state = 'HALF_OPEN';
      this.successes = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      if (this.options.fallback) {
        return this.options.fallback() as T;
      }
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.options.successThreshold) {
        this.state = 'CLOSED';
        this.successes = 0;
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successes = 0;

    if (this.failures >= this.options.failureThreshold) {
      this.state = 'OPEN';
      console.warn(`[circuit-breaker] ${this.name} OPEN após ${this.failures} falhas.`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  name: string,
  options?: Partial<CircuitBreakerOptions>,
): CircuitBreaker {
  if (!breakers.has(name)) {
    breakers.set(name, new CircuitBreaker(name, { ...DEFAULT_OPTIONS, ...options }));
  }
  return breakers.get(name)!;
}
