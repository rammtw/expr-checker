(function () {
  "use strict";

  function readString(source, start) {
    const quote = source[start];
    const escapes = {
      '"': '"',
      "'": "'",
      "\\": "\\",
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t"
    };
    let value = "";
    let position = start + 1;

    while (position < source.length) {
      const char = source[position];

      if (char === quote) {
        return { value, end: position + 1 };
      }

      if (char === "\n" || char === "\r") {
        throw new Error(`Незакрытая строка на позиции ${start + 1}`);
      }

      if (char !== "\\") {
        value += char;
        position += 1;
        continue;
      }

      position += 1;
      if (position >= source.length) {
        break;
      }

      const escaped = source[position];
      if (escaped === "u") {
        const code = source.slice(position + 1, position + 5);
        if (!/^[0-9A-Fa-f]{4}$/.test(code)) {
          throw new Error(`Некорректная Unicode-последовательность на позиции ${position + 1}`);
        }
        value += String.fromCharCode(Number.parseInt(code, 16));
        position += 5;
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(escapes, escaped)) {
        throw new Error(`Неизвестная escape-последовательность «\\${escaped}»`);
      }
      value += escapes[escaped];
      position += 1;
    }

    throw new Error(`Незакрытая строка на позиции ${start + 1}`);
  }

  function tokenize(source) {
    const tokens = [];
    const operators = ["===", "!==", "==", "!=", ">=", "<=", "&&", "||", ">", "<", "!", "(", ")"];
    let position = 0;

    while (position < source.length) {
      const char = source[position];

      if (/\s/.test(char)) {
        position += 1;
        continue;
      }

      const operator = operators.find((item) => source.startsWith(item, position));
      if (operator) {
        tokens.push({ type: operator, position });
        position += operator.length;
        continue;
      }

      if (char === '"' || char === "'") {
        const string = readString(source, position);
        tokens.push({ type: "literal", value: string.value, position });
        position = string.end;
        continue;
      }

      const number = source.slice(position).match(/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      if (number) {
        const value = Number(number[0]);
        if (!Number.isFinite(value)) {
          throw new Error(`Некорректное число на позиции ${position + 1}`);
        }
        tokens.push({ type: "literal", value, position });
        position += number[0].length;
        continue;
      }

      const identifier = source.slice(position).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
      if (identifier) {
        const name = identifier[0];
        if (name === "true" || name === "false") {
          tokens.push({ type: "literal", value: name === "true", position });
        } else if (name === "null") {
          tokens.push({ type: "literal", value: null, position });
        } else {
          tokens.push({ type: "identifier", value: name, position });
        }
        position += name.length;
        continue;
      }

      throw new Error(`Неожиданный символ «${char}» на позиции ${position + 1}`);
    }

    tokens.push({ type: "eof", position });
    return tokens;
  }

  function parseExpression(source) {
    const tokens = tokenize(source);
    let current = 0;

    function peek() {
      return tokens[current];
    }

    function consume(type) {
      const token = peek();
      if (token.type !== type) {
        throw new Error(`Ожидалось «${type}» на позиции ${token.position + 1}`);
      }
      current += 1;
      return token;
    }

    function parseOr() {
      let left = parseAnd();
      while (peek().type === "||") {
        current += 1;
        left = { type: "or", left, right: parseAnd() };
      }
      return left;
    }

    function parseAnd() {
      let left = parseEquality();
      while (peek().type === "&&") {
        current += 1;
        left = { type: "and", left, right: parseEquality() };
      }
      return left;
    }

    function parseEquality() {
      let left = parseRelational();
      while (["==", "!=", "===", "!=="].includes(peek().type)) {
        const operator = peek().type;
        current += 1;
        left = { type: "comparison", operator, left, right: parseRelational() };
      }
      return left;
    }

    function parseRelational() {
      let left = parseUnary();
      while ([">", "<", ">=", "<="].includes(peek().type)) {
        const operator = peek().type;
        current += 1;
        left = { type: "comparison", operator, left, right: parseUnary() };
      }
      return left;
    }

    function parseUnary() {
      if (peek().type === "!") {
        current += 1;
        return { type: "not", value: parseUnary() };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const token = peek();

      if (token.type === "literal") {
        current += 1;
        return { type: "literal", value: token.value };
      }

      if (token.type === "identifier") {
        current += 1;
        return { type: "variable", name: token.value };
      }

      if (token.type === "(") {
        current += 1;
        const expression = parseOr();
        consume(")");
        return expression;
      }

      const found = token.type === "eof" ? "конец выражения" : `«${token.type}»`;
      throw new Error(`Ожидалась переменная, значение или «(», получен ${found}`);
    }

    if (tokens.length === 1) {
      throw new Error("Введите выражение");
    }

    const expression = parseOr();
    if (peek().type !== "eof") {
      throw new Error(`Неожиданный токен «${peek().type}» на позиции ${peek().position + 1}`);
    }

    return expression;
  }

  function expectBoolean(value, operator) {
    if (typeof value !== "boolean") {
      throw new Error(`Оператор «${operator}» работает только с boolean`);
    }
    return value;
  }

  function evaluate(node, variables) {
    switch (node.type) {
      case "literal":
        return node.value;
      case "variable": {
        if (!Object.prototype.hasOwnProperty.call(variables, node.name)) {
          throw new Error(`Переменная «${node.name}» не определена`);
        }
        const value = variables[node.name];
        if (value !== null && !["boolean", "number", "string"].includes(typeof value)) {
          throw new Error(`Переменная «${node.name}» должна быть boolean, number, string или null`);
        }
        return value;
      }
      case "not":
        return !expectBoolean(evaluate(node.value, variables), "!");
      case "and": {
        const left = expectBoolean(evaluate(node.left, variables), "&&");
        return left && expectBoolean(evaluate(node.right, variables), "&&");
      }
      case "or": {
        const left = expectBoolean(evaluate(node.left, variables), "||");
        return left || expectBoolean(evaluate(node.right, variables), "||");
      }
      case "comparison": {
        const left = evaluate(node.left, variables);
        const right = evaluate(node.right, variables);
        switch (node.operator) {
          case "==": return left == right;
          case "!=": return left != right;
          case "===": return left === right;
          case "!==": return left !== right;
          case ">": return left > right;
          case "<": return left < right;
          case ">=": return left >= right;
          case "<=": return left <= right;
          default: throw new Error(`Неизвестный оператор «${node.operator}»`);
        }
      }
      default:
        throw new Error("Неизвестный узел выражения");
    }
  }

  function evaluateExpression(source, variables) {
    return evaluate(parseExpression(source), variables);
  }

  const api = { parseExpression, evaluate, evaluateExpression };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    window.BooleanExpression = api;
  }
})();
