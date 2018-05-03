const PLUGIN = require('./plugin');
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
).then(runtime).catch(e => {
  console.error(e);
  process.exit(1);
});

async function runtime(options) {
  options.loader = process.argv[4];
  const Application = require(options.framework).Application;
  const plugin = new PLUGIN(options);
  await plugin.init();
  const app = new AppRuntime(plugin.options, Application);
  app.plugin = plugin;
  
  process.on('SIGTERM', app.kill.bind(app, 'SIGTERM'));
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
      app.console.error(`[worker:${errtype}]`, e);
    });
  });
  
  await app.listen().then(() => app.sendRuntimeSuccess()).catch(e => {
    app.console.error('[app:runtimeError]', e);
    app.sendRuntimeError();
  });
}