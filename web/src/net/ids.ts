// newClientMsgId devuelve un UUID v4 para el chat (S2-10 y S3-04).
// crypto.randomUUID solo existe en contextos seguros (https o
// localhost); en el laboratorio se juega por http://<ip>, así que se
// arma con crypto.getRandomValues, que sí está siempre.
export function newClientMsgId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; // versión 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
