module.exports = {
  send(...args) {
    if (args.length === 1) {
      return this.reply(args[0]);
    }
    return this.app.send(...args);
  },

  reply(...args) {
    return this.app.send(this.from, this.cid, ...args);
  }
}