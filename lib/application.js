const fs = require('fs');
const util = require('ys-utils');
const IPCMessage = require('ipc-message');

module.exports = class ApplicationRunTime extends IPCMessage {
  constructor(options, runtimer) {
    super();
    this.callbackId = 1;
    this.callbacks = {};
    this.options = options;
    this.closing = false;
    this.env = options.env;
    this.console = new util.logger(this);
    this.logger = console;
    this.noticeToClose = false;
    this.runtime = new runtimer(this);
    this.on('message', async message => await this.onReceiveMessage(message));
  }

  async fetch(url, body, socket, options = {}) {
    const exec = /([^:]+):\/\/([^\/]+)\/?(.+)?/.exec(url);
    if (!exec) {
      throw new Error('unknow method');
    }
    const agent = exec[1];
    const service = exec[2];
    const uri = exec[3] ? '/' + exec[3] : '/';
    return new Promise((resolve, reject) => {
      const time = new Date().getTime();
      const id = this.callbackId++;
      const timer = setInterval(() => {
        if (new Date().getTime() - time > (options.timerout || 30000)) {
          delete this.callbacks[id];
          clearInterval(timer);
          reject(new Error('Timeout'));
        }
      }, 10);
      this.callbacks[id] = (err, data) => {
        delete this.callbacks[id];
        clearInterval(timer);
        if (err) return reject(err);
        resolve(data);
      }
      this.send(agent, uri, {
        service: service,
        data: body,
        cid: id
      }, socket);
    })
  }

  async onReceiveMessage(message) {
    if (message.action === 'ipc:reply' && message.body.callback_id && typeof this.callbacks[message.body.callback_id] === 'function') {
      return this.callbacks[message.body.callback_id]();
    }
    if (message.action === 'ipc:worker.notice.close') {
      return this.noticeToClose = true;
    }

    if (typeof message.action === 'number') {
      const callback = this.callbacks[msg.action];
      if (!callback) return;
      if (msg.body.error) {
        return callback(new Error(msg.body.error));
      }
      return callback(null, msg.body);
    }

    await this.emit(message.action, message.body);
  }

  async invokeLifeCycle(lifeCycleName) {
    if (typeof this.runtime[lifeCycleName] === 'function') {
      await this.runtime[lifeCycleName]();
    }
  }

  async listen() {
    await util.lang.loadFileWorker(this.options.loader, this);
    if (fs.existsSync(this.options.plugin_file)) {
      const PluginList = util.file.load(this.options.plugin_file);
      const PluginConfigs = fs.existsSync(this.options.plugin_config_file) 
        ? util.file.load(this.options.plugin_config_file) 
        : {};

      const services = util.lang.installPlugin(PluginList, this.env, null, this.options.baseDir);
      for (let i = 0 ; i < services.length; i++) {
        const service = services[i];
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
        this.console.info(`[${this.pid}]`, `[WORKER]`, `is stopping with signal '${signal}', please wait until process done ...`);
        this.destroy().then(() => {
          this.removeAllListeners();
          process.removeAllListeners();
          process.exit(0);
        }).catch(e => {
          this.console.error(e);
          process.exit(1);
        });
      }
    }, 5);
  }
}