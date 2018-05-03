const PLUGIN = require('./plugin');
const debug = require('debug')('mutify:agent:runtime');
const path = require('path');
const util = require('ys-utils');
const AgentRuntime = require('./agent');
const configPath = process.argv[2];
const env = process.argv[3];
const argvs = util.argvs(process.argv.slice(6));

util.options(
  util.file.load(path.resolve(configPath, `options.${env}.js`)),
  configPath,
  env, argvs
).then(runtime).catch(e => {
  console.error(e);
  process.exit(1);
});

async function runtime(options) {
  options.name = process.argv[4];
  options.loader = process.argv[5];
  const Agent = util.file.load(options.framework).Agent;
  const plugin = new PLUGIN(options);
  await plugin.init();
  const agent = new AgentRuntime(plugin.options, Agent);
  agent.plugin = plugin;
  
  process.on('SIGTERM', agent.kill.bind(agent, 'SIGTERM'))
  process.on('SIGINT', agent.kill.bind(agent, 'SIGINT'));
  process.on('SIGQUIT', agent.kill.bind(agent, 'SIGQUIT'));
  
  process.on('exit', code => {
    debug(
      `[${agent.pid}]`,
      '[AGENT]',
      `'${agent.options.name}' is exited with code`,
      code
    );
  });
  
  ['error', 'rejectionHandled', 'uncaughtException', 'unhandledRejection'].forEach(errtype => {
    process.on(errtype, e => {
      agent.send('master', 'kill');
      agent.console.error(`[agent:${errtype}]`, e);
    });
  });
  
  await agent.listen().then(() => agent.sendRuntimeSuccess()).catch(e => {
    agent.console.error('[agent:runtimeError]', e);
    agent.sendRuntimeError();
  });
}