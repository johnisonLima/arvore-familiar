import './style.css';
import fixtureJson from '../fixtures/family.fixture.json';
import familyJson from './data/family.json';
import { loadFamilyData } from './data/load';
import { buildFamilyGraph } from './domain/graph';
import { validateFamilyData } from './domain/validate';
import { createTreeView } from './view/tree-view';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Elemento #app não encontrado.');

const useFixture = new URLSearchParams(window.location.search).get('familia') === 'fixture';
const sourceJson = useFixture ? fixtureJson : familyJson;

try {
  const validation = validateFamilyData(sourceJson);
  if (!validation.ok) {
    const details = validation.errors
      .map((issue) => `${issue.path}: ${issue.message} (${issue.code})`)
      .join('\n');
    throw new Error(`Dados inválidos:\n${details}`);
  }

  const data = loadFamilyData(sourceJson);
  const graph = buildFamilyGraph(data);
  createTreeView(app, graph);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const pre = document.createElement('pre');
  pre.className = 'load-error';
  pre.textContent = message;
  app.replaceChildren(pre);
}
