// Escenario de 1920 × 1080 de los diseños v3: cada pantalla se maqueta en
// ese lienzo y se escala a la ventana, igual que las maquetas.
export const STAGE_W = 1920;
export const STAGE_H = 1080;

export function stageScale(width: number, height: number): number {
  return Math.min(width / STAGE_W, height / STAGE_H);
}
