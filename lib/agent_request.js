module.exports = class AgentRequestClassModule {
  constructor(app, ctx, url, data) {
    this.app = app;
    this.ctx = ctx;
    this.url = url;
    this.body = data;
  }
}