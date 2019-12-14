'use strict';

//# error - error function factory
const error = (name) => {
	return (msg, coords, callstack) => {
		let e = Error(name + 'Error: ' + msg);
//		# e.coords - line and column of error
		e._jyfcoords = coords;
		e._jyfcallstack = callstack;
		e._jyftype = type.error;
		throw e;
	};
};

//# error types
const parse_error = error('Parse');
const tokenize_error = error('Tokenize');
const runtime_error = error('Runtime');

//# type - contains _jyftype sentinels
const type = {
	error: Symbol('error'),
	atom: Symbol('atom'),
	binding: Symbol('binding'),
	list: Symbol('list'),
	funcall: Symbol('funcall'),
	fun: Symbol('fun'),
	macro: Symbol('macro')
};

//# typecheck - typechecks _jyftype and regular objects(
const typecheck = (v, t) => {
	return v._jyftype === t || typeof v === t;
};

//# token - token factory
const token = (type, text, coords) => {
	return {
		type: type || 'none',
		text: text || '',
		coords: coords || {
			file: 'native'
		}
	};
};

//# patterns - syntax patterns: [[regex, name]], regex has to match from ^
const patterns = [
	[/^#.*(?=\n??)/, 'whitespace'],
	[/^[\f\n\r\t\v ]+/, 'whitespace'],
	[/^"([^']|\\.)*?"/, 'string'],
	[/^\(/, 'parenleft'],
	[/^\)/, 'parenright'],
	[/^[-+]?\d+(\.\d+)?/, 'number'],
	[/^'[^()\f\n\r\t\v ]+/, 'atom'],
	[/^[^()\f\n\r\t\v ]+/, 'binding']
];

//# tokenize - tokenize a jyf program
const tokenize = (text, filename) => {
//	# tokens - output token list: [{ type, text }]
	let tokens = [];
//	# coords - coordinates for useful errors
	let coords = {
		line: 1,
		column: 1
	};
//	# while - we have text to tokenize
	while (text.length > 0) {
//		# if - no patterns match
		if (!patterns.some((p) => {
			const reg = p[0];
			const name = p[1];
			let res = reg.exec(text);
//			# if - regex matches
			if (res) {
				let matched_text = res[0];
				tokens.push(token(name, matched_text, {
					file: filename,
					line: coords.line,
					column: coords.column
				}));
//				# text - remove match from text
				text = text.slice(matched_text.length);
//				# while - calculate line of token, removing text before newline
				while (matched_text.indexOf('\n') !== -1) {
					matched_text = matched_text.slice(matched_text.indexOf('\n') + 1);
					++coords.line;
					coords.column = 1;
				}
//				# coords.column - calculate column of token
				coords.column += matched_text.length;
			}
//			# return - truthy if regex matches
			return res;
		})) {
			throw tokenize_error('Cannot match ' + JSON.stringify(text), {
				file: coords.file,
				line: coords.line,
				column: coords.column
			});
		}
	}
//	# return - list of tokens:  [[matched_text, name]]
	return tokens;
};

//# parse - parse jyf program
const parse = (tokens) => {
	let ast;
	let next;

//	# has - checks if there is another token
	const has = () => {
		return Boolean(next);
	};

//	# is - checks token type
	const is = (type) => {
		return !type || next.type === type;
	};

//	# shift - skips to next token or 'eof'
	const shift = () => {
		let cur = next;
		next = tokens.shift() || token('eof');
		return cur;
	};

//	# consume - consumes specific type of token, or errors
	const consume = (type) => {
		if (!has() || (type !== 'eof' && is('eof'))) {
			parse_error('unexpected end of file', next.coords);
		} else if (is(type)) {
			return shift();
		} else {
			parse_error(
				'expected token ' +
				'<' + (type || 'any') + '>' +
				', found ' +
				'<' + next.type + '>',
				next.coords
			);
		}
	};

//	# parse_value - parses primitive values
	const parse_value = () => {
		switch (next.type) {
			case 'string':
				return eval(consume('string').text);
			case 'number':
				return eval(consume('number').text);
			case 'atom':
				let tok = consume('atom');
				let a = Object(tok.text.substring(1));
				a._jyftype = type.atom;
				a._jyfcoords = tok.coords;
				return a;
			default:
				parse_error(
					'expected <string | number | atom>, found ' +
					'<' + next.type + '>',
					next.coords
				);
		}
	};

//	# parse_binding - parses a variable binding
	const parse_binding = () => {
		let tok = consume('binding');
		let b = Object(tok.text);
		b._jyftype = type.binding;
		b._jyfcoords = tok.coords;
		return b;
	};

//	# parse_expr - parses an expression
	const parse_expr = () => {
		switch (next.type) {
			case 'string':
			case 'number':
			case 'atom':
				return parse_value();
			case 'binding':
				return parse_binding();
			case 'parenleft':
				return parse_list();
			default:
				parse_error(
					'expected <string | number | atom | binding | parenleft>, found ' +
					'<' + next.type + '>',
					next.coords
				);
		}
	};

//	# parse_list - parses a list
	const parse_list = () => {
		let l = [];
		l._jyftype = type.list;
		l._jyfcoords = consume('parenleft').coords;

		let needs_whitespace = false;
		while (true) {
			switch (next.type) {
				case 'parenright':
					consume('parenright');
					return l;
				case 'whitespace':
					needs_whitespace = false;
					consume('whitespace');
					break;
				default:
					if (needs_whitespace) parse_error(
						'expected <whitespace>, found ' +
						'<' + next.type + '>',
						next.coords
					);
					l.push(parse_expr_or_funcall());
					needs_whitespace = true;
			}
		}
	};

//	# parse_expr_or_funcall - parses an expression or a function call
	const parse_expr_or_funcall = () => {
		let expr = parse_expr();
		if (next.type !== 'parenleft') return expr;

		let funcall = expr;
		while (next.type === 'parenleft') {
			let args = parse_list();
			funcall = {
				fun: funcall,
				args: args,
				_jyftype: type.funcall,
				_jyfcoords: args._jyfcoords
			};
		}
		return funcall;
	};

//	# parse_program - parses a jyf program
	const parse_program = () => {
		let funcall = {
			fun: Object('do'),
			args: [],
			_jyftype: type.funcall,
		};
		funcall.fun._jyftype = type.binding;
		funcall.fun._jyfcoords = {
			file: 'native'
		};
		funcall.args._jyftype = type.list;
		funcall.args._jyfcoords = funcall.fun._jyfcoords;
		funcall._jyfcoords = funcall.args._jyfcoords;

		let needs_whitespace = false;
		while (true) {
			switch (next.type) {
				case 'eof':
					consume('eof');
					return funcall;
				case 'whitespace':
					needs_whitespace = false;
					consume('whitespace');
					break;
				default:
					if (needs_whitespace) parse_error(
						'expected <whitespace>, found ' +
						'<' + next.type + '>',
						next.coords
					);
					funcall.args.push(parse_expr_or_funcall());
					needs_whitespace = true;
			}
		}
		return funcall;
	};

	shift();
	return parse_program();
};



//# context - scoped variable system
const context = (parents) => {
	parents = parents || [];

	let dict = Object.create(null);

	const has = (atom) => {
		return String(atom) in dict;
	};

	const contains = (atom) => {
		return has(atom) || parents.some((p) => {
			return p.contains(atom);
		});
	};

	const find = (callstack, atom) => {
		let containing;
		
		if (parents.some((p) => {
			containing = p;
			return p.contains(atom);
		})) return containing;

		runtime_error(String(atom) + ' is not declared', atom._jyfcoords, callstack)
	};

	const get = (callstack, atom) => {
		if (has(atom)) {
			return dict[String(atom)];
		}
		
		return find(callstack, atom).get(callstack, atom);
	};

	const declare = (callstack, atom) => {
		if (has(atom)) {
			runtime_error(String(atom) + ' is already declared', atom._jyfcoords, callstack);
		}

		dict[String(atom)] = null;
	};

	const undeclare = (callstack, atom) => {
		if (has(atom)) {
			delete dict[String(atom)];
			return;
		}

		find(callstack, atom).undeclare(callstack, atom);
	};

	const set = (callstack, atom, value) => {
		if (has(atom)) {
			dict[String(atom)] = value;
			return;
		}

		find(callstack, atom).set(callstack, atom, value);
	};

	return {
		has: has,
		contains: contains,
		get: get,
		declare: declare,
		undeclare: undeclare,
		set: set
	};
};

//# immutable_context - immutable layer for context (interface with globals)
const immutable_context = (parents) => {
	let c = context(parents);

	const declare = (callstack, atom) => {
		runtime_error('cannot declare binding in an immutable context', atom._jyfcoords, callstack);
	};

	const undeclare = (callstack, atom) => {
		runtime_error('cannot undeclare binding in an immutable context', atom._jyfcoords, callstack);
	};

	const set = (callstack, atom, value) => {
		runtime_error('cannot set binding in an immutable context', atom._jyfcoords, callstack);
	};

	c.declare = declare;
	c.undeclare = undeclare;
	c.set = set;

	return c;
};

//# eval_expr - evaluate jyf expression
const eval_expr = (callstack, ctx, expr) => {
	if (typecheck(expr, type.list)) {
		return eval_list(callstack, ctx, expr);
	} else if (typecheck(expr, type.funcall)) {
		return eval_funcall(callstack, ctx, expr);
	} else if (typecheck(expr, type.binding)) {
		return eval_binding(callstack, ctx, expr);
	} else {
		return expr;
	}
};

//# eval_list - evaluate jyf list
const eval_list = (callstack, ctx, list) => {
	let local = context([ctx]);
	let ret = list.map((e) => {
		return eval_expr(callstack, local, e);
	});
	ret._jyftype = list._jyftype;
	ret._jyfcoords = list._jyfcoords;
	return ret;
};

//# eval_funcall - evaluate function call
const eval_funcall = (callstack, ctx, funcall) => {
	let fun = eval_expr(callstack, ctx, funcall.fun);
	let args = funcall.args;
	let ret;

	callstack.push({
		coords: funcall._jyfcoords || {
			file: 'native'	
		},
		type: fun._jyftype || ('js-' + typeof fun),
		funname: pretty_elem(funcall.fun),
	});
	
	if (typecheck(fun, type.macro)) {
		ret = fun(callstack, ctx, args);
	} else if (typecheck(fun, type.fun)) {
		ret = fun(callstack, ...eval_list(callstack, ctx, args));
	} else if (typecheck(fun, 'function')) {
		ret = fun(...eval_list(callstack, ctx, args));
	} else {
		runtime_error('cannot call non-function', funcall._jyfcoords, callstack);
	}

	callstack.pop();

	return ret;
};

//# eval_binding - evaluate variable binding
const eval_binding = (callstack, ctx, binding) => {
	return ctx.get(callstack, binding);
};

//# run - evaluate a jyf program
const run = (ctx, program) => {
	return eval_expr([], immutable_context([ctx]), program);
};

const pretty_elem = (e) => {
	switch (e._jyftype) {
		case type.atom:
			return '\'' + String(e);
		case type.binding:
			return String(e);
		case type.list:
			return pretty_list(e);
		case type.funcall:
			return pretty_elem(e.fun) + pretty_list(e.args);
		case type.fun:
			return '<fun>';
		case type.macro:
			return '<macro>';
		default:
			if (typeof e === 'function') return '<js-function>';
			return JSON.stringify(e);
	}
};

const pretty_list = (l) => {
	return '(' +
		l.map((e, index) => {
			return (index !== 0 ? ' ' : '') + pretty_elem(e);
		}).join('') +
	')';
};

module.exports = {
	interpreter: {
		tokenize: tokenize,
		parse: parse,
		run: run
	},
	context: {
		context: context,
		immutable: immutable_context
	},
	evaluate: {
		expression: eval_expr,
		binding: eval_binding,
		list: eval_list,
		functioncall: eval_funcall
	},
	error: {
		factory: error,
		runtime: runtime_error,
		parse: parse_error,
		tokenize: tokenize_error
	},
	utility: {
		pretty: pretty_elem,
		typecheck: typecheck,
	},
	type: type
};
