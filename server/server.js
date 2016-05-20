var mongoAddr = process.env.MONGO_PORT_27017_TCP_ADDR||"localhost";
var mongoPort = process.env.MONGO_PORT_27017_TCP_PORT||"27017";
var fs = require('fs');

var fileContents = fs.readFileSync(__dirname + '/datasources_template.json', 'utf8');
fileContents = fileContents.replace(/MONGO_HOST_ADDR/g, mongoAddr);
fileContents = fileContents.replace(/MONGO_HOST_PORT/g, mongoPort);
fs.writeFileSync(__dirname + '/datasources.json', fileContents);

var loopback = require('loopback');
var boot = require('loopback-boot');
var bodyParser = require('body-parser');
var app = module.exports = loopback();

var path = require('path');
app.use(loopback.static(path.resolve(__dirname, '../client')));
// to support JSON-encoded bodies
app.middleware('parse', bodyParser.json());
// to support URL-encoded bodies
app.middleware('parse', bodyParser.urlencoded({
  extended: true
}));

app.start = function() {
  // start the web server
  return app.listen(function() {
    app.emit('started');
    var baseUrl = app.get('url').replace(/\/$/, '');
    console.log('Web server listening at: %s', baseUrl);
    if (app.get('loopback-component-explorer')) {
      var explorerPath = app.get('loopback-component-explorer').mountPath;
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
    }
  });
};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function(err) {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module)
    app.start();
});
