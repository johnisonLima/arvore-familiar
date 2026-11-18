import './style.css';
import fixtureJson from '../fixtures/family.fixture.json';
import familyJson from './data/family.json';
import type { FamilyData } from './domain/types';
import { loadFamilyData } from './data/load';
import { buildFamilyGraph, type FamilyGraph } from './domain/graph';
import { createDataPanel, type DataAction, type DataStatus } from './view/data-panel';
import {
  createTreeView,
  type GenerationsSetting,
  type TreeView,
} from './view/tree-view';
import { createFamilyDocumentStore } from './storage/document-store';
import { browserLocalStorage, resolveBrowserStorage } from './storage/key-value';
import { createViewStore } from './storage/view-store';
import { downloadText } from './storage/download';
import { validateFamilyData } from './domain/validate';
import { createEditorPanel, type EditorFocus } from './view/editor-panel';
import {
  exportFileName,
  FamilyImportError,
  readFamilyFile,
  redactPrivateData,
  serializeFamilyData,
} from './storage/transfer';

const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) throw new Error('Elemento #app não encontrado.');
const app: HTMLDivElement = appElement;

let fixtureMode = new URLSearchParams(window.location.search).get('familia') === 'fixture';
// GitHub Pages não tem autorização no servidor. Este parâmetro só oculta os controles
// na visualização compartilhada; não deve ser tratado como controle de acesso real.
const adminMode = new URLSearchParams(window.location.search).get('admin') === '1';
const resolvedStorage = resolveBrowserStorage(browserLocalStorage());
const documentStore = createFamilyDocumentStore(
  resolvedStorage.storage,
  resolvedStorage.persistent,
);
const viewStore = createViewStore(resolvedStorage.storage, resolvedStorage.persistent);

let current: FamilyData | null = null;
let view: TreeView | null = null;
let importing = false;

const editor = createEditorPanel({
  onApply: (data, focus) => applyDocument(data, focus),
  onOpenChange: (open) => {
    view?.setEditing(open);
    app.classList.toggle('is-editor-open', open);
    document.body.classList.toggle('is-editor-open', open);
    if (!open) view?.focusEditButton();
  },
});

const panel = createDataPanel({
  enabled: adminMode,
  onAction: (action, file) => {
    void handleAction(action, file);
  },
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const formatMoment = (iso: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};

interface RenderOptions {
  rootId?: string;
  generations?: GenerationsSetting;
  trackView?: boolean;
}

function applyDocument(next: FamilyData, focus?: EditorFocus): boolean {
  const updated: FamilyData = {
    ...next,
    meta: { ...next.meta, updatedAt: new Date().toISOString() },
  };

  const validation = validateFamilyData(updated);
  if (!validation.ok) {
    editor.showError(
      'Documento inválido',
      validation.errors.map((issue) => `${issue.path}: ${issue.message}`),
    );
    return false;
  }

  let graph: FamilyGraph;
  try {
    graph = buildFamilyGraph(updated);
  } catch (error) {
    editor.showError('Não foi possível reconstruir a árvore', [errorMessage(error)]);
    return false;
  }

  current = updated;
  view?.updateGraph(graph);
  editor.setDocument(updated, focus);

  if (fixtureMode) {
    editor.setStatus('Alteração aplicada na fixture. O modo de teste não grava no armazenamento local.', 'warning');
    panel.setStatus({
      tone: 'session',
      title: 'Fixture alterada nesta sessão',
      detail: 'Use ?familia=fixture apenas para testes; nada é salvo.',
    });
    return true;
  }

  const saved = documentStore.save(updated);

  if (saved.ok && documentStore.persistent) {
    const moment = formatMoment(saved.savedAt);
    editor.setStatus(`Alteração salva${moment ? ` em ${moment}` : ''}.`, 'ok');
    panel.setStatus({
      tone: 'local',
      title: 'Alterações salvas',
      detail: moment ? `Atualizado em ${moment}.` : 'Documento salvo neste navegador.',
    });
  } else if (saved.ok) {
    editor.setStatus(
      'Alteração aplicada nesta sessão. O armazenamento local não está disponível; recarregar perde a mudança.',
      'warning',
    );
    panel.setStatus({
      tone: 'session',
      title: 'Alterações apenas nesta sessão',
      detail: 'O armazenamento local não está disponível.',
    });
  } else {
    editor.setStatus(`Alteração aplicada, mas não foi salva: ${saved.message}`, 'warning');
    panel.setStatus({
      tone: 'session',
      title: 'Alteração não salva',
      detail: saved.message,
    });
  }

  return true;
}

function render(data: FamilyData, options: RenderOptions = {}): void {
  const graph = buildFamilyGraph(data);
  current = data;
  view?.destroy();
  view = createTreeView(app, graph, {
    rootId: options.rootId,
    generations: options.generations,
    onStateChange:
      options.trackView === false
        ? undefined
        : (state) => {
            viewStore.save({
              rootId: state.rootId,
              generations: state.generations,
            });
          },
    onToggleEditor: adminMode ? (rootId) => {
      if (editor.isOpen()) editor.close();
      else editor.open({ personId: rootId });
    } : undefined,
    onEditPerson: adminMode ? (personId) => editor.open({ personId }) : undefined,
    onEditUnion: adminMode ? (unionId) => editor.open({ unionId }) : undefined,
  });

  editor.setDocument(data, { personId: view.getState().rootId });
  if (editor.isOpen()) view.setEditing(true);
}

function exportDocument(redact: boolean): void {
  if (!current) return;

  const data = redact ? redactPrivateData(current) : current;
  const filename = exportFileName(data, redact ? { suffix: 'sem-privados' } : {});

  try {
    downloadText(filename, serializeFamilyData(data));
    panel.setStatus({
      tone: 'local',
      title: redact ? 'Exportado sem dados privados' : 'Documento exportado',
      detail: filename,
    });
  } catch (error) {
    panel.showError('Falha ao exportar', [errorMessage(error)]);
  }
}

function leaveFixtureMode(): void {
  if (!fixtureMode) return;
  fixtureMode = false;
  if (window.location.search) {
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.hash}`,
    );
  }
}

async function importDocument(file: File): Promise<void> {
  if (importing) return;

  importing = true;
  panel.setBusy(true);

  try {
    const data = await readFamilyFile(file);
    leaveFixtureMode();
    editor.close();
    const saved = documentStore.save(data);
    viewStore.clear();
    render(data, { generations: 'all' });

    if (saved.ok && documentStore.persistent) {
      panel.setStatus({
        tone: 'local',
        title: 'Documento importado',
        detail: `${file.name} · salvo em ${formatMoment(saved.savedAt)}.`,
      });
    } else if (saved.ok) {
      panel.setStatus({
        tone: 'session',
        title: 'Documento importado nesta sessão',
        detail: 'O armazenamento local não está disponível; recarregar a página perde a cópia.',
      });
    } else {
      panel.setStatus({
        tone: 'session',
        title: 'Documento importado nesta sessão',
        detail: `Não foi possível salvar localmente: ${saved.message}`,
      });
    }

    panel.close();
  } catch (error) {
    const details =
      error instanceof FamilyImportError && error.issues.length > 0
        ? error.issues.map((issue) => `${issue.path}: ${issue.message}`)
        : [errorMessage(error)];
    panel.showError('Falha ao importar', details.slice(0, 8));
  } finally {
    importing = false;
    panel.setBusy(false);
  }
}

function resetToExample(): void {
  try {
    documentStore.clear();
    viewStore.clear();
    editor.close();
    render(loadFamilyData(fixtureMode ? fixtureJson : familyJson), { generations: 'all' });
    panel.setStatus({
      tone: 'session',
      title: fixtureMode ? 'Fixture restaurada' : 'Exemplo restaurado',
      detail: documentStore.persistent
        ? 'A cópia local e as preferências de visualização foram removidas.'
        : 'O exemplo embutido foi recarregado.',
    });
    panel.close();
  } catch (error) {
    panel.showError('Falha ao restaurar o exemplo', [errorMessage(error)]);
  }
}

async function handleAction(action: DataAction, file?: File): Promise<void> {
  if (action === 'export') {
    exportDocument(false);
    return;
  }
  if (action === 'export-redacted') {
    exportDocument(true);
    return;
  }
  if (action === 'reset') {
    resetToExample();
    return;
  }
  if (action === 'import' && file) {
    await importDocument(file);
  }
}

function boot(): void {
  let storageNotice: string | null = null;
  let data: FamilyData;
  let rootId: string | undefined;
  let generations: GenerationsSetting = 'all';
  let trackView = true;
  let initialStatus: DataStatus;

  if (fixtureMode) {
    data = loadFamilyData(fixtureJson);
    trackView = false;
    initialStatus = {
      tone: 'session',
      title: 'Fixture sintética',
      detail: 'Modo de teste: preferências de visualização não são salvas.',
    };
  } else {
    const stored = documentStore.load();

    if (stored.status === 'ok') {
      data = stored.document.data;
      initialStatus = {
        tone: 'local',
        title: 'Salvo localmente',
        detail: stored.document.savedAt
          ? `Atualizado em ${formatMoment(stored.document.savedAt)}.`
          : 'Cópia local disponível.',
      };
    } else {
      data = loadFamilyData(familyJson);
      if (stored.status === 'error') storageNotice = stored.message;
      initialStatus = {
        tone: 'session',
        title: 'Documento de exemplo',
        detail: documentStore.persistent
          ? 'Importe um JSON para salvar uma cópia local neste navegador.'
          : 'Armazenamento local indisponível; alterações valem só nesta sessão.',
      };
    }

    const storedView = viewStore.load();
    if (storedView.status === 'ok') {
      rootId = storedView.preferences.rootId ?? undefined;
      generations = storedView.preferences.generations;
    } else if (storedView.status === 'error') {
      console.warn(`Preferências de visualização ignoradas: ${storedView.message}`);
    }
  }

  render(data, { rootId, generations, trackView });
  panel.setStatus(initialStatus);

  if (storageNotice) {
    panel.showError('Cópia local ignorada', [
      storageNotice,
      'O exemplo embutido foi carregado. Importe um arquivo para substituí-lo.',
    ]);
  }
}

function setupDropTarget(): void {
  const onDragOver = (event: DragEvent): void => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    app.classList.add('is-dropping');
  };

  const onDragLeave = (event: DragEvent): void => {
    if (!event.relatedTarget) app.classList.remove('is-dropping');
  };

  const onDrop = (event: DragEvent): void => {
    event.preventDefault();
    app.classList.remove('is-dropping');
    const file = event.dataTransfer?.files?.[0];
    if (file) void importDocument(file);
  };

  const onDragEnd = (): void => {
    app.classList.remove('is-dropping');
  };

  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);
  window.addEventListener('dragend', onDragEnd);
}

try {
  boot();
  setupDropTarget();
} catch (error) {
  const pre = document.createElement('pre');
  pre.className = 'load-error';
  pre.textContent = errorMessage(error);
  app.replaceChildren(pre);
  editor.destroy();
  panel.destroy();
}
