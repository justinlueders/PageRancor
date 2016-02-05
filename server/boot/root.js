module.exports = function(server) {
  var path = require('path');
  server.set('views', path.join(__dirname, '../../client'));
  server.locals.basedir = server.get('views');
  server.set('view engine', 'jade');

  var router = server.loopback.Router();

  router.get('/', function (req, res, next) {
    res.render('modules/core/views/pages/core');
  });

  router.get('/testsite', function (req, res, next) {
    res.render('modules/testsite/views/pages/maintest');
  });

  router.get('/testsite/testpageone', function (req, res, next) {
    res.render('modules/testsite/views/pages/testpageone');
  });

  router.get('/testsite/testpagetwo', function (req, res, next) {
    res.render('modules/testsite/views/pages/testpagetwo');
  });

  router.get('/testsite/testpagethree', function (req, res, next) {
    res.render('modules/testsite/views/pages/testpagethree');
  });

  server.use(router);
};
