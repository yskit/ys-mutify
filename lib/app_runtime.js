
const debug = require('debug')('mutify:application:runtime');
const path = require('path');
const util = require('ys-utils');
const AppRuntime = require('./application');
const configPath = process.argv[2];
const env = process.argv[3];
const argvs = util.argvs(process.argv.slice(5));

util.options(
  util.file.load(path.resolve(configPath, `options.${env}.js`)),
  configPath,
  env, argvs
).then(options => {
  options.loader = process.argv[4];
  const Application = require(options.framework).Application;
  const app = new AppRuntime(options, Application);

  process.on('SIGTERM', app.kill.bind(app, 'SIGTERM'))
  process.on('SIGINT', app.kill.bind(app, 'SIGINT'));
  process.on('SIGQUIT', app.kill.bind(app, 'SIGQUIT'));

  process.on('exit', code => {
    debug(
      `[${app.pid}]`, 
      '[WORKER]',
      `is exited with code`,
      code
    );
  });

  ['error', 'rejectionHandled', 'uncaughtException', 'unhandledRejection'].forEach(errtype => {
    process.on(errtype, e => {
      app.send('master', 'kill');
      debug(`[worker:${errtype}]`, e);
    });
  });

  app.listen().then(() => app.sendRuntimeSuccess()).catch(e => {
    debug('[app:runtimeError]', e);
    app.sendRuntimeError();
  });
});