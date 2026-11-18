import { parentsOf, type FamilyGraph } from '../domain/graph';
import type { PersonId, Union } from '../domain/types';
import {
  buildTreeLayout,
  type LayoutEdge,
  type LayoutNode,
  type LayoutUnion,
  type TreeLayout,
} from '../layout/tree';
import { childCountLabel, firstName, initials, lifespan, unionMeta } from './format';
import {
  edgeInRect,
  nodeInRect,
  unionRect,
  viewportRect,
  type WorldRect,
} from './culling';
import { findDirectionalNode, type NavigationDirection } from './navigation';

const SVG_NS = 'http://www.w3.org/2000/svg';

const MIN_ZOOM = 0.16;
const MAX_ZOOM = 2.6;
const FIT_MAX_ZOOM = 1.35;
const COMPACT_MAX = 0.62;
const MEDIUM_MAX = 0.95;

/** Acima disso, só os cartões próximos da viewport viram DOM. */
const CULL_THRESHOLD = 120;
/** Margem de tela mantida renderizada além da borda. */
const CULL_MARGIN = 420;
const WHEEL_SETTLE_MS = 180;
const PERF_ENABLED = new URLSearchParams(window.location.search).has('debug');

export type GenerationsSetting = number | 'all';

export interface TreeViewState {
  rootId: PersonId;
  generations: GenerationsSetting;
}

export interface TreeViewOptions {
  rootId?: PersonId;
  generations?: GenerationsSetting;
  /** Chamado quando o usuário reenraíza ou muda o limite de gerações. */
  onStateChange?: (state: TreeViewState) => void;
  /** Abre/fecha o editor pelo botão do HUD, recebendo a raiz atual. */
  onToggleEditor?: (rootId: PersonId) => void;
  /** Clique num cartão enquanto o modo de edição está ativo. */
  onEditPerson?: (personId: PersonId) => void;
  /** Clique numa barra de união enquanto o modo de edição está ativo. */
  onEditUnion?: (unionId: string) => void;
}

export interface TreeView {
  setRoot(personId: PersonId): void;
  setGenerations(value: GenerationsSetting): void;
  setEditing(editing: boolean): void;
  updateGraph(graph: FamilyGraph): void;
  getState(): TreeViewState;
  focusEditButton(): void;
  home(): void;
  fit(): void;
  zoomBy(factor: number): void;
  destroy(): void;
}

interface Camera {
  x: number;
  y: number;
  z: number;
}

interface Flight {
  from: Camera;
  to: Camera;
  start: number;
  duration: number;
}

interface PointerPosition {
  x: number;
  y: number;
}

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const easeInOutCubic = (value: number): number =>
  value < 0.5 ? 4 * value * value * value : 1 - (-2 * value + 2) ** 3 / 2;

const edgePath = (edge: LayoutEdge): string => {
  const distance = Math.max(1, edge.toY - edge.fromY);
  const firstControl = edge.fromY + Math.max(20, distance * 0.44);
  const secondControl = edge.toY - Math.max(16, distance * 0.32);
  return `M ${edge.fromX} ${edge.fromY} C ${edge.fromX} ${firstControl}, ${edge.toX} ${secondControl}, ${edge.toX} ${edge.toY}`;
};

export function createTreeView(
  host: HTMLElement,
  initialGraph: FamilyGraph,
  options: TreeViewOptions = {},
): TreeView {
  let graph = initialGraph;
  let metaRootId = graph.data.meta.rootPersonId;
  let editing = false;
  let rootId =
    options.rootId && graph.persons.has(options.rootId) ? options.rootId : metaRootId;
  let generations: GenerationsSetting = options.generations ?? 'all';
  let layout: TreeLayout = buildLayout();

  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  host.classList.add('tree-app');
  host.replaceChildren();

  const skipLink = element('a', 'skip-link', 'Pular para a árvore');
  skipLink.href = '#tree-stage';

  const stage = element('div', 'tree-stage');
  stage.id = 'tree-stage';
  stage.tabIndex = 0;
  stage.setAttribute('role', 'region');
  stage.setAttribute('aria-label', 'Árvore familiar interativa');

  const dotsNear = element('div', 'tree-dots tree-dots--near');
  const dotsFar = element('div', 'tree-dots tree-dots--far');
  const world = element('div', 'tree-world');
  const vignette = element('div', 'tree-vignette');
  stage.append(dotsNear, dotsFar, world, vignette);

  const hud = element('header', 'hud');
  const eyebrow = element('p', 'hud__eyebrow', graph.data.meta.title);
  const name = element('h1', 'hud__name');
  const meta = element('p', 'hud__meta');
  const stats = element('p', 'hud__stats');
  const actions = element('div', 'hud__actions');

  const homeButton = element('button', 'hud__button', '⌂ Início');
  homeButton.type = 'button';
  homeButton.title = 'Voltar à raiz original';

  const parentsWrap = element('span', 'hud__parents');

  const generationsLabel = element('label', 'hud__label', 'Gerações');
  const generationsSelect = element('select', 'hud__select');
  for (const value of [2, 3, 4, 5]) {
    const option = element('option', undefined, String(value));
    option.value = String(value);
    generationsSelect.append(option);
  }
  const allOption = element('option', undefined, 'Todas');
  allOption.value = 'all';
  generationsSelect.append(allOption);
  generationsSelect.value = String(generations);
  generationsLabel.append(generationsSelect);

  const editButton = element('button', 'hud__button hud__button--edit', '✎ Editar');
  editButton.type = 'button';
  editButton.title = 'Editar pessoas, uniões e filhos';
  editButton.setAttribute('aria-pressed', 'false');
  editButton.hidden = !options.onToggleEditor;

  actions.append(homeButton, parentsWrap, editButton, generationsLabel);
  hud.append(eyebrow, name, meta, stats, actions);

  const controls = element('div', 'tree-controls');
  const zoomInButton = element('button', 'tree-control', '+');
  zoomInButton.type = 'button';
  zoomInButton.title = 'Aproximar';
  zoomInButton.setAttribute('aria-label', 'Aproximar');
  const zoomOutButton = element('button', 'tree-control', '−');
  zoomOutButton.type = 'button';
  zoomOutButton.title = 'Afastar';
  zoomOutButton.setAttribute('aria-label', 'Afastar');
  const fitButton = element('button', 'tree-control', '⤢');
  fitButton.type = 'button';
  fitButton.title = 'Enquadrar toda a árvore';
  fitButton.setAttribute('aria-label', 'Enquadrar toda a árvore');
  controls.append(zoomInButton, zoomOutButton, fitButton);

  const hint = element(
    'p',
    'tree-hint',
    'Role para aproximar · arraste para mover · setas navegam entre cartões · clique num cartão para reenraizar',
  );
  hint.id = 'tree-hint';
  stage.setAttribute('aria-describedby', hint.id);

  const announcer = element('p', 'sr-only');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');

  const perf = element('output', 'tree-perf');
  perf.hidden = !PERF_ENABLED;
  perf.setAttribute('aria-hidden', 'true');

  host.append(skipLink, stage, hud, controls, hint, announcer, perf);

  let cam: Camera = { x: 0, y: 0, z: 0.5 };
  let targetZoom = cam.z;
  let anchor: PointerPosition = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  };
  let flight: Flight | null = null;
  let frameRequest = 0;
  let hasInteracted = false;
  let hiddenHint = false;
  let hintTimer = 0;
  let swapTimer = 0;
  let settleTimer = 0;
  let cullTimer = 0;
  let cameraFrame = 0;
  let navFocusId: PersonId | null = rootId;
  let cameraMoving = false;

  const pointers = new Map<number, PointerPosition>();
  let dragDistance = 0;

  function buildLayout(): TreeLayout {
    return buildTreeLayout(graph, rootId, {
      maxGenerations: generations === 'all' ? undefined : generations,
    });
  }

  function personOf(personId: PersonId) {
    const person = graph.persons.get(personId);
    if (!person) throw new Error(`Pessoa não encontrada: ${personId}`);
    return person;
  }

  function unionOf(unionId: string): Union {
    const union = graph.unions.get(unionId);
    if (!union) throw new Error(`União não encontrada: ${unionId}`);
    return union;
  }

  function applyCamera(): void {
    world.style.transform = `translate3d(${cam.x}px, ${cam.y}px, 0) scale(${cam.z})`;

    const lod = cam.z < COMPACT_MAX ? 'compact' : cam.z < MEDIUM_MAX ? 'medium' : 'full';
    if (world.dataset.lod !== lod) world.dataset.lod = lod;

    const logarithmic = Math.log2(cam.z);
    const fraction = logarithmic - Math.floor(logarithmic);
    const nearSize = 48 * 2 ** fraction;
    const farSize = nearSize / 2;

    dotsNear.style.backgroundSize = `${nearSize}px ${nearSize}px`;
    dotsNear.style.backgroundPosition = `${cam.x % nearSize}px ${cam.y % nearSize}px`;
    dotsNear.style.opacity = String(1 - fraction);

    dotsFar.style.backgroundSize = `${farSize}px ${farSize}px`;
    dotsFar.style.backgroundPosition = `${cam.x % farSize}px ${cam.y % farSize}px`;
    dotsFar.style.opacity = String(fraction);
  }

  function requestFrame(): void {
    if (frameRequest === 0) frameRequest = window.requestAnimationFrame(tick);
  }

  function tick(now: number): void {
    frameRequest = 0;

    if (flight) {
      const { from, to, start, duration } = flight;
      const progress = duration <= 0 ? 1 : clamp((now - start) / duration, 0, 1);
      const eased = easeInOutCubic(progress);

      cam.z = from.z * (to.z / from.z) ** eased;
      cam.x = from.x + (to.x - from.x) * eased;
      cam.y = from.y + (to.y - from.y) * eased;
      targetZoom = cam.z;

      if (progress >= 1) {
        flight = null;
        cameraMoving = false;
        setMoving(false);
        scheduleCull();
      }
      applyCamera();
      if (flight) requestFrame();
      return;
    }

    const distance = Math.log(targetZoom / cam.z);
    if (Math.abs(distance) > 0.0005) {
      cameraMoving = true;
      const nextZoom = cam.z * Math.exp(distance * 0.22);
      const ratio = nextZoom / cam.z;
      cam.x = anchor.x - (anchor.x - cam.x) * ratio;
      cam.y = anchor.y - (anchor.y - cam.y) * ratio;
      cam.z = nextZoom;
      applyCamera();
      requestFrame();
    } else if (cameraMoving) {
      cameraMoving = false;
      setMoving(false);
      scheduleCull(WHEEL_SETTLE_MS);
    }
  }

  function flyTo(target: Camera, duration = 650): void {
    flight = { from: { ...cam }, to: target, start: performance.now(), duration };
    targetZoom = target.z;
    cameraMoving = true;
    setMoving(true);
    // Em árvores grandes, mantém renderizados os cartões do destino durante o voo.
    if (layout.nodes.length > CULL_THRESHOLD) renderWorld();
    requestFrame();
  }

  function computeFit(): Camera {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = Math.min(110, Math.max(40, Math.min(viewportWidth, viewportHeight) * 0.1));
    const zoom = clamp(
      Math.min(
        (viewportWidth - padding * 2) / layout.width,
        (viewportHeight - padding * 2) / layout.height,
        FIT_MAX_ZOOM,
      ),
      MIN_ZOOM,
      MAX_ZOOM,
    );

    return {
      x: (viewportWidth - layout.width * zoom) / 2,
      y: (viewportHeight - layout.height * zoom) / 2,
      z: zoom,
    };
  }

  function computeFocus(): Camera {
    const rootNode = layout.byId.get(layout.rootId);
    if (!rootNode) return computeFit();

    const fitZoom = computeFit().z;
    const zoom = clamp(Math.max(fitZoom, 0.95), MIN_ZOOM, 1.15);
    const centerX = rootNode.cardX + rootNode.cardWidth / 2;
    const centerY = rootNode.cardY + rootNode.cardHeight / 2;

    return {
      x: window.innerWidth / 2 - centerX * zoom,
      y: window.innerHeight * 0.38 - centerY * zoom,
      z: zoom,
    };
  }

  function focusRoot(animate = true): void {
    const target = computeFocus();
    hasInteracted = false;
    anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    if (animate && !prefersReducedMotion) {
      flyTo(target, 650);
    } else {
      flight = null;
      cam = { ...target };
      targetZoom = target.z;
      applyCamera();
      scheduleCull();
    }
  }

  function fit(animate = true): void {
    const target = computeFit();
    hasInteracted = false;
    anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    if (animate && !prefersReducedMotion) {
      flyTo(target, 650);
    } else {
      flight = null;
      cam = { ...target };
      targetZoom = target.z;
      applyCamera();
      scheduleCull();
    }
  }

  function zoomBy(factor: number): void {
    hideHint();
    hasInteracted = true;
    flight = null;
    setMoving(true);
    targetZoom = clamp(targetZoom * factor, MIN_ZOOM, MAX_ZOOM);
    anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    requestFrame();
  }

  function hideHint(): void {
    if (hiddenHint) return;
    hiddenHint = true;
    window.clearTimeout(hintTimer);
    hint.classList.add('is-hidden');
  }

  function swapTo(update: () => void): void {
    window.clearTimeout(swapTimer);
    host.classList.add('is-swapping');
    swapTimer = window.setTimeout(() => {
      update();
      host.classList.remove('is-swapping');
    }, 150);
  }

  function reRoot(personId: PersonId): void {
    if (!graph.persons.has(personId) || personId === rootId) return;
    hideHint();
    rootId = personId;
    navFocusId = personId;
    options.onStateChange?.({ rootId, generations });

    swapTo(() => {
      layout = buildLayout();
      renderWorld();
      updateHud();
      const target = computeFocus();
      flight = null;
      cam = { ...target };
      targetZoom = target.z;
      hasInteracted = false;
      anchor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      applyCamera();
      scheduleCull();
      announceRoot();
    });
  }

  function setGenerations(value: GenerationsSetting): void {
    if (value === generations) return;
    hideHint();
    generations = value;
    generationsSelect.value = String(value);
    options.onStateChange?.({ rootId, generations });
    layout = buildLayout();
    if (navFocusId && !layout.byId.has(navFocusId)) navFocusId = rootId;
    renderWorld();
    updateHud();
    focusRoot(false);
    scheduleCull();
    announceRoot();
  }

  function announceRoot(): void {
    const root = graph.persons.get(rootId);
    if (!root) return;
    const people = layout.nodes.length === 1 ? '1 pessoa' : `${layout.nodes.length} pessoas`;
    const unions = layout.unionCount === 1 ? '1 união' : `${layout.unionCount} uniões`;
    announce(`Raiz: ${root.name}. ${people}, ${unions}.`);
  }

  function setEditing(value: boolean): void {
    if (editing === value) return;
    editing = value;
    host.classList.toggle('is-editing', editing);
    editButton.textContent = editing ? '✓ Editando' : '✎ Editar';
    editButton.setAttribute('aria-pressed', String(editing));
    renderWorld();
    updateHud();
  }

  function updateGraph(nextGraph: FamilyGraph): void {
    const previousRoot = rootId;
    graph = nextGraph;
    metaRootId = graph.data.meta.rootPersonId;

    if (!graph.persons.has(rootId)) {
      const fallback = graph.persons.has(metaRootId)
        ? metaRootId
        : [...graph.persons.keys()].sort()[0];
      if (fallback) rootId = fallback;
    }

    if (!navFocusId || !graph.persons.has(navFocusId)) navFocusId = rootId;

    layout = buildLayout();
    renderWorld();
    updateHud();
    applyCamera();
    scheduleCull();
    options.onStateChange?.({ rootId, generations });
    if (rootId !== previousRoot) announceRoot();
  }

  function home(): void {
    if (rootId !== metaRootId) reRoot(metaRootId);
    else focusRoot(true);
  }

  function updateHud(): void {
    const root = personOf(rootId);
    name.textContent = root.name;

    const details = [lifespan(root), root.birthPlace].filter(Boolean);
    meta.textContent = details.join(' · ') || 'Sem datas registradas';

    const hiddenCount = layout.hiddenPeopleCount;
    const hidden =
      hiddenCount > 0
        ? ` · ${hiddenCount} não ${hiddenCount === 1 ? 'exibido' : 'exibidos'}`
        : '';
    const peopleLabel = layout.nodes.length === 1 ? '1 pessoa' : `${layout.nodes.length} pessoas`;
    const unionsLabel = layout.unionCount === 1 ? '1 união' : `${layout.unionCount} uniões`;
    const generationsLabelText =
      layout.generations === 1 ? '1 geração' : `${layout.generations} gerações`;
    stats.textContent = `${peopleLabel} · ${unionsLabel} · ${generationsLabelText}${hidden}`;

    parentsWrap.replaceChildren();
    const parents = parentsOf(graph, rootId);
    if (parents.length > 0) {
      const label = element('span', 'hud__parents-label', 'Subir');
      parentsWrap.append(label);
      for (const parent of parents) {
        const button = element('button', 'hud__button', `↑ ${firstName(parent.name)}`);
        button.type = 'button';
        button.title = `Reenraizar em ${parent.name}`;
        button.addEventListener('click', () => reRoot(parent.id));
        parentsWrap.append(button);
      }
    }
  }

  function renderWorld(): void {
    const started = PERF_ENABLED ? performance.now() : 0;
    const shouldCull = layout.nodes.length > CULL_THRESHOLD;
    const rect = shouldCull ? currentRenderRect() : null;
    const nodes = rect ? layout.nodes.filter((node) => nodeInRect(node, rect)) : layout.nodes;
    const edges = rect ? layout.edges.filter((edge) => edgeInRect(edge, rect)) : layout.edges;

    const active = document.activeElement;
    const previousFocus =
      active instanceof HTMLElement && world.contains(active)
        ? {
            personId: active.closest<HTMLElement>('[data-person-id]')?.dataset.personId ?? null,
            unionId: active.closest<HTMLElement>('[data-union-id]')?.dataset.unionId ?? null,
          }
        : null;
    const focusedPersonId = previousFocus?.personId ?? null;
    const focusedUnionId = previousFocus?.unionId ?? null;

    const child = document.createDocumentFragment();
    world.replaceChildren();
    world.style.width = `${layout.width}px`;
    world.style.height = `${layout.height}px`;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('tree-edges');
    svg.setAttribute('width', String(layout.width));
    svg.setAttribute('height', String(layout.height));
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute('aria-hidden', 'true');
    child.append(svg);

    for (const node of nodes) {
      for (const union of node.unions) {
        appendPath(
          svg,
          `M ${union.barX + union.barWidth / 2} ${union.barY} L ${union.barX + union.barWidth / 2} ${
            node.cardY + node.cardHeight
          }`,
          union.hue,
          false,
        );
      }
    }

    for (const edge of edges) {
      appendPath(svg, edgePath(edge), edge.hue, edge.dashed);
    }

    const cards = document.createDocumentFragment();
    for (const node of nodes) {
      if (node.personId === navFocusId) cards.append(renderCard(node, true));
      else cards.append(renderCard(node, false));
      for (const union of node.unions) {
        cards.append(renderUnionBar(union));
      }
    }
    world.append(child, cards);

    if (focusedPersonId && focusedPersonId !== navFocusId) navFocusId = focusedPersonId;
    if (navFocusId && !nodes.some((node) => node.personId === navFocusId)) {
      const fallback = nodes.find((node) => node.personId === rootId) ?? nodes[0];
      navFocusId = fallback?.personId ?? null;
    }
    updateRovingTabindex();

    // Nunca deixa o foco cair no <body> quando o elemento focado foi removido.
    if (previousFocus) {
      const restored = focusedPersonId
        ? focusPersonCard(focusedPersonId, true)
        : focusedUnionId
          ? focusUnionBar(focusedUnionId)
          : false;
      if (!restored) {
        if (navFocusId) focusPersonCard(navFocusId, true);
        else stage.focus({ preventScroll: true });
      }
    }

    world.dataset.visibleCards = String(nodes.length);
    world.dataset.totalCards = String(layout.nodes.length);

    if (PERF_ENABLED && perf) {
      const elapsed = performance.now() - started;
      perf.textContent = `render ${elapsed.toFixed(1)} ms · ${nodes.length}/${layout.nodes.length} cartões · zoom ${cam.z.toFixed(2)}`;
    }
  }

  /** Viewport atual, unida à do destino quando há uma animação de câmera. */
  function currentRenderRect(): WorldRect {
    const current = viewportRect(cam, window.innerWidth, window.innerHeight, CULL_MARGIN);
    if (!flight) return current;
    return unionRect(
      current,
      viewportRect(flight.to, window.innerWidth, window.innerHeight, CULL_MARGIN),
    );
  }

  function scheduleCull(delay = 0): void {
    window.clearTimeout(cullTimer);
    cullTimer = window.setTimeout(() => {
      cullTimer = 0;
      renderWorld();
    }, delay);
  }

  function setMoving(moving: boolean): void {
    host.classList.toggle('is-moving', moving);
  }

  function scheduleCamera(): void {
    if (cameraFrame) return;
    cameraFrame = window.requestAnimationFrame(() => {
      cameraFrame = 0;
      applyCamera();
    });
  }

  function announce(message: string): void {
    announcer.textContent = '';
    window.requestAnimationFrame(() => {
      announcer.textContent = message;
    });
  }

  function focusPersonCard(personId: PersonId, move: boolean): boolean {
    const card = world.querySelector<HTMLElement>(
      `[data-person-id="${CSS.escape(personId)}"]`,
    );
    if (!card) return false;
    if (move) card.focus({ preventScroll: true });
    return true;
  }

  function focusUnionBar(unionId: string): boolean {
    const bar = world.querySelector<HTMLElement>(`[data-union-id="${CSS.escape(unionId)}"]`);
    // Só devolve o foco se a barra continua sendo um controle acionável.
    if (!bar || !bar.hasAttribute('role')) return false;
    bar.focus({ preventScroll: true });
    return true;
  }

  function appendPath(svg: SVGSVGElement, path: string, hue: number, dashed: boolean): void {
    const elementPath = document.createElementNS(SVG_NS, 'path');
    elementPath.setAttribute('d', path);
    elementPath.setAttribute('stroke', `hsl(${hue} 58% 48%)`);
    elementPath.setAttribute('stroke-opacity', '0.42');
    elementPath.setAttribute('stroke-width', '2');
    if (dashed) elementPath.setAttribute('stroke-dasharray', '5 6');
    svg.append(elementPath);
  }

  function renderCard(node: LayoutNode, roving: boolean): HTMLElement {
    const person = personOf(node.personId);
    const isRoot = node.depth === 0;
    const years = lifespan(person);
    const details = [person.name, years, person.birthPlace, person.bio]
      .filter(Boolean)
      .join(' · ');

    const card = element('article', 'person-card');
    card.style.left = `${node.cardX}px`;
    card.style.top = `${node.cardY}px`;
    card.style.width = `${node.cardWidth}px`;
    card.style.height = `${node.cardHeight}px`;
    card.style.setProperty('--hue', String(node.hue));
    card.dataset.personId = person.id;
    card.tabIndex = roving ? 0 : -1;
    card.title = details;

    const avatar = element('div', 'person-card__avatar', initials(person.name));
    avatar.setAttribute('aria-hidden', 'true');

    const body = element('div', 'person-card__body');
    body.append(element('h2', 'person-card__name', person.name));

    if (years) body.append(element('p', 'person-card__dates', years));
    if (person.birthPlace) body.append(element('p', 'person-card__place', person.birthPlace));
    if (person.bio) body.append(element('p', 'person-card__bio', person.bio));

    card.append(avatar, body);

    if (isRoot) {
      card.classList.add('is-root');
      card.setAttribute('aria-current', 'true');
      card.append(element('span', 'person-card__badge', 'raiz'));
    }

    if (editing && options.onEditPerson) {
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Editar ${[person.name, years].filter(Boolean).join(', ')}`);
      card.title = `Editar ${person.name}`;
    } else if (isRoot) {
      card.setAttribute(
        'aria-label',
        `${[person.name, years, person.birthPlace].filter(Boolean).join(', ')}, raiz da árvore`,
      );
    } else {
      card.setAttribute('role', 'button');
      card.setAttribute(
        'aria-label',
        `Reenraizar a árvore em ${person.name}${years ? `, ${years}` : ''}`,
      );
    }

    card.addEventListener('focus', () => {
      navFocusId = person.id;
      updateRovingTabindex();
    });

    card.addEventListener('keydown', (event) => {
      const direction = arrowDirection(event.key);
      if (direction) {
        event.preventDefault();
        event.stopPropagation();
        moveFocus(direction);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        event.stopPropagation();
        navFocusId = rootId;
        if (!focusPersonCard(rootId, true)) {
          const first = world.querySelector<HTMLElement>('[data-person-id]');
          if (first?.dataset.personId) {
            navFocusId = first.dataset.personId;
            focusPersonCard(navFocusId, true);
          }
        }
        updateRovingTabindex();
        ensureCardVisible(navFocusId);
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (editing && options.onEditPerson) {
        options.onEditPerson(person.id);
      } else if (!isRoot) {
        reRoot(person.id);
      }
    });

    return card;
  }

  function arrowDirection(key: string): NavigationDirection | null {
    if (key === 'ArrowLeft') return 'left';
    if (key === 'ArrowRight') return 'right';
    if (key === 'ArrowUp') return 'up';
    if (key === 'ArrowDown') return 'down';
    return null;
  }

  function updateRovingTabindex(): void {
    if (!navFocusId) return;
    const cards = world.querySelectorAll<HTMLElement>('[data-person-id]');
    for (const card of cards) {
      card.tabIndex = card.dataset.personId === navFocusId ? 0 : -1;
    }
  }

  function moveFocus(direction: NavigationDirection): void {
    if (!navFocusId) return;
    const rendered = new Set(
      [...world.querySelectorAll<HTMLElement>('[data-person-id]')].map(
        (card) => card.dataset.personId ?? '',
      ),
    );
    const candidates = layout.nodes.filter((node) => rendered.has(node.personId));
    const next = findDirectionalNode(candidates, navFocusId, direction);
    if (!next) return;
    navFocusId = next;
    focusPersonCard(next, true);
    updateRovingTabindex();
    ensureCardVisible(next);
  }

  /** Move a câmera o mínimo necessário para o cartão não ficar sob as bordas. */
  function ensureCardVisible(personId: PersonId): void {
    const node = layout.byId.get(personId);
    if (!node) return;
    const margin = 72;
    const left = node.cardX * cam.z + cam.x;
    const top = node.cardY * cam.z + cam.y;
    const right = left + node.cardWidth * cam.z;
    const bottom = top + node.cardHeight * cam.z;

    let dx = 0;
    let dy = 0;
    if (left < margin) dx = margin - left;
    else if (right > window.innerWidth - margin) dx = window.innerWidth - margin - right;
    if (top < margin) dy = margin - top;
    else if (bottom > window.innerHeight - margin) dy = window.innerHeight - margin - bottom;

    if (dx === 0 && dy === 0) return;
    cam.x += dx;
    cam.y += dy;
    setMoving(true);
    applyCamera();
    scheduleCull(WHEEL_SETTLE_MS);
  }

  function renderUnionBar(union: LayoutUnion): HTMLElement {
    const unionData = unionOf(union.unionId);
    const bar = element('div', 'union-bar');
    bar.style.left = `${union.barX}px`;
    bar.style.top = `${union.barY}px`;
    bar.style.width = `${union.barWidth}px`;
    bar.style.height = `${union.barHeight}px`;
    bar.style.setProperty('--hue', String(union.hue));
    bar.dataset.unionId = union.unionId;

    const heart = element('span', 'union-bar__heart', '♥');
    heart.setAttribute('aria-hidden', 'true');

    const names = element('span', 'union-bar__names');
    if (union.partnerIds.length > 0) {
      union.partnerIds.forEach((partnerId, index) => {
        if (index > 0) names.append(document.createTextNode(' & '));
        const partner = personOf(partnerId);
        const label = element('span', 'union-bar__partner', partner.name);
        label.title = `Ver a árvore de ${partner.name}`;
        names.append(label);
      });
    } else {
      names.textContent = 'Filhos';
    }

    const onlyPartner = union.partnerIds.length === 1 ? union.partnerIds[0] : undefined;
    if (editing && options.onEditUnion) {
      bar.dataset.editUnion = union.unionId;
      bar.tabIndex = 0;
      bar.setAttribute('role', 'button');
      bar.setAttribute('aria-label', `Editar união de ${names.textContent || 'familiares'}`);
      bar.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        options.onEditUnion?.(union.unionId);
      });
    } else if (onlyPartner) {
      const partner = personOf(onlyPartner);
      bar.dataset.reroot = partner.id;
      bar.tabIndex = 0;
      bar.setAttribute('role', 'button');
      bar.setAttribute('aria-label', `Ver a árvore de ${partner.name}`);
      bar.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        reRoot(partner.id);
      });
    }

    const aside = element('span', 'union-bar__aside');
    const details = unionMeta(unionData);
    if (details) aside.append(element('span', 'union-bar__meta', details));
    if (union.childIds.length > 0) {
      const count = element('span', 'union-bar__count', String(union.childIds.length));
      count.title = childCountLabel(union.childIds.length);
      count.setAttribute('aria-label', childCountLabel(union.childIds.length));
      aside.append(count);
    }

    const partnerNames = union.partnerIds
      .map((partnerId) => personOf(partnerId).name)
      .join(' & ');
    bar.title = [
      partnerNames || 'Filhos',
      details,
      childCountLabel(union.childIds.length),
      union.hiddenChildCount > 0 && union.expanded
        ? `${union.hiddenChildCount} não exibidos`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');

    bar.append(heart, names, aside);
    return bar;
  }

  function pinch(): { distance: number; x: number; y: number } | null {
    if (pointers.size < 2) return null;
    const [first, second] = [...pointers.values()];
    if (!first || !second) return null;
    return {
      distance: Math.hypot(first.x - second.x, first.y - second.y) || 1,
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
  }

  function onPointerDown(event: PointerEvent): void {
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragDistance = 0;
    flight = null;
    targetZoom = cam.z;
    hasInteracted = true;
    setMoving(true);
    stage.classList.add('is-dragging');
    hideHint();
  }

  function onPointerMove(event: PointerEvent): void {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;

    if (pointers.size >= 2) {
      const before = pinch();
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      const after = pinch();
      if (!before || !after) return;

      const nextZoom = clamp(cam.z * (after.distance / before.distance), MIN_ZOOM, MAX_ZOOM);
      const ratio = nextZoom / cam.z;
      cam.x = after.x - (before.x - cam.x) * ratio;
      cam.y = after.y - (before.y - cam.y) * ratio;
      cam.z = nextZoom;
      targetZoom = nextZoom;
      dragDistance += 100;
      scheduleCamera();
      return;
    }

    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    cam.x += deltaX;
    cam.y += deltaY;
    targetZoom = cam.z;
    dragDistance += Math.abs(deltaX) + Math.abs(deltaY);
    scheduleCamera();
  }

  function onPointerUp(event: PointerEvent): void {
    pointers.delete(event.pointerId);
    if (pointers.size > 0) return;

    stage.classList.remove('is-dragging');
    setMoving(false);
    scheduleCull();
    if (event.type !== 'pointerup' || dragDistance >= 8) return;

    const target = document.elementFromPoint(event.clientX, event.clientY);
    const editUnionTarget = target?.closest<HTMLElement>('[data-edit-union]');
    const editPersonTarget = target?.closest<HTMLElement>('[data-person-id]');
    if (editing) {
      if (editUnionTarget?.dataset.editUnion) {
        options.onEditUnion?.(editUnionTarget.dataset.editUnion);
      } else if (editPersonTarget?.dataset.personId) {
        options.onEditPerson?.(editPersonTarget.dataset.personId);
      }
      return;
    }

    const rerootTarget = target?.closest<HTMLElement>('[data-reroot]');
    const cardTarget = target?.closest<HTMLElement>('[data-person-id]');
    const personId = rerootTarget?.dataset.reroot ?? cardTarget?.dataset.personId;
    if (personId) reRoot(personId);
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    hideHint();
    hasInteracted = true;
    flight = null;
    setMoving(true);
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      setMoving(false);
      scheduleCull();
    }, WHEEL_SETTLE_MS);

    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    const factor = Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0016));
    targetZoom = clamp(targetZoom * factor, MIN_ZOOM, MAX_ZOOM);
    anchor = { x: event.clientX, y: event.clientY };
    requestFrame();
  }

  /** No palco (após o skip link), as setas entram no primeiro cartão e navegam. */
  function onStageKeyDown(event: KeyboardEvent): void {
    if (event.target !== stage) return;
    const direction = arrowDirection(event.key);
    if (!direction && event.key !== 'Home') return;
    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Home') navFocusId = rootId;
    if (!navFocusId) navFocusId = layout.nodes[0]?.personId ?? null;
    if (!navFocusId) return;

    if (!focusPersonCard(navFocusId, true)) {
      const first = world.querySelector<HTMLElement>('[data-person-id]');
      if (!first?.dataset.personId) return;
      navFocusId = first.dataset.personId;
      focusPersonCard(navFocusId, true);
    }
    if (direction) moveFocus(direction);
    else {
      updateRovingTabindex();
      ensureCardVisible(navFocusId);
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('input, select, textarea, button, .editor, .data-panel')
    ) {
      return;
    }

    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomBy(1.4);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomBy(1 / 1.4);
    } else if (event.key === '0' || event.key === 'Home') {
      event.preventDefault();
      home();
    }
  }

  function onResize(): void {
    if (hasInteracted) {
      cam.z = clamp(cam.z, MIN_ZOOM, MAX_ZOOM);
      targetZoom = cam.z;
    } else {
      const target = computeFocus();
      cam = { ...target };
      targetZoom = target.z;
    }
    applyCamera();
    scheduleCull();
  }

  homeButton.addEventListener('click', home);
  editButton.addEventListener('click', () => options.onToggleEditor?.(rootId));
  zoomInButton.addEventListener('click', () => zoomBy(1.45));
  zoomOutButton.addEventListener('click', () => zoomBy(1 / 1.45));
  fitButton.addEventListener('click', () => fit(true));
  generationsSelect.addEventListener('change', () => {
    const raw = generationsSelect.value;
    setGenerations(raw === 'all' ? 'all' : Number(raw));
  });

  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);
  stage.addEventListener('keydown', onStageKeyDown);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);

  renderWorld();
  updateHud();

  if (prefersReducedMotion) {
    cam = computeFocus();
    targetZoom = cam.z;
    applyCamera();
    scheduleCull();
  } else {
    const target = computeFocus();
    const ratio = 0.9;
    const startZoom = Math.max(MIN_ZOOM, target.z * ratio);
    const focusX = window.innerWidth / 2;
    const focusY = window.innerHeight * 0.38;
    cam = {
      x: focusX - (focusX - target.x) * (startZoom / target.z),
      y: focusY - (focusY - target.y) * (startZoom / target.z),
      z: startZoom,
    };
    targetZoom = startZoom;
    applyCamera();
    flyTo(target, 750);
  }

  hintTimer = window.setTimeout(hideHint, 9000);

  return {
    setRoot: reRoot,
    setGenerations,
    setEditing,
    updateGraph,
    getState: () => ({ rootId, generations }),
    focusEditButton: () => editButton.focus({ preventScroll: true }),
    home,
    fit: () => fit(true),
    zoomBy,
    destroy(): void {
      window.clearTimeout(hintTimer);
      window.clearTimeout(swapTimer);
      window.clearTimeout(settleTimer);
      window.clearTimeout(cullTimer);
      if (frameRequest) window.cancelAnimationFrame(frameRequest);
      if (cameraFrame) window.cancelAnimationFrame(cameraFrame);
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', onPointerUp);
      stage.removeEventListener('pointercancel', onPointerUp);
      stage.removeEventListener('keydown', onStageKeyDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      host.replaceChildren();
      host.classList.remove(
        'tree-app',
        'is-swapping',
        'is-editing',
        'is-editor-open',
        'is-moving',
      );
    },
  };
}
