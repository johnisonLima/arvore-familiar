import './style.css';
import familyJson from './data/family.json';
import { loadFamilyData } from './data/load';
import { buildFamilyGraph, descendantsOf, rootPerson } from './domain/graph';
import { validateFamilyData } from './domain/validate';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Elemento #app não encontrado.');

const fact = (label: string, value: string): HTMLDivElement => {
  const wrapper = document.createElement('div');
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value;
  wrapper.append(term, description);
  return wrapper;
};

try {
  const validation = validateFamilyData(familyJson);
  if (!validation.ok) {
    const details = validation.errors
      .map((issue) => `${issue.path}: ${issue.message} (${issue.code})`)
      .join('\n');
    throw new Error(`Dados inválidos:\n${details}`);
  }

  const data = loadFamilyData(familyJson);
  const graph = buildFamilyGraph(data);
  const root = rootPerson(graph);
  const descendants = descendantsOf(graph, root.id);
  const childLinks = Object.values(data.unions).reduce(
    (total, union) => total + union.children.length,
    0,
  );

  const header = document.createElement('header');
  const kicker = document.createElement('p');
  kicker.className = 'kicker';
  kicker.textContent = 'Fase 1 · domínio e grafo';
  const title = document.createElement('h1');
  title.textContent = 'Árvore Familiar';
  const subtitle = document.createElement('p');
  subtitle.textContent =
    'O seed legado foi migrado para o modelo de pessoas e uniões. A visualização fractal entra na Fase 2.';
  header.append(kicker, title, subtitle);

  const list = document.createElement('dl');
  list.className = 'facts';
  list.append(
    fact('Pessoas', String(Object.keys(data.persons).length)),
    fact('Uniões', String(Object.keys(data.unions).length)),
    fact('Vínculos pai/filho', String(childLinks)),
    fact('Raiz', root.name),
    fact('Descendentes da raiz', String(descendants.length)),
    fact('Avisos', String(validation.warnings.length)),
  );

  const footer = document.createElement('p');
  footer.className = 'footer';
  footer.textContent = `Schema v${data.schemaVersion} · ${data.meta.title}`;

  app.append(header, list, footer);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const pre = document.createElement('pre');
  pre.className = 'error';
  pre.textContent = message;
  app.append(pre);
}
