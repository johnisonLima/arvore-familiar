import type {
  FamilyData,
  Person,
  PersonId,
  Sex,
  Union,
  UnionId,
  UnionStatus,
} from '../domain/types';
import {
  EditorMutationError,
  addChild,
  addPartner,
  createChildInUnion,
  createPerson,
  createUnion,
  deletePerson,
  deleteUnion,
  removeChild,
  removePartner,
  updatePerson,
  updateUnion,
  type PersonInput,
  type PersonPatch,
} from '../editor/mutations';
import { unionMeta } from './format';

export interface EditorFocus {
  personId?: PersonId | null;
  unionId?: UnionId | null;
}

export type EditorStatusTone = 'ok' | 'info' | 'warning' | 'error';

export interface EditorPanelOptions {
  /** Aplica uma nova versão válida do documento. Retorna `false` se rejeitou. */
  onApply(data: FamilyData, focus?: EditorFocus): boolean;
  onOpenChange?(open: boolean): void;
}

export interface EditorPanel {
  open(focus?: EditorFocus): void;
  close(): void;
  isOpen(): boolean;
  setDocument(data: FamilyData, focus?: EditorFocus): void;
  setStatus(message: string, tone?: EditorStatusTone): void;
  showError(title: string, details?: string[]): void;
  destroy(): void;
}

type Mode = 'person' | 'new-person';

const STATUS_OPTIONS: Array<{ value: UnionStatus; label: string }> = [
  { value: 'married', label: 'Casados' },
  { value: 'partners', label: 'Parceiros' },
  { value: 'divorced', label: 'Divorciados' },
  { value: 'separated', label: 'Separados' },
  { value: 'widowed', label: 'Viúvos' },
  { value: 'unknown', label: 'Desconhecido' },
];

const SEX_OPTIONS: Array<{ value: Sex; label: string }> = [
  { value: 'F', label: 'Feminino' },
  { value: 'M', label: 'Masculino' },
  { value: 'X', label: 'Outro' },
  { value: 'U', label: 'Não informado' },
];

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

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const text = (data: FormData, key: string): string => {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
};

const yearFrom = (data: FormData, key: string, label: string): number | null => {
  const raw = text(data, key).trim();
  if (!raw) return null;
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1) {
    throw new EditorMutationError(`${label}: informe um ano inteiro positivo.`);
  }
  return year;
};

const sexFrom = (data: FormData, key: string): Sex | undefined => {
  const raw = text(data, key);
  return raw === 'F' || raw === 'M' || raw === 'X' || raw === 'U' ? raw : undefined;
};

const statusFrom = (data: FormData, key: string): UnionStatus | undefined => {
  const raw = text(data, key);
  return STATUS_OPTIONS.some((option) => option.value === raw)
    ? (raw as UnionStatus)
    : undefined;
};

const readPersonInput = (form: FormData): PersonInput => ({
  name: text(form, 'name'),
  sex: sexFrom(form, 'sex'),
  birthYear: yearFrom(form, 'birthYear', 'Nascimento'),
  deathYear: yearFrom(form, 'deathYear', 'Falecimento'),
  birthPlace: text(form, 'birthPlace'),
  bio: text(form, 'bio'),
  private: form.has('private'),
});

const readPersonPatch = (form: FormData): PersonPatch => ({
  name: text(form, 'name'),
  sex: sexFrom(form, 'sex') ?? null,
  birthYear: yearFrom(form, 'birthYear', 'Nascimento'),
  deathYear: yearFrom(form, 'deathYear', 'Falecimento'),
  birthPlace: text(form, 'birthPlace'),
  bio: text(form, 'bio'),
  private: form.has('private'),
});

const inputField = (
  label: string,
  control: HTMLElement,
  className?: string,
): HTMLLabelElement => {
  const wrapper = element('label', `editor__field${className ? ` ${className}` : ''}`);
  wrapper.append(element('span', 'editor__field-label', label), control);
  return wrapper;
};

const textInput = (
  name: string,
  value: string,
  options: { type?: string; placeholder?: string; required?: boolean } = {},
): HTMLInputElement => {
  const input = element('input', 'editor__input');
  input.type = options.type ?? 'text';
  input.name = name;
  input.value = value;
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.required) input.required = true;
  return input;
};

const textArea = (name: string, value: string, rows = 3): HTMLTextAreaElement => {
  const area = element('textarea', 'editor__input editor__textarea');
  area.name = name;
  area.rows = rows;
  area.value = value;
  return area;
};

const selectInput = <T extends string>(
  name: string,
  options: Array<{ value: T | ''; label: string }>,
  current: T | '' | undefined,
): HTMLSelectElement => {
  const select = element('select', 'editor__input');
  select.name = name;
  for (const option of options) {
    const node = element('option', undefined, option.label);
    node.value = option.value;
    node.selected = option.value === (current ?? '');
    select.append(node);
  }
  return select;
};

const checkboxField = (name: string, label: string, checked: boolean): HTMLLabelElement => {
  const wrapper = element('label', 'editor__check');
  const input = element('input');
  input.type = 'checkbox';
  input.name = name;
  input.checked = checked;
  wrapper.append(input, element('span', undefined, label));
  return wrapper;
};

const actionButton = (
  label: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement => {
  const button = element('button', className, label);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
};

const FOCUSABLE =
  'input:not([type="hidden"]), select, textarea, button, [href], [tabindex]:not([tabindex="-1"])';

interface FocusSnapshot {
  unionId: string | null;
  key: string;
  type: string | null;
  index: number;
  start: number | null;
  end: number | null;
}

const controlKey = (node: HTMLElement): string =>
  node.getAttribute('name') ?? `text:${node.textContent?.trim() ?? ''}`;

/** Registra o campo focado para reencontrá-lo depois de um re-render. */
const captureFocus = (root: HTMLElement): FocusSnapshot | null => {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  const scope = active.closest<HTMLElement>('[data-union-id]') ?? root;
  const key = controlKey(active);
  const type = active instanceof HTMLInputElement ? active.type : null;
  const group = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (node) =>
      controlKey(node) === key &&
      (type === null || (node instanceof HTMLInputElement && node.type === type)),
  );
  const field = active as HTMLInputElement | HTMLTextAreaElement;
  return {
    unionId: scope.dataset.unionId ?? null,
    key,
    type,
    index: Math.max(0, group.indexOf(active)),
    start: typeof field.selectionStart === 'number' ? field.selectionStart : null,
    end: typeof field.selectionEnd === 'number' ? field.selectionEnd : null,
  };
};

const restoreFocus = (snapshot: FocusSnapshot | null, root: HTMLElement): boolean => {
  if (!snapshot) return false;
  const scope =
    (snapshot.unionId
      ? root.querySelector<HTMLElement>(`[data-union-id="${CSS.escape(snapshot.unionId)}"]`)
      : null) ?? root;
  const group = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (node) =>
      controlKey(node) === snapshot.key &&
      (snapshot.type === null ||
        (node instanceof HTMLInputElement && node.type === snapshot.type)),
  );
  const target = group[Math.min(snapshot.index, group.length - 1)];
  if (!target) return false;

  target.focus({ preventScroll: true });
  if (
    snapshot.start !== null &&
    (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
  ) {
    try {
      target.setSelectionRange(snapshot.start, snapshot.end ?? snapshot.start);
    } catch {
      // Campos numéricos não aceitam seleção; o foco já foi restaurado.
    }
  }
  return true;
};

export function createEditorPanel(options: EditorPanelOptions): EditorPanel {
  let data: FamilyData | null = null;
  let personId: PersonId | null = null;
  let focusUnionId: UnionId | null = null;
  let mode: Mode = 'person';
  let newUnionOpen = false;
  let confirmDelete: 'person' | UnionId | null = null;
  let panelOpen = false;

  const panel = element('aside', 'editor');
  panel.id = 'family-editor';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', 'family-editor-title');
  panel.setAttribute('aria-describedby', 'family-editor-hint');
  panel.tabIndex = -1;
  panel.hidden = true;

  const header = element('header', 'editor__head');
  const titleWrap = element('div');
  const title = element('h2', 'editor__title', 'Pessoas e uniões');
  title.id = 'family-editor-title';
  titleWrap.append(element('p', 'editor__eyebrow', 'Editar documento'), title);
  const closeButton = element('button', 'editor__close', '✕');
  closeButton.type = 'button';
  closeButton.title = 'Fechar editor';
  closeButton.setAttribute('aria-label', 'Fechar editor');
  header.append(titleWrap, closeButton);

  const hint = element(
    'p',
    'editor__hint',
    'Clique num cartão ou numa barra de união da árvore para editar. Cada alteração é salva automaticamente.',
  );
  hint.id = 'family-editor-hint';

  const status = element('p', 'editor__status', 'Pronto para editar.');
  status.setAttribute('aria-live', 'polite');

  const error = element('div', 'editor__error');
  error.setAttribute('role', 'alert');
  error.tabIndex = -1;
  error.hidden = true;

  const scroll = element('div', 'editor__scroll');
  panel.append(header, hint, status, error, scroll);
  document.body.append(panel);

  function showError(title: string, details: string[] = []): void {
    error.replaceChildren(
      element('p', 'editor__error-title', title),
      ...details.slice(0, 8).map((line) => element('p', 'editor__error-line', line)),
    );
    error.hidden = false;
    status.className = 'editor__status editor__status--error';
    status.textContent = title;
    error.focus();
  }

  function setStatus(message: string, tone: EditorStatusTone = 'info'): void {
    status.className = `editor__status editor__status--${tone}`;
    status.textContent = message;
  }

  function clearError(): void {
    error.hidden = true;
    error.replaceChildren();
    renderStatus();
  }

  function person(): Person | null {
    if (!data || !personId) return null;
    return data.persons[personId] ?? null;
  }

  function requireData(): FamilyData {
    if (!data) throw new EditorMutationError('Nenhum documento carregado.');
    return data;
  }

  function requirePerson(): Person {
    const found = person();
    if (!found) throw new EditorMutationError('Selecione uma pessoa.');
    return found;
  }

  function sortedPersons(): Person[] {
    if (!data) return [];
    return Object.values(data.persons).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
    );
  }

  function unionsOfPerson(): Union[] {
    if (!data || !personId) return [];
    return Object.values(data.unions)
      .filter((union) => union.partners.includes(personId as PersonId))
      .sort((a, b) => (a.start?.year ?? 9999) - (b.start?.year ?? 9999) || a.id.localeCompare(b.id));
  }

  function nameOf(id: PersonId): string {
    return data?.persons[id]?.name ?? id;
  }

  function unionNames(union: Union): string {
    if (union.partners.length === 0) return 'Sem parceiros';
    return union.partners.map(nameOf).join(' & ');
  }

  function applyFocus(focus?: EditorFocus): void {
    if (!data) return;

    if (focus?.unionId && data.unions[focus.unionId]) {
      const union = data.unions[focus.unionId];
      const partner = focus.personId && union.partners.includes(focus.personId)
        ? focus.personId
        : union.partners[0];
      if (partner) personId = partner;
      focusUnionId = union.id;
      return;
    }

    if (focus?.personId && data.persons[focus.personId]) {
      personId = focus.personId;
      focusUnionId = null;
      return;
    }

    if (personId && data.persons[personId]) {
      focusUnionId = null;
      return;
    }

    const rootId = data.meta.rootPersonId;
    personId = data.persons[rootId] ? rootId : sortedPersons()[0]?.id ?? null;
    focusUnionId = null;
  }

  function renderStatus(): void {
    if (!data) {
      setStatus('Nenhum documento carregado.');
      return;
    }
    const people = Object.keys(data.persons).length;
    const unions = Object.keys(data.unions).length;
    setStatus(`${people} ${people === 1 ? 'pessoa' : 'pessoas'} · ${unions} ${
      unions === 1 ? 'união' : 'uniões'
    } no documento.`);
  }

  function render(): void {
    const scrollTop = scroll.scrollTop;
    const snapshot = captureFocus(scroll);
    scroll.replaceChildren();

    if (!data) {
      scroll.append(element('p', 'editor__empty', 'Nenhum documento carregado.'));
      return;
    }

    scroll.append(renderPersonSection(), renderUnionSection());
    for (const form of scroll.querySelectorAll('form')) {
      form.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        form.requestSubmit();
      });
    }
    scroll.scrollTop = scrollTop;
    if (snapshot && !restoreFocus(snapshot, scroll)) {
      // A ação removeu o controle focado (ex.: exclusão); não deixa o foco no body.
      focusInitial();
    }
  }

  function focusConfirm(): void {
    scroll
      .querySelector<HTMLElement>('.editor__confirm .editor__danger')
      ?.focus({ preventScroll: true });
  }

  function renderPersonSection(): HTMLElement {
    const section = element('section', 'editor__section');
    const head = element('div', 'editor__section-head');
    head.append(element('h3', 'editor__section-title', 'Pessoa'));
    head.append(
      actionButton('+ Nova', 'editor__ghost', () => {
        mode = 'new-person';
        confirmDelete = null;
        focusUnionId = null;
        clearError();
        render();
        scroll.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
      }),
    );
    section.append(head);

    const select = element('select', 'editor__input');
    select.setAttribute('aria-label', 'Pessoa em edição');
    if (mode === 'new-person') {
      const option = element('option', undefined, 'Nova pessoa');
      option.value = '';
      select.append(option);
      select.disabled = true;
    } else {
      for (const candidate of sortedPersons()) {
        const option = element('option', undefined, candidate.name);
        option.value = candidate.id;
        option.selected = candidate.id === personId;
        select.append(option);
      }
    }
    select.addEventListener('change', () => {
      personId = select.value || null;
      mode = 'person';
      focusUnionId = null;
      newUnionOpen = false;
      confirmDelete = null;
      clearError();
      render();
    });
    section.append(inputField('Pessoa selecionada', select, 'editor__field--wide'));

    section.append(mode === 'new-person' ? renderPersonForm(null) : renderPersonForm(requirePerson()));
    return section;
  }

  function renderPersonForm(target: Person | null): HTMLFormElement {
    const form = element('form', 'editor__form');
    form.noValidate = false;

    if (!target) {
      form.append(element('p', 'editor__form-title', 'Nova pessoa'));
    }

    form.append(
      inputField(
        'Nome',
        textInput('name', target?.name ?? '', {
          required: true,
          placeholder: 'Nome completo',
        }),
        'editor__field--wide',
      ),
    );

    const grid = element('div', 'editor__grid');
    grid.append(
      inputField(
        'Sexo',
        selectInput(
          'sex',
          [{ value: '', label: 'Não informado' }, ...SEX_OPTIONS],
          target?.sex,
        ),
      ),
      inputField(
        'Nascimento',
        textInput('birthYear', target?.birth?.year ? String(target.birth.year) : '', {
          type: 'number',
          placeholder: 'Ano',
        }),
      ),
      inputField(
        'Falecimento',
        textInput('deathYear', target?.death?.year ? String(target.death.year) : '', {
          type: 'number',
          placeholder: 'Ano',
        }),
      ),
    );
    form.append(grid);

    form.append(
      inputField(
        'Local de nascimento',
        textInput('birthPlace', target?.birthPlace ?? '', {
          placeholder: 'Cidade, estado',
        }),
        'editor__field--wide',
      ),
      inputField(
        'Biografia',
        textArea('bio', target?.bio ?? ''),
        'editor__field--wide',
      ),
      checkboxField('private', 'Dados privados (omitidos na exportação pública)', target?.private === true),
    );

    const actions = element('div', 'editor__actions');
    const submit = element('button', 'editor__primary', target ? 'Salvar pessoa' : 'Criar pessoa');
    submit.type = 'submit';
    actions.append(submit);

    if (target) {
      actions.append(
        actionButton('Excluir pessoa', 'editor__danger', () => {
          confirmDelete = 'person';
          render();
          focusConfirm();
        }),
      );
    } else {
      actions.append(
        actionButton('Cancelar', 'editor__ghost', () => {
          mode = 'person';
          clearError();
          render();
        }),
      );
    }
    form.append(actions);

    if (confirmDelete === 'person' && target) {
      form.append(
        renderConfirm(
          'Excluir esta pessoa? Ela será removida das uniões e, se for a raiz do documento, outra pessoa assume.',
          () => {
            const current = requireData();
            const next = deletePerson(current, target.id);
            options.onApply(next);
          },
        ),
      );
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const formData = new FormData(form);
        const current = requireData();

        if (target) {
          const next = updatePerson(current, target.id, readPersonPatch(formData));
          options.onApply(next, { personId: target.id });
          return;
        }

        const result = createPerson(current, readPersonInput(formData));
        options.onApply(result.data, { personId: result.person.id });
      } catch (error) {
        showError('Não foi possível salvar a pessoa', [errorMessage(error)]);
      }
    });

    return form;
  }

  function renderUnionSection(): HTMLElement {
    const section = element('section', 'editor__section');
    const head = element('div', 'editor__section-head');
    head.append(element('h3', 'editor__section-title', 'Uniões'));
    head.append(
      actionButton('+ União', 'editor__ghost', () => {
        newUnionOpen = true;
        confirmDelete = null;
        clearError();
        render();
      }),
    );
    section.append(head);

    const unions = unionsOfPerson();
    if (unions.length === 0) {
      section.append(element('p', 'editor__empty', 'Nenhuma união registrada para esta pessoa.'));
    }

    for (const union of unions) {
      section.append(renderUnionCard(union));
    }

    if (newUnionOpen) {
      section.append(renderNewUnionForm());
    }

    return section;
  }

  function renderNewUnionForm(): HTMLFormElement {
    const currentPerson = requirePerson();
    const form = element('form', 'editor__form editor__form--union');
    form.append(element('p', 'editor__form-title', `Nova união com ${currentPerson.name}`));

    const candidates = sortedPersons().filter((candidate) => candidate.id !== currentPerson.id);
    if (candidates.length > 0) {
      const partnerOptions = [
        { value: '', label: 'Sem segundo parceiro' },
        ...candidates.map((candidate) => ({ value: candidate.id, label: candidate.name })),
      ];
      form.append(
        inputField('Outro parceiro (opcional)', selectInput('partner', partnerOptions, ''), 'editor__field--wide'),
      );
    }

    form.append(renderUnionDetailFields(null));
    form.append(
      inputField(
        'Observação',
        textArea('note', '', 2),
        'editor__field--wide',
      ),
    );

    const actions = element('div', 'editor__actions');
    const submit = element('button', 'editor__primary', 'Criar união');
    submit.type = 'submit';
    actions.append(
      submit,
      actionButton('Cancelar', 'editor__ghost', () => {
        newUnionOpen = false;
        clearError();
        render();
      }),
    );
    form.append(actions);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const formData = new FormData(form);
        const partner = text(formData, 'partner');
        const partners = partner ? [currentPerson.id, partner] : [currentPerson.id];
        const result = createUnion(requireData(), {
          partners,
          status: statusFrom(formData, 'status'),
          startYear: yearFrom(formData, 'startYear', 'Início'),
          endYear: yearFrom(formData, 'endYear', 'Fim'),
          place: text(formData, 'place'),
          note: text(formData, 'note'),
        });

        newUnionOpen = false;
        focusUnionId = result.union.id;
        if (!options.onApply(result.data, { personId: currentPerson.id, unionId: result.union.id })) {
          newUnionOpen = true;
        }
      } catch (error) {
        showError('Não foi possível criar a união', [errorMessage(error)]);
      }
    });

    return form;
  }

  function renderUnionDetailFields(union: Union | null): HTMLElement {
    const grid = element('div', 'editor__grid');
    grid.append(
      inputField(
        'Situação',
        selectInput(
          'status',
          [{ value: '', label: 'Não informada' }, ...STATUS_OPTIONS],
          union?.status,
        ),
      ),
      inputField(
        'Início',
        textInput('startYear', union?.start?.year ? String(union.start.year) : '', {
          type: 'number',
          placeholder: 'Ano',
        }),
      ),
      inputField(
        'Fim',
        textInput('endYear', union?.end?.year ? String(union.end.year) : '', {
          type: 'number',
          placeholder: 'Ano',
        }),
      ),
      inputField(
        'Local',
        textInput('place', union?.place ?? '', { placeholder: 'Cidade, estado' }),
        'editor__grid-wide',
      ),
    );
    return grid;
  }

  function renderUnionCard(union: Union): HTMLElement {
    const card = element('article', 'editor__union');
    card.tabIndex = -1;
    if (focusUnionId === union.id) {
      card.classList.add('is-focused');
      card.setAttribute('aria-current', 'true');
    }
    card.dataset.unionId = union.id;

    const head = element('div', 'editor__union-head');
    const titles = element('div', 'editor__union-titles');
    titles.append(
      element('h4', 'editor__union-names', unionNames(union)),
      element(
        'p',
        'editor__union-meta',
        [unionMeta(union), union.place]
          .filter(Boolean)
          .join(' · ') || 'Sem detalhes da união',
      ),
    );
    head.append(titles);
    head.append(
      actionButton('Excluir', 'editor__danger editor__danger--small', () => {
        confirmDelete = union.id;
        render();
        focusConfirm();
      }),
    );
    card.append(head);

    if (confirmDelete === union.id) {
      card.append(
        renderConfirm(
          'Excluir esta união? Os filhos deixam de ter este vínculo parental. As pessoas continuam no documento.',
          () => {
            const next = deleteUnion(requireData(), union.id);
            options.onApply(next, { personId });
          },
        ),
      );
    }

    const partnerRow = element('div', 'editor__chips');
    partnerRow.append(element('span', 'editor__chips-label', 'Parceiros'));
    for (const partner of union.partners) {
      partnerRow.append(
        renderChip(nameOf(partner), union.partners.length > 1
          ? () => {
              try {
                options.onApply(removePartner(requireData(), union.id, partner), {
                  personId,
                  unionId: union.id,
                });
              } catch (error) {
                showError('Não foi possível remover o parceiro', [errorMessage(error)]);
              }
            }
          : undefined),
      );
    }
    card.append(partnerRow);

    const candidatePartners = sortedPersons().filter(
      (candidate) =>
        !union.partners.includes(candidate.id) && !union.children.includes(candidate.id),
    );
    if (candidatePartners.length > 0) {
      card.append(
        renderAddRow(
          'Adicionar parceiro existente',
          candidatePartners.map((candidate) => ({ value: candidate.id, label: candidate.name })),
          'Adicionar',
          (value) => {
            try {
              options.onApply(addPartner(requireData(), union.id, value), {
                personId,
                unionId: union.id,
              });
            } catch (error) {
              showError('Não foi possível adicionar o parceiro', [errorMessage(error)]);
            }
          },
        ),
      );
    }

    const form = element('form', 'editor__form editor__form--union');
    form.append(renderUnionDetailFields(union));
    form.append(
      inputField('Observação', textArea('note', union.note ?? '', 2), 'editor__field--wide'),
    );
    const actions = element('div', 'editor__actions');
    const submit = element('button', 'editor__primary', 'Salvar união');
    submit.type = 'submit';
    actions.append(submit);
    form.append(actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const formData = new FormData(form);
        const next = updateUnion(requireData(), union.id, {
          status: statusFrom(formData, 'status') ?? null,
          startYear: yearFrom(formData, 'startYear', 'Início'),
          endYear: yearFrom(formData, 'endYear', 'Fim'),
          place: text(formData, 'place'),
          note: text(formData, 'note'),
        });
        options.onApply(next, { personId, unionId: union.id });
      } catch (error) {
        showError('Não foi possível salvar a união', [errorMessage(error)]);
      }
    });
    card.append(form);

    const children = element('div', 'editor__chips');
    children.append(element('span', 'editor__chips-label', 'Filhos'));
    if (union.children.length === 0) {
      children.append(element('span', 'editor__empty editor__empty--inline', 'Nenhum filho.'));
    }
    for (const child of union.children) {
      children.append(
        renderChip(nameOf(child), () => {
          try {
            options.onApply(removeChild(requireData(), union.id, child), {
              personId,
              unionId: union.id,
            });
          } catch (error) {
            showError('Não foi possível remover o filho', [errorMessage(error)]);
          }
        }),
      );
    }
    card.append(children);

    const childIdsInOtherUnions = new Set<PersonId>();
    const partnersInUnion = new Set(union.partners);
    if (data) {
      for (const other of Object.values(data.unions)) {
        if (other.id === union.id) continue;
        for (const childId of other.children) childIdsInOtherUnions.add(childId);
      }
    }
    const candidateChildren = sortedPersons().filter(
      (candidate) =>
        !partnersInUnion.has(candidate.id) &&
        !union.children.includes(candidate.id) &&
        !childIdsInOtherUnions.has(candidate.id),
    );
    if (candidateChildren.length > 0) {
      card.append(
        renderAddRow(
          'Adicionar filho existente',
          candidateChildren.map((candidate) => ({ value: candidate.id, label: candidate.name })),
          'Adicionar',
          (value) => {
            try {
              options.onApply(addChild(requireData(), union.id, value), {
                personId,
                unionId: union.id,
              });
            } catch (error) {
              showError('Não foi possível adicionar o filho', [errorMessage(error)]);
            }
          },
        ),
      );
    }

    card.append(renderNewChildForm(union));
    return card;
  }

  function renderNewChildForm(union: Union): HTMLFormElement {
    const form = element('form', 'editor__form editor__form--inline');
    form.append(element('p', 'editor__form-title', 'Criar filho nesta união'));

    const row = element('div', 'editor__inline-row');
    row.append(
      textInput('name', '', { placeholder: 'Nome do filho', required: true }),
      textInput('birthYear', '', { type: 'number', placeholder: 'Nascimento' }),
      (() => {
        const button = element('button', 'editor__primary', 'Criar');
        button.type = 'submit';
        return button;
      })(),
    );
    form.append(row);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const formData = new FormData(form);
        const result = createChildInUnion(requireData(), union.id, {
          name: text(formData, 'name'),
          birthYear: yearFrom(formData, 'birthYear', 'Nascimento'),
        });
        options.onApply(result.data, { personId, unionId: union.id });
      } catch (error) {
        showError('Não foi possível criar o filho', [errorMessage(error)]);
      }
    });

    return form;
  }

  function renderChip(label: string, onRemove?: () => void): HTMLElement {
    const chip = element('span', 'editor__chip', label);
    if (onRemove) {
      const remove = element('button', 'editor__chip-remove', '×');
      remove.type = 'button';
      remove.title = `Remover ${label}`;
      remove.setAttribute('aria-label', `Remover ${label}`);
      remove.addEventListener('click', onRemove);
      chip.append(remove);
    }
    return chip;
  }

  function renderAddRow(
    label: string,
    optionsList: Array<{ value: string; label: string }>,
    actionLabel: string,
    onAdd: (value: string) => void,
  ): HTMLElement {
    const wrapper = element('div', 'editor__add');
    wrapper.append(element('span', 'editor__add-label', label));

    const row = element('div', 'editor__inline-row');
    const select = element('select', 'editor__input');
    select.setAttribute('aria-label', label);
    for (const option of optionsList) {
      const node = element('option', undefined, option.label);
      node.value = option.value;
      select.append(node);
    }
    const button = element('button', 'editor__secondary', actionLabel);
    button.type = 'button';
    button.addEventListener('click', () => {
      if (select.value) onAdd(select.value);
    });
    row.append(select, button);
    wrapper.append(row);
    return wrapper;
  }

  function renderConfirm(message: string, onConfirm: () => void): HTMLElement {
    const box = element('div', 'editor__confirm');
    box.append(element('p', 'editor__confirm-text', message));
    const actions = element('div', 'editor__actions');
    actions.append(
      actionButton('Confirmar exclusão', 'editor__danger', onConfirm),
      actionButton('Cancelar', 'editor__ghost', () => {
        confirmDelete = null;
        render();
      }),
    );
    box.append(actions);
    return box;
  }

  function setDocument(next: FamilyData, focus?: EditorFocus): void {
    data = next;
    if (focus) applyFocus(focus);
    else applyFocus();
    mode = 'person';
    newUnionOpen = false;
    confirmDelete = null;
    clearError();
    renderStatus();
    render();
  }

  function focusInitial(): void {
    if (focusUnionId) {
      const card = scroll.querySelector<HTMLElement>(
        `[data-union-id="${CSS.escape(focusUnionId)}"]`,
      );
      if (card) {
        card.focus({ preventScroll: true });
        card.scrollIntoView({ block: 'nearest' });
        return;
      }
    }
    const selector = scroll.querySelector<HTMLElement>(
      'select[aria-label="Pessoa em edição"]',
    );
    if (selector) {
      selector.focus({ preventScroll: true });
      return;
    }
    panel.focus({ preventScroll: true });
  }

  function open(focus?: EditorFocus): void {
    if (!data) return;
    if (focus) applyFocus(focus);
    else applyFocus();
    mode = 'person';
    newUnionOpen = false;
    confirmDelete = null;
    clearError();
    renderStatus();
    render();

    const wasOpen = panelOpen;
    panelOpen = true;
    panel.hidden = false;
    if (!wasOpen) {
      options.onOpenChange?.(true);
      focusInitial();
    }
  }

  function close(): void {
    if (!panelOpen) return;
    panelOpen = false;
    panel.hidden = true;
    options.onOpenChange?.(false);
  }

  closeButton.addEventListener('click', close);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !panelOpen) return;
    close();
  };
  document.addEventListener('keydown', onKeyDown);

  return {
    open,
    close,
    isOpen: () => panelOpen,
    setDocument,
    setStatus,
    showError,
    destroy(): void {
      document.removeEventListener('keydown', onKeyDown);
      panel.remove();
    },
  };
}
