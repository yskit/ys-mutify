const fs = require('fs');
const path = require('path');
const util = require('ys-utils');
const IPCMessage = require('ipc-message');
const debug = require('debug')('mutify:application');

module.exports = class ApplicationRunTime extends IPCMessage {
  constructor(options, runtimer) {
    super();
    this.callbackId = 1;
    this.callbacks = {};
    this.options = options;
    this.closing = false;
    this.plugins = {};
    this.env = options.env;
    this.console = new util.logger(this);
    this.logger = console;
    this.noticeToClose = false;
    this.runtime = new runtimer(this);
    this.on('message', async message => await this.onReceiveMessage(message));
    this.fetch = async (...args) => await this.runtime.fetch(...args);
  }

  async onReceiveMessage(message) {
    if (
      message.action === 'ipc:reply' && 
      message.body.callback_id && 
      typeof this.callbacks[message.body.callback_id] === 'function'
    ) {
      return this.callbacks[message.body.callback_id]();
    }

    if (message.action === 'ipc:worker.notice.close') {
      return this.noticeToClose = true;
    }

    if (message.action === 'ipc:cluster:ready') {
      return await this.emit('cluster:ready');
    }

    return await this.invokeLifeCycle('message', message);
  }

  async invokeLifeCycle(lifeCycleName, ...args) {
    if (typeof this.runtime[lifeCycleName] === 'function') {
      await this.runtime[lifeCycleName](...args);
    }
  }

  mergeConfigs(array) {
    return Object.assign({}, ...array.map(arr => {
      if (!fs.existsSync(arr)) {
        return {};
      }
      return util.file.load(arr);
    }));
  }

  async listen() {
    await util.lang.loadFileWorker(this.options.loader, this);
    if (fs.existsSync(this.options.plugin_file)) {
      const PluginList = this.mergeConfigs(this.options.plugin_file);
      const PluginConfigs = this.mergeConfigs(this.options.plugin_config_file);
      const services = util.lang.installPlugin(
        PluginList, 
        this.env, 
        null, 
        this.options.baseDir, 
        path.basename(this.options.framework)
      );
      
      for (let i = 0 ; i < services.length; i++) {
        const service = services[i];
        this.plugins[service.name] = service;
        await service.exports(this, PluginConfigs[service.name] || {});
      }
    }
    await this.invokeLifeCycle('created');
    await this.emit('ready');
  }

  async post(action, data) {
    util.fetch.call(this, action, data);
  }

  async sendRuntimeSuccess() {
    await this.post('ipc:worker.runtime.success', {
      pid: this.pid
    });
  }

  sendRuntimeError() {
    this.send('master', 'ipc:worker.runtime.error', {
      pid: this.pid
    });
  }

  async destroy(signal) {
    await this.invokeLifeCycle('destroy');
    await this.emit('destroy');
  }

  kill(signal) {
    if (this.closing) return;
    this.closing = true;
    let closing = false;
    const timer = setInterval(() => {
      if (this.noticeToClose) {
        if (closing) return;
        closing = true;
        clearInterval(timer);
        debug(`[${this.pid}]`, `[WORKER]`, `is stopping with signal '${signal}', please wait until process done ...`);
        this.destroy().then(() => {
          this.removeAllListeners();
          process.removeAllListeners();
          process.exit(0);
        }).catch(e => {
          debug(e);
          process.exit(1);
        });
      }
    }, 5);
  }
}