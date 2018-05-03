const fs = require('fs');
const util = require('ys-utils');
const path = require('path');
module.exports = class Plugin {
  constructor(options) {
    this.options = options;
    this.env = options.env;
    this.list = util.lang.mergeConfigs(this.options.plugin_file);
    this.configs = util.lang.mergeConfigs(this.options.plugin_config_file);
    this.services = util.lang.installPlugin(
      this.list,
      options.env,
      options.name,
      this.options.baseDir,
      path.basename(this.options.framework)
    );
  }
  
  async each(fn) {
    for (let i = 0 ; i < this.services.length; i++) {
      const service = this.services[i];
      await fn(service, this.configs[service.name] || {});
    }
  }
  
  async init() {
    await this.each(async service => {
      const file = path.resolve(service.dir, `config/options.${this.env}.js`);
      if (fs.existsSync(file)) {
        this.options = Object.assign({}, util.file.load(file), this.options);
      }
    });
  }
  
  async load(app) {
    await this.each(async (service, configs) => await service.exports(app, configs));
  }
};