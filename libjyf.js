'use strict';

const jyf = require('./jyf.js');

const lib = jyf.context.context();

//# utility

const set = (name, fn) => {
	lib.declare([], name);
	lib.set([], name, fn);
};

const create_macro = (fn) => {
	fn._jyftype = jyf.type.macro;
	fn._jyfcoords = {
		file: 'native',
	};
	return fn;
};

const create_fun = (fn) => {
	fn._jyftype = jyf.type.fun;
	fn._jyfcoords = {
		file: 'native',
	};
	return fn;
};

//# arithmetic

const create_reducing = (start, iter) => {
	return (...args) => {
		let res = start(...args);
		return res[1].reduce(iter, res[0]);
	};
};

set('+', create_reducing((...args) => [0, args], (a, b) => a + b));
set('-', create_reducing((start, ...args) => [start, args], (a, b) => a - b));
set('*', create_reducing((...args) => [1, args], (a, b) => a * b));
set('/', create_reducing((start, ...args) => [start, args], (a, b) => a / b));
set('mod', (a, b) => a % b);
set('pow', Math.pow);
set('sqrt', Math.sqrt);

//# comparison and boolean

set('true', true);
set('false', false);

set('is', (...args) => args.slice(1).every((a) => args[0] === a));
set('and', (...args) => args.every((a) => a));
set('or', (...args) => args.some((a) => a));
set('xor', (a, b) => (a !== b) && (a || b));
set('not', (bool) => !bool);

set('<', (...args) => {
	return args.slice(1).every((a, index) => {
		return args[index] < a;
	});
});
set('>', (...args) => {
	return args.slice(1).every((a, index) => {
		return args[index] > a;
	});
});
set('<=', (...args) => {
	return args.slice(1).every((a, index) => {
		return args[index] <= a;
	});
});
set('>=', (...args) => {
	return args.slice(1).every((a, index) => {
		return args[index] >= a;
	});
});

//# object indexing

set('length', (obj) => obj.length);
set('index', (obj, index) => obj[index]);
set('append', (list, ...items) => {
	list.push(...items);
});
set('assign', (obj, index, value) => {
	obj[index] = value;
});

//# control flow

set('do', (...args) => {
	return args.length !== 0 ? args[args.length - 1] : undefined;
});
set('if', create_macro((callstack, ctx, args) => {
	let cond = jyf.evaluate.expression(callstack, ctx, args[0]);

	if (cond) {
		return jyf.evaluate.expression(callstack, ctx, args[1]);
	} else if (args.length > 2) {
		return jyf.evaluate.expression(callstack, ctx, args[2]);
	}
}));
set('while', create_macro((callstack, ctx, args) => {
	let cond = jyf.evaluate.expression(callstack, ctx, args[0]);

	let ret;

	while (cond) {
		ret = jyf.evaluate.expression(callstack, ctx, args[1]);
	}
	
	return ret;
}));
set('for', create_macro((callstack, ctx, args) => {
	if (!jyf.utility.typecheck(args[0], jyf.type.list)) jyf.error.runtime('missing iteration list', args[0]._jyfcoords, callstack);

	let forctx = jyf.context.context([ctx]);

	jyf.evaluate.expression(callstack, forctx, args[0][0]);

	let ret;

	while (jyf.evaluate.expression(callstack, forctx, args[0][1])) {
		ret = jyf.evaluate.expression(callstack, forctx, args[1]);
		jyf.evaluate.expression(callstack, forctx, args[0][2]);
	}

	return ret;
}));

//# I/O

set('print', (...args) => {
	console.log(...args);
});

//# variables and scoping

set('dec', create_macro((callstack, ctx, args) => {
	args = jyf.evaluate.list(callstack, ctx, args);
	if (args.every((a) => jyf.utility.typecheck(a, jyf.type.list))) {
		args.forEach((a) => {
			if (!jyf.utility.typecheck(a[0], jyf.type.atom)) {
				jyf.error.runtime('cannot declare non-atom', callstack[callstack.length - 1].coords, callstack);
			}
			ctx.declare(callstack, a[0]);

			if (a.length > 1) {
				ctx.set(callstack, a[0], a[1]);
			}
		});
	} else {
		if (!jyf.utility.typecheck(args[0], jyf.type.atom)) {
			jyf.error.runtime('cannot declare non-atom', callstack[callstack.length - 1].coords, callstack);
		}
		
		ctx.declare(callstack, args[0]);

		if (args.length > 1) {
			ctx.set(callstack, args[0], args[1]);
		}
	}
}));
set('def', create_macro((callstack, ctx, args) => {
	args = jyf.evaluate.list(callstack, ctx, args);
	
	if (args.every((a) => jyf.utility.typecheck(a, jyf.type.list))) {
		args.forEach((a) => {
			if (!jyf.utility.typecheck(a[0], jyf.type.atom)) {
				jyf.error.runtime('cannot define non-atom', callstack[callstack.length - 1].coords, callstack);
			}
			
			ctx.set(callstack, a[0], a[1]);
		});
	} else {
		if (!jyf.utility.typecheck(args[0], jyf.type.atom)) {
			jyf.error.runtime('cannot define non-atom', callstack[callstack.length - 1].coords, callstack);
		}
		
		ctx.set(callstack, args[0], args[1]);
	}
}));
set('inc', create_macro((callstack, ctx, args) => {
	args = jyf.evaluate.list(callstack, ctx, args);

	if (!args.every((a) => jyf.utility.typecheck(a, jyf.type.atom))) {
	   	jyf.error.runtime('cannot define non-atom', callstack[callstack.length - 1].coords, callstack);
	}
	
	args.forEach((a) => {
		ctx.set(callstack, a, ctx.get(callstack, a) + 1);
	});
}));

//# functions and macros

set('function', create_macro((callstack, ctx, args) => {
	if (!jyf.utility.typecheck(args[0], jyf.type.list)) jyf.error.runtime('missing argument list', callstack[callstack.length - 1].coords, callstack);
	
	let arglist = jyf.evaluate.list(callstack, ctx, args.shift());

	arglist.forEach((a) => {
		if (!jyf.utility.typecheck(a, jyf.type.atom)) jyf.error.runtime('non-atom in argument list', callstack[callstack.length - 1].coords, callstack);
	});

	let fun = create_fun((funcallstack, ...funargs) => {
		let argvalues = jyf.context.context();

		arglist.forEach((a, index) => {
			argvalues.declare(funcallstack, a);
			if (index in funargs) argvalues.set(funcallstack, a, funargs[index]);
		});

		let retlist = jyf.evaluate.list(funcallstack, jyf.context.context([argvalues, ctx]), args);

		return retlist.length !== 0 ? retlist[retlist.length - 1] : undefined;
	});

	return fun;
}));
set('variadic', (fun) => create_macro((callstack, ctx, args) => {
	let funcall = {
		fun: fun,
		args: [args],
		_jyftype: jyf.type.funcall
	};
	funcall.args._jyftype = jyf.type.list;
	funcall.args._jyfcoords = {
		file: 'native'
	};
	return jyf.evaluate.functioncall(callstack, ctx, funcall);
}));

//# export

module.exports = lib;
