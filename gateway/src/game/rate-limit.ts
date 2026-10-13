// S2-08: límite de velocidad por WebSocket (patrón Gateway Offloading).
// Todo vive en memoria del gateway; match nunca se entera.

// Resultado de la revisión de un mensaje entrante:
// 'allow' pasa, 'warn' se descarta y se avisa, 'close' se descarta,
// se avisa y la conexión se cierra.
export type LimitOutcome = 'allow' | 'warn' | 'close';

// TokenBucket: capacidad fija que se recarga a refillPerSecond por
// segundo de reloj. El reloj se inyecta para probarlo sin esperar.
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.lastRefill = now();
  }

  // tryConsume gasta un token; devuelve false si no había y no deja
  // que la recarga acumule más que la capacidad.
  tryConsume(): boolean {
    const current = this.now();
    const elapsedMs = Math.max(0, current - this.lastRefill);
    this.lastRefill = current;
    const refilled = (elapsedMs / 1000) * this.refillPerSecond;
    this.tokens = Math.min(this.capacity, this.tokens + refilled);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

// FloodLimiter une el bucket con los avisos: después de maxWarnings
// mensajes descartados seguidos cierra la conexión (código 4008). Si
// pasa resetAfterMs sin descartar nada, los avisos se olvidan: tres
// ráfagas aisladas en una partida no desconectan a nadie.
export class FloodLimiter {
  private warnings = 0;
  private lastWarningAt: number | null = null;

  constructor(
    private readonly bucket: TokenBucket,
    private readonly maxWarnings: number,
    private readonly resetAfterMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(): LimitOutcome {
    if (this.bucket.tryConsume()) return 'allow';
    const current = this.now();
    if (
      this.lastWarningAt !== null &&
      current - this.lastWarningAt >= this.resetAfterMs
    ) {
      this.warnings = 0;
    }
    this.warnings += 1;
    this.lastWarningAt = current;
    return this.warnings >= this.maxWarnings ? 'close' : 'warn';
  }
}
