const http = require('http');
const port = 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
  res.end('PM2进程运行正常！\n');
});
server.listen(port, '0.0.0.0', () => {
  console.log(`服务启动成功：http://0.0.0.0:${port}`);
});
process.on('uncaughtException', (err) => {
  console.error('错误：', err);
});
