export type DataAction = 'export' | 'export-redacted' | 'import' | 'reset';

export type DataStatusTone = 'local' | 'session' | 'error';

export interface DataStatus {
  tone: DataStatusTone;
  title: string;
  detail?: string;
}

export interface DataPanelOptions {
  onAction(action: DataAction, file?: File): void;
  enabled?: boolean;
}

export interface DataPanel {
  setStatus(status: DataStatus): void;
  showError(title: string, details?: string[]): void;
  setBusy(busy: boolean): void;
  close(): void;
  destroy(): void;
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

export function createDataPanel(options: DataPanelOptions): DataPanel {
  const panel = element('section', 'data-panel');
  panel.setAttribute('aria-label', 'Documento e dados');

  const body = element('div', 'data-panel__body');
  body.id = 'data-panel-body';
  body.hidden = true;

  const heading = element('p', 'data-panel__heading', 'Documento');
  const statusRow = element('p', 'data-panel__status');
  statusRow.setAttribute('aria-live', 'polite');
  const statusDot = element('span', 'data-panel__dot data-panel__dot--session');
  const statusText = element('span', 'data-panel__status-text', 'Documento de exemplo');
  statusRow.append(statusDot, statusText);

  const detail = element('p', 'data-panel__detail');
  detail.hidden = true;

  const actions = element('div', 'data-panel__actions');
  const actionButtons: HTMLButtonElement[] = [];

  const actionButton = (
    label: string,
    action: Exclude<DataAction, 'import'>,
    className?: string,
  ): HTMLButtonElement => {
    const button = element('button', `data-panel__action${className ? ` ${className}` : ''}`, label);
    button.type = 'button';
    button.addEventListener('click', () => options.onAction(action));
    actions.append(button);
    actionButtons.push(button);
    return button;
  };

  actionButton('Exportar JSON', 'export');
  actionButton('Exportar sem privados', 'export-redacted');

  const input = element('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.hidden = true;

  const importButton = element('button', 'data-panel__action', 'Importar JSON');
  importButton.type = 'button';
  importButton.addEventListener('click', () => {
    input.value = '';
    input.click();
  });
  actions.append(importButton);
  actionButtons.push(importButton);

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) options.onAction('import', file);
    input.value = '';
  });

  actionButton('Restaurar exemplo', 'reset', 'is-danger');

  const error = element('div', 'data-panel__error');
  error.hidden = true;
  error.setAttribute('role', 'alert');

  const toggle = element('button', 'data-panel__toggle', '▤ Dados');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', body.id);
  toggle.title = 'Importar, exportar ou restaurar o documento';

  body.append(heading, statusRow, detail, actions, error, input);
  panel.append(body, toggle);
  panel.hidden = options.enabled === false;
  document.body.append(panel);

  const setOpen = (open: boolean): void => {
    body.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? '▾ Dados' : '▤ Dados';
    panel.classList.toggle('is-open', open);
  };

  toggle.addEventListener('click', () => setOpen(body.hidden !== false));

  const onDocumentPointerDown = (event: PointerEvent): void => {
    if (body.hidden) return;
    const target = event.target;
    if (target instanceof Node && panel.contains(target)) return;
    setOpen(false);
  };

  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || body.hidden) return;
    setOpen(false);
    toggle.focus();
  };

  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onDocumentKeyDown);

  return {
    setStatus(status: DataStatus): void {
      statusDot.className = `data-panel__dot data-panel__dot--${status.tone}`;
      statusText.textContent = status.title;
      detail.textContent = status.detail ?? '';
      detail.hidden = !status.detail;
      if (status.tone !== 'error') {
        error.hidden = true;
        error.replaceChildren();
      }
    },

    showError(title: string, details: string[] = []): void {
      statusDot.className = 'data-panel__dot data-panel__dot--error';
      statusText.textContent = title;
      detail.hidden = true;
      error.hidden = false;
      error.replaceChildren(
        ...details.map((line) => element('p', 'data-panel__error-line', line)),
      );
      setOpen(true);
    },

    setBusy(busy: boolean): void {
      panel.classList.toggle('is-busy', busy);
      panel.setAttribute('aria-busy', String(busy));
      for (const button of actionButtons) button.disabled = busy;
    },

    close(): void {
      setOpen(false);
    },

    destroy(): void {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
      panel.remove();
    },
  };
}
