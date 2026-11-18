import type { LayoutEdge, LayoutNode } from '../layout/tree';

/** Retângulo em coordenadas do mundo (unidades do layout). */
export interface WorldRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CameraView {
  x: number;
  y: number;
  z: number;
}

/**
 * Converte a câmera (translate + scale) no retângulo visível do mundo.
 * `margin` é em pixels de tela e vira margem em unidades do mundo.
 */
export function viewportRect(
  camera: CameraView,
  viewportWidth: number,
  viewportHeight: number,
  margin = 0,
): WorldRect {
  const zoom = camera.z > 0 ? camera.z : 1;
  const worldMargin = margin / zoom;
  return {
    left: -camera.x / zoom - worldMargin,
    top: -camera.y / zoom - worldMargin,
    right: (viewportWidth - camera.x) / zoom + worldMargin,
    bottom: (viewportHeight - camera.y) / zoom + worldMargin,
  };
}

export function unionRect(a: WorldRect, b: WorldRect): WorldRect {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

export function rectsIntersect(a: WorldRect, b: WorldRect): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

/** O bloco da pessoa contém cartão, barras e linhas de filhos. */
export function nodeInRect(node: LayoutNode, rect: WorldRect): boolean {
  return rectsIntersect(
    {
      left: node.x,
      top: node.y,
      right: node.x + node.width,
      bottom: node.y + node.height,
    },
    rect,
  );
}

export function edgeInRect(edge: LayoutEdge, rect: WorldRect, padding = 24): boolean {
  return rectsIntersect(
    {
      left: Math.min(edge.fromX, edge.toX) - padding,
      top: Math.min(edge.fromY, edge.toY) - padding,
      right: Math.max(edge.fromX, edge.toX) + padding,
      bottom: Math.max(edge.fromY, edge.toY) + padding,
    },
    rect,
  );
}
