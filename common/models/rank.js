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
    Rank.createOrUpdateRanking = function(name,nodes,dwTrailUrlId,requester, edges){
        console.log("Creating rank!");
        var dwUrlRanking = app.models.DwUrlRanking;

        var whereClause={
            where: {
                requester: requester,
                dwTrailUrlId:dwTrailUrlId
            },
            fields:{
                "id": true
            }
        };

        dwUrlRanking.findOne(whereClause, function(err, item){
            if(!item){
                dwUrlRanking.create({
                    "nodes": nodes,
                    "dwTrailUrlId": dwTrailUrlId,
                    "ranker": name,
                    "requester": requester,
                    "edges": edges
                });
                return;
            }

            dwUrlRanking.upsert({
                "id":item.id,
                "nodes": nodes,
                "dwTrailUrlId": dwTrailUrlId,
                "ranker": name,
                "requester": requester,
                "edges": edges
            });

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
        }).catch(function(reason){
            console.log(JSON.stringify(reason));
        })
    };

    Rank.processTree = function(parentUrlIndex, url, data, depth, nodes, edges){
        console.log("process tree for " + url);
        return new Promise(function(resolve){

            Rank.processUrl(url,data.terms).then(function(node){
                console.log('processing Url ' + url);
                if(parentUrlIndex != null){
                    if(!node || node.score<=0){
                        resolve(true);
                        return;
                    }
                }
                var nodeIndex = nodes.push(node) -1;
                node.id=nodeIndex;
                node.label = node.score;
                node.value = node.score;
                if(parentUrlIndex != null && parentUrlIndex!=undefined){
                    if(parentUrlIndex >0){
                        console.log("parent index = " + parentUrlIndex);
                    }
                    edges.push({'from':parentUrlIndex,'to':nodeIndex});
                }

                Rank.createOrUpdateRanking("Rancor!",nodes,data.dwTrailUrlId,data.requester,edges);

                if(depth <=0 || !url){
                    resolve(true);
                    return;
                }
                try{
                    x(url, 'body', ['a@href'])(function (err, hrefs) {
                        if(!hrefs){
                            resolve(true);
                            return;
                        }
                        Promise.all(hrefs.map(function (href) {
                            if(!href){
                                return;
                            }
                            return Rank.processTree(nodeIndex, href, data, depth-1, nodes, edges).then(function (result) {
                                resolve(result);
                            }).catch(function(reason){
                                console.log(JSON.stringify(reason));
                            })
                        }));
                    });
                }
                catch (getError) {
                    console.log(getError);
                    resolve(true);
                    return;
                }

            }).catch(function(reason){
                console.log(JSON.stringify(reason));
            })
        }).catch(function(reason){
            console.log(JSON.stringify(reason));
        })
    };

    Rank.processUrl = function(url, terms){
        return new Promise(function(resolve){
            try{
                if(url.indexOf("mailto") >=0){
                    resolve(null);
                    return;
                }
                x(url, 'body@html')(function(err, body){
                    //score the body
                    if(!body){
                        resolve(null);
                        return;
                    }
                    console.log("scoring " + url);
                    Rank.scoreBody(url,body,terms).then(function(node){
                        resolve(node);
                    }).catch(function(reason){
                        console.log(JSON.stringify(reason));
                    })
                })
            }
            catch (getError) {
                console.log(getError);
            }

        }).catch(function(reason){
            console.log(JSON.stringify(reason));
            resolve(null);
        })
    };

    //does the actual scoring of the body text
    Rank.scoreBody = function(url, body, terms){
      return new Promise(function(resolve){
          body = body.toLowerCase();
          console.log("scoring body of " + url);
          Promise.all(terms.map(function(term){
              return Rank.findTerms(term.toLowerCase(),body);
          })).then(function(result){
              var score = result.reduce(function(pv, cv) { return pv + cv; }, 0 );
              console.log(url + " scored " + score.toString());
              resolve({"url":url,"score":score});
          }).catch(function(reason){
              console.log(JSON.stringify(reason));
          })
      }).catch(function(reason){
          console.log(JSON.stringify(reason));
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
          }).catch(function(reason){
              console.log(JSON.stringify(reason));
          })
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

    Rank.processLookAhead = function(req,res, cb) {
        console.log("Rancor says: RAAWWWRRRR (got some data)");
        try {
            var data =req.body;
            data.urls = data.urls.split(',');
            data.terms = data.terms.split(',');

            if(!data||data.urls[0]==''||data.terms[0]==''||!data.dwTrailUrlId||!data.requester){
                cb(null,"error: missing input, please fill out the entire form.");
                return;
            }

            if(typeof data == 'string'){
                data = JSON.parse(data);
            }
            var nodes = [];
            var edges = [];
            Promise.all(data.urls.map(function(url){return Rank.processTree(null,url,data,1,nodes,edges)})).then(function(result){
                console.log("finished");
            });

            cb(null,"success");
            return;
        }
        catch (getError) {
            console.log("Rancor failed to ranc!");
            console.log(getError);
            cb(null,getError.message);
        }
        cb(null,"Rancor says: nom nom nom (chewing on data)");
    };

    Rank.remoteMethod(
        'processLookAhead',
        {
            accepts: [
                {arg: 'req', type: 'object', 'http': {source: 'req'}},
                {arg: 'res', type: 'object', 'http': {source: 'res'}}
            ],
            returns: {arg: 'data', root:true},
            http: {path: '/look_ahead',verb: 'post'}
        }
    );

    Rank.processGet = function(req,res, cb) {

        var dwUrlRanking = app.models.DwUrlRanking;
        var requester = req.query.requester;

        if(!requester){
            res.status(404).send("requester is empty");
        }

        try {
          var whereClause={
              where: {
                  requester: requester
              },
              fields:{
                "dwTrailUrlId": true,
                "extractor": true,
                "value": true,
                  "nodes":true,
                  "edges":true
              }
          };

          dwUrlRanking.find(whereClause, function(err, items){
            //dwUrlRanking.destroyAll({"requester": requester});
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
    });

    Rank.destroyData = function(req,res, cb) {

        var dwUrlRanking = app.models.DwUrlRanking;
        dwUrlRanking.destroyAll();
        res.status(200).send();

    };

    Rank.remoteMethod(
        'destroyData',
        {
            accepts: [
                {arg: 'req', type: 'object', 'http': {source: 'req'}},
                {arg: 'res', type: 'object', 'http': {source: 'res'}}
            ],
            returns: {arg: 'data', root:true},
            http: {path: '/destroy',verb: 'get'}
        }
    );

};
