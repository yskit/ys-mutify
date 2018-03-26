const Middleware = require('./middleware');
const AgentRequest = require('./agent_request');
const AgentResponse = require('./agent_response');
const Context = require('./agent_context');

module.exports = class AgentPlugin extends Middleware {
  constructor(app, options) {
    super();
    this.app = app;
    this.logger = app.console;
    this.options = options;
    this.context = Object.create(Context);
  }

  async destroy() {
    await this.emit('destroy');
  }

  async convertMiddlewareAndRunContextAction(url, data, callback_id, from) {
    const ctx = Object.create(this.context);
    const request = new AgentRequest(this.app, ctx, url, data);
    const response = new AgentResponse(this.app, ctx, callback_id, from);
    ctx.req = request;
    ctx.res = response;
    ctx.url = url;
    ctx.app = this;
    request.res = response;
    response.req = request;
    await this.emit('task:start', ctx);
    await this.execute(ctx).then(() => {
      if (ctx.to) {
        return response.send(ctx.to, ctx.body);
      }
      return response.reply(ctx.body);
    });
    await this.emit('task:end', ctx);
  }
}