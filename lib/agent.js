const fs = require('fs');
const path = require('path');
const util = require('ys-utils');
const IPCMessage = require('ipc-message');
const debug = require('debug')('mutify:agent');

module.exports = class AgentRuntime extends IPCMessage {
  constructor(options, runtimer) {
    super(true);
    this.closing = false;
    this.callbackId = 1;
    this.callbacks = {};
    this.plugins = {};
    this.options = options;
    this.env = options.env;
    this.console = new util.logger(this);
    this.logger = console;
    this.runtime = new runtimer(this);
    this.noticeToClose = false;
    this.keepAliveTimer = setInterval(() => debug(`'${this.options.name}' is keepalive`), 24 * 60 * 60 * 1000);
    this.on('message', async message => await this.onReceiveMessage(message));
  }

  async invokeLifeCycle(lifeCycleName, ...args) {
    if (typeof this.runtime[lifeCycleName] === 'function') {
      await this.runtime[lifeCycleName](...args);
    }
  }

  async onReceiveMessage(message) {
    if (
      message.action === 'ipc:reply' && 
      message.body.callback_id && 
      typeof this.callbacks[message.body.callback_id] === 'function'
    ) {
      return this.callbacks[message.body.callback_id]();
    }

    if (message.action === 'ipc:agent.notice.close') {
      return this.noticeToClose = true;
    }

    if (/^\//.test(message.action)) {
      const request = {
        url: message.action,
        data: message.body.ipc_service_data
      }
      const response = {
        cid: message.body.ipc_service_callback_id,
        from: message.from
      }
      return await this.invokeLifeCycle('serverRequest', request, response);
      // const ipc_service_name = message.body.ipc_service_name;
      // const ipc_service_data = message.body.ipc_service_data;
      // const ipc_service_callback_id = message.body.ipc_service_callback_id;
      // if (!this.services[ipc_service_name]) return;
      // const component = this.services[ipc_service_name];
      // return await component.convertMiddlewareAndRunContextAction(
      //   message.action, 
      //   ipc_service_data, 
      //   ipc_service_callback_id, 
      //   message.from
      // );
    }

    await this.emit(message.action, message.body.ipc_service_data);
  }

  async listen() {
    await util.lang.loadFileWorker(this.options.loader, this);
    if (fs.existsSync(this.options.plugin_file)) {
      const PluginList = util.file.load(this.options.plugin_file);
      const PluginConfigs = fs.existsSync(this.options.plugin_config_file) 
        ? util.file.load(this.options.plugin_config_file) 
        : {};

      const services = util.lang.installPlugin(
        PluginList, 
        this.env, 
        this.options.name, 
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
    await this.post('ipc:agent.runtime.success', {
      name: this.options.name,
      pid: this.pid
    });
  }

  sendRuntimeError() {
    this.send('master', 'ipc:agent.runtime.error', {
      name: this.options.name,
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
        clearInterval(this.keepAliveTimer);
        clearInterval(timer);
        debug(`[${this.pid}]`, `[AGENT]`, this.options.name, `is stopping with signal '${signal}', please wait until process done ...`);
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