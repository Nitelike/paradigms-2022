"use strict";

const vars = ["x", "y", "z"];
const operations = {};

function createAbstractOperation() {
    const res = function (...operands) {
        this.operands = operands;
    }
    res.prototype.evaluate = function(...varValues) {
        return this.operation(...(this.operands.map(operand => operand.evaluate(...varValues))));
    };
    res.prototype.toString = function() {
        return this.operands.map(operand => operand.toString()).join(" ") + " " + this.operationString;
    };
    res.prototype.prefix = function() {
        return "(" + this.operationString + " " + this.operands.map(operand => operand.prefix()).join(" ") + ")";
    };
    res.prototype.postfix = function() {
        return "(" + this.operands.map(operand => operand.postfix()).join(" ") + " " + this.operationString + ")";
    };
    res.prototype.diff = function(varName) {
        return this.operationDerivative(varName, ...(this.operands));
    };
    return res;
}

const abstractOperation = createAbstractOperation();

function createOperation(operationString, operation, operationDerivative) {
    const res = function(...operands) {
        abstractOperation.call(this, ...operands);
    }
    res.prototype = Object.create(abstractOperation.prototype);
    res.prototype.constructor = res;
    res.prototype.operationString = operationString;
    res.prototype.operation = operation;
    res.prototype.operationDerivative = operationDerivative;
    res.arity = operation.length;
    operations[operationString] = res;
    return res;
}

function createConst() {
    const res = function(value) {
        this.value = value;
    }
    res.ZERO = new res(0);
    res.ONE = new res(1);
    res.TWO = new res(2);
    res.E = new res(Math.E);
    res.prototype.diff = () => Const.ZERO;
    res.prototype.evaluate = function() { return this.value };
    res.prototype.toString = function() { return this.value.toString() };
    res.prototype.prefix = function() { return this.value.toString() };
    res.prototype.postfix = function() { return this.value.toString() };
    return res;
}

const Const = createConst();

function createVariable() {
    const res = function(varName) {
        this.varName = varName;
    }
    res.prototype.diff = function(difVarName) { return difVarName === this.varName ? Const.ONE : Const.ZERO };
    res.prototype.evaluate = function(...varValues) { return varValues[vars.indexOf(this.varName)] };
    res.prototype.toString = function() { return this.varName };
    res.prototype.prefix = function() { return this.varName };
    res.prototype.postfix = function() { return this.varName };
    return res;
}

const Variable = createVariable();

const Add = createOperation("+", (x, y) => x + y, 
        (varName, x, y) => new Add(x.diff(varName), y.diff(varName)));

const Subtract = createOperation("-", (x, y) => x - y, 
        (varName, x, y) => new Subtract(x.diff(varName), y.diff(varName)));

const Negate = createOperation("negate", (x) => -x, 
        (varName, x) => new Negate(x.diff(varName)));

const Multiply = createOperation("*", (x, y) => x * y, 
        (varName, x, y) => new Add(new Multiply(x.diff(varName), y), new Multiply(x, y.diff(varName))));

const Divide = createOperation("/", (x, y) => x / y, 
        (varName, x, y) => new Divide(
            new Subtract(new Multiply(x.diff(varName), y), 
            new Multiply(x, y.diff(varName))), new Multiply(y, y)));

const Pow = createOperation("pow", (x, y) => Math.pow(x, y),
        (varName, x, y) => new Multiply(
            new Pow(x, new Subtract(y, Const.ONE)), 
            new Add(
                new Multiply(y, x.diff(varName)), 
                new Multiply(new Multiply(x, y.diff(varName)), new Log(Const.E, x)))));

const Log = createOperation("log", (x, y) => Math.log(Math.abs(y)) / Math.log(Math.abs(x)), 
        (varName, x, y) => new Divide(
            new Subtract(
                new Multiply(new Multiply(new Log(Const.E, x), y.diff(varName)), new Divide(Const.ONE, y)), 
                new Multiply(new Multiply(new Log(Const.E, y), x.diff(varName)), new Divide(Const.ONE, x))),
            new Multiply(new Log(Const.E, x), new Log(Const.E, x))));

const avg = (arr) => arr.reduce((x, y) => x + y, 0) / arr.length;
const square = (x) => x * x;

const Mean = createOperation("mean",
    (...args) => avg(args),
    (varName, ...args) => new Divide(args.reduce((x, y) => new Add(x, y), Const.ZERO).diff(varName), new Const(args.length)));

const Square = (x) => new Multiply(x, x);

const Var = createOperation("var",
    (...args) => avg(args.map(square)) - square(avg(args)),
    (varName, ...args) => new Subtract(
        new Mean(...args.map(Square)),
        Square(new Mean(...args))).diff(varName));

class ParseError extends Error {
    constructor(message, pos = undefined) {
        super(message + (pos === undefined ? "" : " at pos " + pos));
        this.name = "ParseError";
    }
}

class InvalidOperationError extends ParseError {
    constructor(message, pos) {
        super(message, pos);
        this.name = "InvalidOperationError";
    }
}

class InvalidFormatError extends ParseError {
    constructor(message, pos = undefined) {
        super(message, pos);
        this.name = "InvalidFormatError";
    }
}

function parseWithBrackets(operationAtStart) {
    return (expression) => {
        let start = 0, end = expression.length - 1; // [start, end]
        function isWhitespace() {
            return /\s/.test(expression[start]);
        }
        function skipWhitespaces() {
            while (start <= end && isWhitespace()) {
                start++;
            }
        }
        function parseToken() {
            const startPos = start;
            if (expression[start] === '(') {
                return parseOperation();
            }
            let token = "";
            while (start <= end && !isWhitespace() && expression[start] !== '(' && expression[start] !== ')') {
                token += expression[start++];
            }
            if (token.length === 0) {
                throw new InvalidFormatError("Empty token", startPos);
            } else if (vars.includes(token)) {
                return new Variable(token);
            } else if (!isNaN(token)) {
                return new Const(parseInt(token));
            } else if (token in operations) {
                return token;
            } else {
                throw new InvalidFormatError("Unknown token: " + token, startPos);
            }
        }
        function parseOperation() {
            const startPos = start;
            const tokens = [];
            const operationStrings = [];
            start++;
            skipWhitespaces();
            while (start <= end && expression[start] !== ')') {
                const curToken = parseToken();
                if (typeof curToken === "string") {
                    operationStrings.push([curToken, tokens.length]);
                } else {
                    tokens.push(curToken);
                }
                skipWhitespaces();
            }
            if (start > end || expression[start] !== ')') {
                throw new InvalidFormatError(") expected", start);
            }
            start++;
            if (operationStrings.length !== 1) {
                throw new InvalidOperationError("Invalid expression (expected one operation per (...) block " +
                    "but parsed " + operationStrings.length + " operations)", startPos);
            }
            const operationString = operationStrings[0][0];
            if (operationStrings[0][1] !== (operationAtStart ? 0 : tokens.length)) {
                throw new InvalidOperationError("Invalid operation position (operation: " + operationString + ")", startPos);
            }
            if (tokens.length === 0 || (operations[operationString].arity !== 0 && operations[operationString].arity !== tokens.length)) {
                throw new InvalidOperationError("Invalid amount of arguments (" + tokens.length + ") for operation " + operationString, startPos);
            }
            return new operations[operationString](...tokens);
        }
        skipWhitespaces();
        const res = parseToken();
        skipWhitespaces();
        if (start <= end) {
            throw new InvalidFormatError("Expected end of expression", start);
        } else if (typeof res === "string") {
            throw new InvalidFormatError("Invalid expression which contains only operation");
        }
        return res;
    }
}

const parsePrefix = parseWithBrackets(true);
const parsePostfix = parseWithBrackets(false);

function parse(expression) {
    const tokens = expression.trim().split(/\s+/);
    const stack = [];
    for (const token of tokens) {
        if (token in operations) {
            stack.push(new operations[token](...stack.splice(stack.length - operations[token].arity)));
        } else if (vars.includes(token)) {
            stack.push(new Variable(token));
        } else if (!isNaN(token)) {
            stack.push(new Const(parseInt(token)));
        }
    }
    return stack[0];
}