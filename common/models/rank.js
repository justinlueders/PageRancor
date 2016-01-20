var app = require('../../server/server'),
    path = require('path'),
    relativeUploadPath = '../../temp/',
    request = require('request'),
    Xray = require('x-ray'),
    x = Xray(),
    mkdirp = require('mkdirp');

mkdirp(path.join(__dirname, relativeUploadPath), function (err) {
    if (err) {
        console.error(err);
    }
});

module.exports = function(Rank) {
    Rank.createOrUpdateRanking = function(name,value,dwTrailUrlId,requester){
        var dwUrlRanking = app.models.DwUrlRanking;
        dwUrlRanking.create({
            "value": value,
            "dwTrailUrlId": dwTrailUrlId,
            "ranker": name,
            "requester": requester
        });
    };

    Rank.findTerms = function(term,body){
        return new Promise(function(resolve){
            var allowOverlapping = true;

            if (term.length <= 0) return (body.length + 1);

            var n = 0,
                pos = 0,
                step = allowOverlapping ? 1 : term.length;

            while (true) {
                pos = body.indexOf(term, pos);
                if (pos >= 0) {
                    ++n;
                    pos += step;
                } else break;
            }
            resolve(n);
        })
    };

    Rank.processUrl = function(url, terms){
      return new Promise(function(resolve){
          x(url, 'body@html')(function(err, body){
              body = body.toLowerCase();

              Promise.all(terms.map(function(term){return Rank.findTerms(term.toLowerCase(),body);})).then(function(result){
                  resolve({"url":url,"score":result.reduce(function(pv, cv) { return pv + cv; }, 0)})
              })
          })
      })
    };

    Rank.processPost = function(req,res, cb) {
        console.log("Rancor says: RAAWWWRRRR (got some data)");
        try {
          var data =req.body.urlRankRequest;
            if(typeof data == 'string'){
                data = JSON.parse(data);
            }
          Promise.all(data.urls.map(function(url){return Rank.processUrl(url,data.terms)})).then(function(result){
              Rank.createOrUpdateRanking("Rancor!",result,data.dwTrailUrlId,data.requester);
          });
        }
        catch (getError) {
          console.log("Rancor failed to ranc!");
          console.log(getError);
          res.status(500).send(getError.message);
        }
        res.status(200).send("Rancor says: nom nom nom (chewing on data)");
  };

    Rank.remoteMethod(
    'processPost',
    {
      accepts: [
        {arg: 'req', type: 'object', 'http': {source: 'req'}},
        {arg: 'res', type: 'object', 'http': {source: 'res'}}
      ],
      returns: {arg: 'data', root:true},
      http: {path: '/process',verb: 'post'}
    }
  );


    Rank.processGet = function(req,res, cb) {

    var dwUrlRanking = app.models.DwUrlRanking;
    var requester = req.query.requester;

    try {
      var whereClause={
          filter: {
              where: {
                  requester: requester
              },
              fields:{
                "dwTrailUrlId": true,
                "extractor": true,
                "value": true
              }
          }
      };

      dwUrlRanking.find(whereClause, function(err, items){
          dwUrlRanking.destroyAll({"requester": requester});
        //pull data from database and send back
        res.status(200).send(items);
        console.log('Rancor:' + requester + ' escaped!');
      });

    }
    catch (getError) {
      res.status(500).send(getError.message);
      console.log(getError.message)
    }
  };

    Rank.remoteMethod(
    'processGet',
    {
      accepts: [
        {arg: 'req', type: 'object', 'http': {source: 'req'}},
        {arg: 'res', type: 'object', 'http': {source: 'res'}}
      ],
      returns: {arg: 'data', root:true},
      http: {path: '/process',verb: 'get'}
    }
  );

};
