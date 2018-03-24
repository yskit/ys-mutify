
const path = require('path');
const util = require('ys-utils');
const AppRuntime = require('./application');
const configPath = JSON.parse(process.argv[2]);
const env = process.argv[3];

util.options(
  util.file.load(path.resolve(configPath, `options.${env}.js`)),
  configPath,
  env
).then(options => {
  options.loader = process.argv[4];
  options.argvs = process.argv.slice(5);

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
  });
});