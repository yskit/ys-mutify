const util = require('ys-utils');
const AgentRuntime = require('./agent');
const configPath = JSON.parse(process.argv[2]);
const env = process.argv[3];

util.options(
  util.file.load(path.resolve(configPath, `options.${env}.js`)),
  configPath,
  env
).then(options => {
  options.name = process.argv[4];
  options.loader = process.argv[5];
  options.argvs = process.argv.slice(6);

  const Agent = util.file.load(options.framework).Agent;
  const agent = new AgentRuntime(options, Agent);

  process.on('SIGTERM', agent.kill.bind(agent, 'SIGTERM'))
  process.on('SIGINT', agent.kill.bind(agent, 'SIGINT'));
  process.on('SIGQUIT', agent.kill.bind(agent, 'SIGQUIT'));

  process.on('exit', code => {
    agent.console.info(
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

  agent.listen().then(() => agent.sendRuntimeSuccess()).catch(e => {
    agent.console.error('[agent:runtimeError]', e);
    agent.sendRuntimeError();
  });
});