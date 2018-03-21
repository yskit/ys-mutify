const compose = require('miox-compose');
const { EventEmitter } = require('async-events-listener');

module.exports = class MiddleWares extends EventEmitter {
  constructor() {
    super();
    this.middlewares = [];
  }

  /**
   * 设计一个中间件
   * @param args
   * @returns {MiddleWares}
   */
  use(...args) {
    const result = [];
    for (let i = 0; i < args.length; i++) {
      let cb = args[i];

      /* istanbul ignore if */
      if (typeof cb !== 'function') {
        throw new Error(
          'middleware must be a function ' +
          'but got ' + typeof cb
        );
      }

      result.push(cb);
    }

    this.middlewares.push(...result);
    return this;
  }

  /**
   * 组合所有中间件
   * @private
   */
  poly() {
    this.__processer__ = compose(this.middlewares);
  }

  /**
   * 运行遍历中间件
   * @param context
   * @returns {Promise.<*>}
   */
  async execute(context) {
    if (!this.__processer__) this.poly();
    return await this.__processer__(context || this);
  }
}