module.exports = class AgentRequestClassModule {
  constructor(ctx, url, data) {
    this.ctx = ctx;
    this.url = url;
    this.body = data;
  }
}