module.exports = class AgentResponseClassModule {
  constructor(app, ctx, cid, from) {
    this.app = app;
    this.cid = cid;
    this.from = from;
    this.ctx = ctx;
  }

  send(...args) {
    if (args.length === 1) {
      return this.reply(args[0]);
    }
    return this.app.send(...args);
  }

  reply(...args) {
    return this.app.send(this.from, this.cid, ...args);
  }
}