
const AppRuntime = require('./application');
const options = JSON.parse(process.argv[2]);
options.loader = process.argv[3];
options.argvs = process.argv.slice(4);

const Application = require(options.framework).Application;
const app = new AppRuntime(options, Application);

process.on('SIGTERM', app.kill.bind(app, 'SIGTERM'))
process.on('SIGINT', app.kill.bind(app, 'SIGINT'));
process.on('SIGQUIT', app.kill.bind(app, 'SIGQUIT'));

process.on('exit', code => {
  app.console.info(
    `[${app.pid}]`, 
    '[WORKER]',
    `is exited with code`,
    code
  );
});

['error', 'rejectionHandled', 'uncaughtException', 'unhandledRejection'].forEach(errtype => {
  process.on(errtype, e => {
    app.send('master', 'kill');
    app.console.error(`[worker:${errtype}]`, e);
  });
});

app.listen().then(() => app.sendRuntimeSuccess()).catch(e => {
  app.console.error('[app:runtimeError]', e);
  app.sendRuntimeError();
})