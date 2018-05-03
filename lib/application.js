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
    this.plugin = null;
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

  async listen() {
    await this.plugin.load(this);
    await util.lang.loadFileWorker(this.options.loader, this);
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
    await this.emit('destroy', signal);
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
};