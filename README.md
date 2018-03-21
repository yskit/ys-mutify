# ys-mutify

nodejs基于cluster模型的应用开发架构

## Install

```bash
npm i ys-mutify --save
```

## Usage

```javascript
const Mutify = require('ys-mutify');
const nodebase = new Mutify(__dirname + '/config');

nodebase.listen()
  .then(() => console.log('nodebase listen ok'))
  .catch(e => console.error('nodebase listen fail', e));

nodebase.on('ready', () => {
  console.log('master ready, 66666')
})
```

## config

这是一个目录。首先，程序会去根据当前环境变量(`NODE_ENV`)读这个目录的文件，假设我们当前环境变量值为`dev`，那么它将会读取`options.dev.js`这个文件的配置信息。

**config/options.dev.js**

```javascript
const path = require('path');
module.exports = {
  baseDir: path.resolve(__dirname, '..'),
  framework: 'ys-fw-koa',  // 我们所用到的framework名称，也可以是一个绝对地址
}
```

之后我们就可以启动这个服务了。具体服务启动，请参看各应用架构服务的实现。

# License

It is [MIT licensed](https://opensource.org/licenses/MIT).