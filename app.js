"use strict";

const STORAGE_KEY = "boolean-test.workspace.v1";

const form = document.getElementById("test-form");
const testSelect = document.getElementById("test-select");
const testNameInput = document.getElementById("test-name");
const expressionInput = document.getElementById("expression");
const DEFAULT_DATA_PROVIDER = JSON.stringify([
  {
    name: "Администратор без блокировки",
    variables: { isAdmin: true, isOwner: false, isBanned: false },
    expected: true
  },
  {
    name: "Владелец с блокировкой",
    variables: { isAdmin: false, isOwner: true, isBanned: true },
    expected: false
  },
  {
    name: "Обычный пользователь",
    variables: { isAdmin: false, isOwner: false, isBanned: false },
    expected: false
  }
], null, 2);
let dataProvider = DEFAULT_DATA_PROVIDER;
const casesEditor = document.getElementById("cases-editor");
const addCaseButton = document.getElementById("add-case");
const newTestButton = document.getElementById("new-test");
const deleteTestButton = document.getElementById("delete-test");
const saveStatus = document.getElementById("save-status");
const formError = document.getElementById("form-error");
const summary = document.getElementById("summary");
const tableWrapper = document.getElementById("table-wrapper");
const resultsBody = document.getElementById("results-body");
const expressionTooltip = document.getElementById("expression-tooltip");

let tests = [];
let activeTestId = null;
let editorCases = [];

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function createDefaultTest() {
  return {
    id: createId(),
    name: "Доступ пользователя",
    expression: expressionInput.value,
    dataProvider: dataProvider
  };
}

function normalizeTest(test) {
  if (!test || typeof test !== "object" || Array.isArray(test)) {
    return null;
  }
  if (typeof test.expression !== "string" || typeof test.dataProvider !== "string") {
    return null;
  }

  return {
    id: typeof test.id === "string" && test.id ? test.id : createId(),
    name: typeof test.name === "string" ? test.name : "Без названия",
    expression: test.expression,
    dataProvider: test.dataProvider
  };
}

function loadWorkspace() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.tests)) {
      tests = [createDefaultTest()];
      activeTestId = tests[0].id;
      return;
    }

    const usedIds = new Set();
    tests = saved.tests.map(normalizeTest).filter((test) => {
      if (!test || usedIds.has(test.id)) {
        return false;
      }
      usedIds.add(test.id);
      return true;
    });

    if (tests.length === 0) {
      tests = [createDefaultTest()];
    }
    activeTestId = tests.some((test) => test.id === saved.activeTestId)
      ? saved.activeTestId
      : tests[0].id;
  } catch (error) {
    tests = [createDefaultTest()];
    activeTestId = tests[0].id;
  }
}

function saveWorkspace() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tests, activeTestId }));
    saveStatus.textContent = "Сохранено в этом браузере.";
    saveStatus.classList.remove("error");
  } catch (error) {
    saveStatus.textContent = "Не удалось сохранить: localStorage недоступен.";
    saveStatus.classList.add("error");
  }
}

function getActiveTest() {
  return tests.find((test) => test.id === activeTestId);
}

function syncActiveTest() {
  const test = getActiveTest();
  if (!test) {
    return;
  }

  test.name = testNameInput.value;
  test.expression = expressionInput.value;
  test.dataProvider = dataProvider;
}

function normalizeEditorVariable(name, value) {
  const valueType = value === null ? "null" : typeof value;
  const type = ["boolean", "number", "string", "null"].includes(valueType) ? valueType : "string";
  return {
    name,
    type,
    value: type === "string" && typeof value !== "string" ? JSON.stringify(value) : value
  };
}

function parseEditorCases(source) {
  const cases = JSON.parse(source);
  if (!Array.isArray(cases)) {
    throw new Error("Data provider должен содержать массив кейсов");
  }

  return cases.map((testCase) => {
    const variables = testCase.variables && typeof testCase.variables === "object" && !Array.isArray(testCase.variables)
      ? Object.entries(testCase.variables).map(([name, value]) => normalizeEditorVariable(name, value))
      : [];
    return {
      name: typeof testCase.name === "string" ? testCase.name : "",
      variables,
      expected: testCase.expected !== false,
      collapsed: variables.length > 0
    };
  });
}

function convertVariableValue(variable, validate, caseNumber) {
  if (variable.type === "boolean") {
    return variable.value === true || variable.value === "true";
  }
  if (variable.type === "null") {
    return null;
  }
  if (variable.type === "number") {
    const value = Number(variable.value);
    if (variable.value === "" || !Number.isFinite(value)) {
      if (validate) {
        throw new Error(`Кейс ${caseNumber}: укажите корректное число для переменной «${variable.name}»`);
      }
      return 0;
    }
    return value;
  }
  return variable.value == null ? "" : String(variable.value);
}

function syncEditorToProvider(validate = false) {
  const cases = editorCases.map((testCase, caseIndex) => {
    const variables = {};
    const caseNumber = caseIndex + 1;

    for (const variable of testCase.variables) {
      const name = variable.name.trim();
      if (validate && !name) {
        throw new Error(`Кейс ${caseNumber}: введите имя переменной`);
      }
      if (validate && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
        throw new Error(`Кейс ${caseNumber}: «${name}» недопустимое имя переменной`);
      }
      if (validate && Object.prototype.hasOwnProperty.call(variables, name)) {
        throw new Error(`Кейс ${caseNumber}: переменная «${name}» добавлена несколько раз`);
      }
      if (name) {
        variables[name] = convertVariableValue(variable, validate, caseNumber);
      }
    }

    return { name: testCase.name, variables, expected: testCase.expected };
  });

  dataProvider = JSON.stringify(cases, null, 2);
}

function handleEditorChange() {
  syncEditorToProvider();
  syncActiveTest();
  saveWorkspace();
  runTests();
}

function createSelect(options, value, ariaLabel) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", ariaLabel);

  for (const [optionValue, text] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = text;
    select.append(option);
  }
  select.value = value;
  return select;
}

function createEditorButton(text, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

function createVariableValueEditor(variable) {
  let input;

  if (variable.type === "boolean") {
    input = createSelect([["true", "true"], ["false", "false"]], String(variable.value === true || variable.value === "true"), "Значение переменной");
  } else {
    input = document.createElement("input");
    input.setAttribute("aria-label", "Значение переменной");
    if (variable.type === "number") {
      input.type = "number";
      input.step = "any";
    } else {
      input.type = "text";
    }
    input.value = variable.type === "null" ? "null" : variable.value;
    input.disabled = variable.type === "null";
  }

  input.classList.add("variable-value");
  input.addEventListener("input", () => {
    variable.value = input.value;
    handleEditorChange();
  });
  return input;
}

function updateExpectedSelectColor(select) {
  select.classList.toggle("expected-true", select.value === "true");
  select.classList.toggle("expected-false", select.value === "false");
}

function moveCase(caseIndex, targetIndex) {
  if (targetIndex < 0 || targetIndex >= editorCases.length) {
    return;
  }
  const [movedCase] = editorCases.splice(caseIndex, 1);
  editorCases.splice(targetIndex, 0, movedCase);
  renderCaseEditor();
  handleEditorChange();
}

function renderCaseEditor() {
  casesEditor.replaceChildren();

  editorCases.forEach((testCase, caseIndex) => {
    const card = document.createElement("details");
    card.className = "case-card";
    card.open = !testCase.collapsed;
    card.addEventListener("toggle", () => {
      testCase.collapsed = !card.open;
    });

    const header = document.createElement("summary");
    header.className = "case-header";
    const dragHandle = document.createElement("span");
    dragHandle.className = "case-drag-handle";
    dragHandle.textContent = "⋮⋮";
    dragHandle.draggable = true;
    dragHandle.title = "Перетащить кейс";
    dragHandle.setAttribute("aria-label", "Перетащить кейс");
    dragHandle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    dragHandle.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", String(caseIndex));
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("is-dragging");
    });
    dragHandle.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
      casesEditor.querySelectorAll(".drag-over").forEach((element) => element.classList.remove("drag-over"));
    });

    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      card.classList.add("drag-over");
    });
    card.addEventListener("dragleave", (event) => {
      if (!card.contains(event.relatedTarget)) {
        card.classList.remove("drag-over");
      }
    });
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      const sourceIndex = Number(event.dataTransfer.getData("text/plain"));
      if (Number.isInteger(sourceIndex) && sourceIndex !== caseIndex) {
        moveCase(sourceIndex, caseIndex);
      }
    });

    const title = document.createElement("span");
    title.className = "case-title";
    title.textContent = `Кейс ${caseIndex + 1}`;
    const summaryName = document.createElement("span");
    summaryName.className = "case-summary-name";
    summaryName.textContent = testCase.name || "Без названия";

    const actions = document.createElement("span");
    actions.className = "case-actions";
    actions.append(
      createEditorButton("Удалить", "secondary small danger", (event) => {
        event.preventDefault();
        event.stopPropagation();
        editorCases.splice(caseIndex, 1);
        renderCaseEditor();
        handleEditorChange();
      })
    );
    header.append(dragHandle, title, summaryName, actions);

    const content = document.createElement("div");
    content.className = "case-content";

    const nameLabel = document.createElement("label");
    nameLabel.className = "case-name";
    nameLabel.textContent = "Название кейса";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = testCase.name;
    nameInput.addEventListener("input", () => {
      testCase.name = nameInput.value;
      summaryName.textContent = nameInput.value || "Без названия";
      handleEditorChange();
    });
    nameLabel.append(nameInput);

    const variablesHeading = document.createElement("div");
    variablesHeading.className = "variables-heading";
    const variablesTitle = document.createElement("span");
    variablesTitle.textContent = "Переменные";
    variablesHeading.append(
      variablesTitle,
      createEditorButton("Добавить переменную", "secondary small", () => {
        let number = testCase.variables.length + 1;
        while (testCase.variables.some((variable) => variable.name === `variable${number}`)) {
          number += 1;
        }
        testCase.variables.push({ name: `variable${number}`, type: "boolean", value: true });
        renderCaseEditor();
        handleEditorChange();
      })
    );

    const variableList = document.createElement("div");
    variableList.className = "variable-list";

    if (testCase.variables.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-text";
      empty.textContent = "Переменные не добавлены.";
      variableList.append(empty);
    }

    testCase.variables.forEach((variable, variableIndex) => {
      const row = document.createElement("div");
      row.className = "variable-row";

      const name = document.createElement("input");
      name.type = "text";
      name.placeholder = "Имя";
      name.setAttribute("aria-label", "Имя переменной");
      name.value = variable.name;
      name.addEventListener("input", () => {
        variable.name = name.value;
        handleEditorChange();
      });

      const type = createSelect([
        ["boolean", "Boolean"],
        ["number", "Number"],
        ["string", "String"],
        ["null", "Null"]
      ], variable.type, "Тип переменной");
      type.addEventListener("change", () => {
        const previousValue = variable.value;
        variable.type = type.value;
        if (variable.type === "boolean") {
          variable.value = previousValue === true || previousValue === "true";
        } else if (variable.type === "number") {
          const number = Number(previousValue);
          variable.value = previousValue !== "" && Number.isFinite(number) ? number : 0;
        } else if (variable.type === "string") {
          variable.value = previousValue == null ? "" : String(previousValue);
        } else {
          variable.value = null;
        }
        renderCaseEditor();
        handleEditorChange();
      });

      row.append(
        name,
        type,
        createVariableValueEditor(variable),
        createEditorButton("Удалить", "secondary small remove-variable", () => {
          testCase.variables.splice(variableIndex, 1);
          renderCaseEditor();
          handleEditorChange();
        })
      );
      variableList.append(row);
    });

    const expectedLabel = document.createElement("label");
    expectedLabel.className = "expected-result";
    expectedLabel.textContent = "Ожидаемый результат";
    const expected = createSelect([["true", "true"], ["false", "false"]], String(testCase.expected), "Ожидаемый результат");
    updateExpectedSelectColor(expected);
    expected.addEventListener("change", () => {
      testCase.expected = expected.value === "true";
      updateExpectedSelectColor(expected);
      handleEditorChange();
    });
    expectedLabel.append(expected);

    content.append(nameLabel, variablesHeading, variableList, expectedLabel);
    card.append(header, content);
    casesEditor.append(card);
  });
}

function renderTestOptions() {
  testSelect.replaceChildren();

  for (const test of tests) {
    const option = document.createElement("option");
    option.value = test.id;
    option.textContent = test.name || "Без названия";
    testSelect.append(option);
  }

  testSelect.value = activeTestId;
  deleteTestButton.disabled = tests.length === 1;
}

function showActiveTest() {
  const test = getActiveTest();
  testNameInput.value = test.name;
  expressionInput.value = test.expression;
  dataProvider = test.dataProvider;
  try {
    editorCases = parseEditorCases(test.dataProvider);
  } catch (error) {
    editorCases = [];
  }
  renderCaseEditor();
  runTests();
}

function expressionPrecedence(node) {
  if (node.type === "or") return 1;
  if (node.type === "and") return 2;
  if (node.type === "comparison") {
    return ["==", "!=", "===", "!=="].includes(node.operator) ? 3 : 4;
  }
  if (node.type === "not") return 5;
  return 6;
}

function formatExpressionValue(value) {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

function renderExpressionNode(node, variables, parentPrecedence = 0, rightSide = false, evaluated = true) {
  const element = document.createElement("span");
  element.className = "expression-node";
  element.tabIndex = 0;

  if (evaluated) {
    try {
      const value = BooleanExpression.evaluate(node, variables);
      element.dataset.result = `Результат: ${formatExpressionValue(value)}`;
    } catch (error) {
      element.dataset.result = `Ошибка: ${error.message}`;
    }
  } else {
    element.dataset.result = "Не вычислялось (короткое замыкание)";
  }

  const precedence = expressionPrecedence(node);
  const needsParentheses = precedence < parentPrecedence
    || (rightSide && node.type === "comparison" && precedence === parentPrecedence);
  if (needsParentheses) {
    element.append("(");
  }

  if (node.type === "literal") {
    element.append(formatExpressionValue(node.value));
  } else if (node.type === "variable") {
    element.append(node.name);
  } else if (node.type === "not") {
    element.append("!", renderExpressionNode(node.value, variables, precedence, false, evaluated));
  } else {
    const operator = node.type === "and" ? "&&" : node.type === "or" ? "||" : node.operator;
    element.append(renderExpressionNode(node.left, variables, precedence, false, evaluated));
    element.append(` ${operator} `);

    let rightEvaluated = evaluated;
    if (evaluated && (node.type === "and" || node.type === "or")) {
      try {
        const leftValue = BooleanExpression.evaluate(node.left, variables);
        rightEvaluated = node.type === "and" ? leftValue : !leftValue;
      } catch (error) {
        rightEvaluated = true;
      }
    }
    element.append(renderExpressionNode(node.right, variables, precedence, true, rightEvaluated));
  }

  if (needsParentheses) {
    element.append(")");
  }
  return element;
}

function createExpressionBreakdown(expression, variables) {
  return renderExpressionNode(expression, variables);
}

let activeExpressionNode = null;

function setActiveExpressionNode(node) {
  if (activeExpressionNode) {
    activeExpressionNode.classList.remove("is-active");
  }
  activeExpressionNode = node;
  if (activeExpressionNode) {
    activeExpressionNode.classList.add("is-active");
  }
}

function hideExpressionTooltip() {
  expressionTooltip.hidden = true;
  setActiveExpressionNode(null);
}

function showExpressionTooltip(target) {
  setActiveExpressionNode(target);
  expressionTooltip.textContent = target.dataset.result;
  expressionTooltip.hidden = false;

  const targetRect = target.getBoundingClientRect();
  const tooltipRect = expressionTooltip.getBoundingClientRect();
  const left = Math.max(8, Math.min(targetRect.left, window.innerWidth - tooltipRect.width - 8));
  const above = targetRect.top - tooltipRect.height - 8;
  expressionTooltip.style.left = `${left}px`;
  expressionTooltip.style.top = `${above >= 8 ? above : targetRect.bottom + 8}px`;
}

function handleExpressionPointer(event) {
  const node = event.target.closest(".expression-node");
  if (node) {
    showExpressionTooltip(node);
  } else {
    hideExpressionTooltip();
  }
}

resultsBody.addEventListener("pointerover", handleExpressionPointer);
resultsBody.addEventListener("pointermove", handleExpressionPointer);
resultsBody.addEventListener("pointerleave", hideExpressionTooltip);
resultsBody.addEventListener("focusin", (event) => {
  const node = event.target.closest(".expression-node");
  if (node) {
    showExpressionTooltip(node);
  }
});
resultsBody.addEventListener("focusout", hideExpressionTooltip);

function runCase(testCase, index, expression) {
  const fallbackName = `Кейс ${index + 1}`;

  try {
    if (!testCase || typeof testCase !== "object" || Array.isArray(testCase)) {
      throw new Error("Кейс должен быть объектом");
    }
    if (!testCase.variables || typeof testCase.variables !== "object" || Array.isArray(testCase.variables)) {
      throw new Error("Поле variables должно быть объектом");
    }
    if (typeof testCase.expected !== "boolean") {
      throw new Error("Поле expected должно иметь тип boolean");
    }

    const actual = BooleanExpression.evaluate(expression, testCase.variables);
    if (typeof actual !== "boolean") {
      throw new Error("Выражение должно возвращать boolean");
    }
    return {
      name: testCase.name || fallbackName,
      expected: testCase.expected,
      actual: String(actual),
      breakdown: createExpressionBreakdown(expression, testCase.variables),
      passed: actual === testCase.expected,
      error: null
    };
  } catch (error) {
    return {
      name: testCase && typeof testCase === "object" && !Array.isArray(testCase)
        ? testCase.name || fallbackName
        : fallbackName,
      expected: testCase && typeof testCase.expected === "boolean" ? testCase.expected : "—",
      actual: "—",
      breakdown: null,
      passed: false,
      error: error.message
    };
  }
}

function createCell(text, className) {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) {
    cell.className = className;
  }
  return cell;
}

function renderResults(results) {
  resultsBody.replaceChildren();
  hideExpressionTooltip();

  for (const result of results) {
    const row = document.createElement("tr");
    const breakdownCell = createCell("", "breakdown");
    if (result.breakdown) {
      breakdownCell.append(result.breakdown);
    } else {
      breakdownCell.textContent = "—";
    }

    row.append(
      createCell(String(result.name)),
      createCell(String(result.expected)),
      createCell(result.actual),
      breakdownCell,
      createCell(
        result.error ? `ОШИБКА: ${result.error}` : result.passed ? "PASS" : "FAIL",
        `status ${result.passed ? "pass" : "fail"}`
      )
    );
    resultsBody.append(row);
  }

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  summary.textContent = `Всего: ${results.length} · Успешно: ${passed} · Упало: ${failed}`;
  tableWrapper.hidden = results.length === 0;
}

function runTests() {
  formError.hidden = true;
  tableWrapper.hidden = true;

  try {
    syncEditorToProvider(true);
    syncActiveTest();
    saveWorkspace();
    const expression = BooleanExpression.parseExpression(expressionInput.value);
    const cases = JSON.parse(dataProvider);
    renderResults(cases.map((testCase, index) => runCase(testCase, index, expression)));
  } catch (error) {
    formError.textContent = error.message;
    formError.hidden = false;
    summary.textContent = "Тесты не выполнены.";
    resultsBody.replaceChildren();
  }
}

for (const input of [testNameInput, expressionInput]) {
  input.addEventListener("input", () => {
    syncActiveTest();
    if (input === testNameInput) {
      testSelect.selectedOptions[0].textContent = test.name || "Без названия";
    }
    saveWorkspace();
    runTests();
  });
}

addCaseButton.addEventListener("click", () => {
  editorCases.push({
    name: `Кейс ${editorCases.length + 1}`,
    variables: [],
    expected: true,
    collapsed: false
  });
  renderCaseEditor();
  handleEditorChange();
});

testSelect.addEventListener("change", () => {
  syncActiveTest();
  activeTestId = testSelect.value;
  saveWorkspace();
  showActiveTest();
});

newTestButton.addEventListener("click", () => {
  syncActiveTest();

  let number = tests.length + 1;
  while (tests.some((test) => test.name === `Новый тест ${number}`)) {
    number += 1;
  }

  const test = {
    id: createId(),
    name: `Новый тест ${number}`,
    expression: "a && b",
    dataProvider: JSON.stringify([
      {
        name: "Оба значения истинны",
        variables: { a: true, b: true },
        expected: true
      },
      {
        name: "Одно значение ложно",
        variables: { a: true, b: false },
        expected: false
      }
    ], null, 2)
  };

  tests.push(test);
  activeTestId = test.id;
  renderTestOptions();
  saveWorkspace();
  showActiveTest();
  testNameInput.focus();
  testNameInput.select();
});

deleteTestButton.addEventListener("click", () => {
  if (tests.length === 1) {
    return;
  }

  const test = getActiveTest();
  if (!window.confirm(`Удалить тест «${test.name || "Без названия"}»?`)) {
    return;
  }

  const index = tests.findIndex((item) => item.id === activeTestId);
  tests.splice(index, 1);
  activeTestId = tests[Math.min(index, tests.length - 1)].id;
  renderTestOptions();
  saveWorkspace();
  showActiveTest();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runTests();
});

loadWorkspace();
renderTestOptions();
showActiveTest();
saveWorkspace();
