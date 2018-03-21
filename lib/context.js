module.exports = app => {
  const ctx = {
    app
  }

  Object.defineProperties(ctx, {
    reply: {
      get() {
        if (this.res && this.res.reply) {
          return this.res.reply.bind(this.res);
        }
      }
    },
    send: {
      get() {
        if (this.res && this.res.send) {
          return this.res.send.bind(this.res);
        }
      }
    }
  });

  return ctx;
}