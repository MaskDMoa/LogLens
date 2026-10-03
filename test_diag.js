const fs = require('fs');

const rawLog = "Mod loading failures have occurred";

const engine = fs.readFileSync('web/diagnostics.js', 'utf-8');
eval(engine);

const result = window.DiagnosticEngine.runDiagnostics(rawLog);
console.log(result);
