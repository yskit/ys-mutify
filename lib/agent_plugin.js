const Middleware = require('./middleware');
const AgentRequest = require('./agent_request');
const AgentResponse = require('./agent_response');

module.exports = class AgentPlugin extends Middleware {
  constructor(app, options) {
    super();
    this.app = app;
    this.options = options;
  }

  async destroy() {
    await this.emit('destroy');
  }

  async convertMiddlewareAndRunContextAction(url, data, callback_id, from) {
    const ctx = Object.create(this.app.context);
    const request = new AgentRequest(ctx, url, data);
    const response = new AgentResponse(ctx, callback_id, from);
    ctx.req = request;
    ctx.res = response;
    request.app = response.app = this.app;
    request.res = response;
    response.req = request;
    await this.emit('task:start', ctx);
    await this.execute(ctx);
    await this.emit('task:end', ctx);
  }
}