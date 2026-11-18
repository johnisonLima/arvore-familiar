import type { LayoutNode } from '../layout/tree';
import type { PersonId } from '../domain/types';

export type NavigationDirection = 'left' | 'right' | 'up' | 'down';

interface Point {
  x: number;
  y: number;
}

const center = (node: LayoutNode): Point => ({
  x: node.cardX + node.cardWidth / 2,
  y: node.cardY + node.cardHeight / 2,
});

/**
 * Navegação espacial entre cartões visíveis.
 *
 * A distância no eixo principal pesa menos que o desvio perpendicular, então
 * `→` prefere o cartão mais à direita na mesma linha em vez de um muito
 * distante e ligeiramente acima.
 */
export function findDirectionalNode(
  nodes: readonly LayoutNode[],
  currentId: PersonId,
  direction: NavigationDirection,
): PersonId | null {
  const current = nodes.find((node) => node.personId === currentId);
  if (!current) return null;
  const from = center(current);

  let bestId: PersonId | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of nodes) {
    if (candidate.personId === currentId) continue;
    const to = center(candidate);
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    const primary = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
    const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);

    // Exige um deslocamento real no eixo escolhido.
    if (primary < 4) continue;

    const score = primary + secondary * 2.4;
    if (score < bestScore) {
      bestScore = score;
      bestId = candidate.personId;
    }
  }

  return bestId;
}
