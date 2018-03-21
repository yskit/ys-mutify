const fs = require('fs');
const path = require('path');
const util = require('ys-utils');
const cluster = require('cluster');
const IPCMessage = require('ipc-message');
const childprocess = require('child_process');

const agentWorkerFile = path.resolve(__dirname, './agent_runtime.js');
const applicationWorkerFile = path.resolve(__dirname, './app_runtime.js');

/**
 * Cluster.Master Runtime.
 * 
 * Nodejs envs:
 *  - dev         : 开发环境
 *  - stable      : 测试环境
 *  - staging     : 预发环境
 *  - production  : 生产环境 - 默认
 * 
 * @param `string` configPath: 用户配置文件存放文件夹地址
 */
module.exports = class Master extends IPCMessage {
  constructor(configPath) {
    super();
    this.fields = {};
    this.env = process.env.NODE_ENV || 'production';
    this.configPath = configPath;
    this.console = new util.logger(this);
    this.logger = console;
    this.kills = [];
    this.on('message', async message => {
      if (typeof this[message.action] === 'function') {
        await this[message.action](message);
      } else {
        await this.emit(message.action, message);
      }
    });
  }

  preKill(pid) {
    if (!pid || isNaN(pid)) return;
    const index = this.kills.indexOf(pid);
    if (index === -1) {
      this.kills.push(pid);
    }
  }

  async kill() {
    if (this.closing) return;
    let appsKilled = false;
    this.closing = true;
    this.killApplicationProcess();
    const timer = setInterval(() => {
      if (!appsKilled) {
        for (const j in this.fields.workers) {
          if (this.fields.workers[j] > 0) return;
        }
        appsKilled = true;
        this.killAgentProcess();
      }
      for (const i in this.fields.agents) {
        if (this.fields.agents[i] > 0) return;
      }
      clearInterval(timer);
      this.removeAllListeners();
      for (let m = 0, n = this.kills.length; m < n; m++) {
        childprocess.spawnSync('kill', ['-9', String(this.kills[m])]);
      }
      process.nextTick(() => process.exit());
    }, 5);
  }

  async ['ipc:agent.runtime.success'](message) {
    const data = message.body;
    const from = message.from;
    this.fields.agents[data.name] = data.pid;
    this.send(from, 'ipc:reply', {
      callback_id: data.callback_id
    });

    for (const i in this.fields.agents) {
      if (this.fields.agents[i] === 0) {
        return;
      }
    }
    if (!this.closing) {
      await this.forkApplicationWorkProcess(this.options.max);
    }
  }

  async ['ipc:worker.runtime.success'](message) {
    const data = message.body;
    const from = message.from;
    this.fields.workers[data.pid] = 1;
    this.send(from, 'ipc:reply', {
      callback_id: data.callback_id
    });
    for (const i in this.fields.workers) {
      if (this.fields.workers[i] === 0) {
        return;
      }
    }
    if (!this.closing) {
      await this.emit('ready');
    }
  }

  async ['ipc:agent.runtime.error'](message) {
    const data = message.body;
    const from = message.from;
    this.fields.agents[data.name] = data.pid;
    await this.kill();
  }

  async ['ipc:worker.runtime.error'](message) {
    const data = message.body;
    const from = message.from;
    this.fields.workers[data.pid] = 1;
    await this.kill();
  }

  async listen() {
    this.fields.workers = {};
    this.fields.agents = {};
    this.options = await util.options(
      util.file.load(path.resolve(this.configPath, `options.${this.env}.js`)),
      this.configPath,
      this.env
    );
    process.on('SIGTERM', () => this.kill());
    process.on('SIGINT', () => this.kill());
    process.on('SIGQUIT', () => this.kill());
    process.on('exit', code => this.console.info(
      `[${this.pid}]`, 
      'Master is exited with code', 
      code
    ));
    await this.forkAgentProcess();
  }

  async forkApplicationWorkProcess(max) {
    console.log('fork application workers');
    const argvs = process.argv.slice(2);
    const args = [
      JSON.stringify(this.options),
      this.options.worker_file,
      ...argvs
    ];
    cluster.setupMaster({
      exec: applicationWorkerFile,
      args,
      silent: false,
      env: process.env
    });
    
    for (let i = 0; i < max; i++) cluster.fork();
    cluster.on('fork', worker => {
      this.fields.workers[worker.process.pid] = 0;
    }).on('online', worker => {
      this.console.warn(`[${worker.process.pid}]`, '[WORKER]', 'forked');
    }).on('exit', worker => {
      this.console.warn(`[${worker.process.pid}]`, '[WORKER]', 'exit');
      delete this.fields.workers[worker.process.pid];
      if (!this.closing) cluster.fork();
    });
  }

  async forkAgentProcess() {
    const argvs = process.argv.slice(2);
    const opt = {
      cwd: this.options.baseDir,
      stdout: process.stdout,
      stderr: process.stderr,
      env: process.env,
      execArgv: process.execArgv
    }
    for (let i = 0; i < this.options.agents.length; i++) {
      const args = [
        JSON.stringify(this.options),
        this.options.agents[i].name,
        this.options.agents[i].path
      ].concat(argvs);
      const name = this.options.agents[i].name;
      this.fields.agents[name] = 0;
      const agent = childprocess.fork(agentWorkerFile, args, opt);
      this.registAgent(name, agent);
      agent.on('exit', () => {
        this.fields.agents[name] = 0;
        this.console.warn(`[${agent.pid}]`, '[AGENT]', `${name} exit`);
      });
    }
  }

  async killAgentProcess() {
    for (const agent in this.fields.agents) {
      if (!this.agents[agent].killed) {
        this.agents[agent].kill('SIGTERM');
        this.preKill(this.agents[agent].pid);
        this.send(agent, 'ipc:agent.notice.close');
      }
    }
  }

  async killApplicationProcess() {
    for (const worker in this.fields.workers) {
      let _worker;
      for (let i = 0; i < this.workers.length; i++) {
        if (this.workers[i].process.pid === Number(worker)) {
          _worker = this.workers[i];
          break;
        }
      }
      
      if (!_worker.isDead()) {
        process.kill(Number(worker), 'SIGTERM');
        this.preKill(worker.process.pid);
        this.send(Number(worker), 'ipc:worker.notice.close');
      }
    }
  }
}