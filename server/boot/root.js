module.exports = function(server) {
  var path = require('path');
  server.set('views', path.join(__dirname, '../views'));
  server.set('view engine', 'jade');

  var router = server.loopback.Router();
  router.get('/', function (req, res, next) {
    res.render('pages/index');
  });
  server.use(router);
};
