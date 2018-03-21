const NodeBase = require('../index');
const nodebase = new NodeBase(__dirname + '/config');

nodebase.listen()
  .then(() => console.log('nodebase listen ok'))
  .catch(e => console.error('nodebase listen fail', e));

nodebase.on('ready', () => {
  console.log('master ready, 66666')
})