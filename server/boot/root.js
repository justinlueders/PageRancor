module.exports = function(server) {
  var path = require('path');
  server.set('views', path.join(__dirname, '../../client'));
  server.locals.basedir = server.get('views');
  server.set('view engine', 'jade');

  var router = server.loopback.Router();
  router.get('/', function (req, res, next) {
    res.render('modules/core/views/pages/core');
  });
  server.use(router);
};
