'use strict';

const jyf = require('./jyf.js');
const libjyf = require('./libjyf.js');

const file = () => {
	require('fs').readFile(process.argv[2], (err, data) => {
		if (err) throw err;
		try {
			jyf.interpreter.run(libjyf, jyf.interpreter.parse(jyf.interpreter.tokenize(String(data), process.argv[2])));
		} catch (e) {
			if (!jyf.utility.typecheck(e, jyf.type.error)) {
				throw e;
			}
			console.error(e.message + (e._jyfcoords !== undefined ? ', at ' + e._jyfcoords.file + (e._jyfcoords.line !== undefined ? ':' + e._jyfcoords.line + ':' + e._jyfcoords.column : '') : ''));
			if (e._jyfcallstack !== undefined) {
				e._jyfcallstack.reverse().forEach((c) => {
					console.error('  ' + c.funname + '() at ' + c.coords.file + (c.coords.line !== undefined ? ':' + c.coords.line + ':' + c.coords.column : ''));
				});
			}
			process.exit(1);
		}
	});
};

if (process.argv.length !== 3) {
	console.error('usage: jyf <file>');
	process.exit(1);
} else {
	file();
}
