'use strict';
module.exports = function (app) {
  var path = require('path');
  app.set('view engine', 'jade');
  app.set('views', path.join(__dirname, '../../client/modules'));


  /* Core */
  app.get('/modules/core/views/partials/rank-chart', function (req, res) {
    res.render('modules/core/views/partials/rank-chart', {title: 'rank-chart'});
  });

};
