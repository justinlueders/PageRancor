var app = require('../../server/server'),
    path = require('path'),
    relativeUploadPath = '../../temp/',
    request = require('request'),
    textract = require('textract'),
    Xray = require('x-ray'),
    x = Xray(),
    mkdirp = require('mkdirp');

mkdirp(path.join(__dirname, relativeUploadPath), function (err) {
    if (err) {
        console.error(err);
    }
});

module.exports = function(Rank) {
    Rank.createOrUpdateRanking = function(name,nodes,dwTrailUrlId,requester, edges,finished){
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
                    "edges": edges,
                    "finished":finished
                });
                return;
            }

            dwUrlRanking.upsert({
                "id":item.id,
                "nodes": nodes,
                "dwTrailUrlId": dwTrailUrlId,
                "ranker": name,
                "requester": requester,
                "edges": edges,
                "finished":finished
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

    Rank.processSingle = function(data){
        var nodes = [];
        var edges = [];
        var url = data.urls;
        console.log("process Single for " + url);
        return new Promise(function(resolve,reject){
            Rank.processUrl(url,data.terms).then(function(node){
                console.log('processing Url ' + url);
                var nodeIndex = nodes.push(node) -1;
                node.id=nodeIndex;
                node.label = node.score;
                node.value = node.score;
                var processedUrls = [];
                processedUrls.push(url);

                Rank.createOrUpdateRanking("Rancor!",nodes,data.dwTrailUrlId,data.requester,edges,false);

                try {
                    x(url, 'body', ['a@href'])(function (err, hrefs) {
                        if (!hrefs) {
                            reject("No other urls found.");
                            return;
                        }
                        Promise.all(hrefs.map(function (href) {
                            return new Promise(function (resolve) {
                                if (processedUrls.indexOf(href) != -1) {
                                    console.log("ignoring duplicate url");
                                    resolve(false);
                                    return;
                                }
                                processedUrls.push(href);
                                Rank.processUrl(href, data.terms).then(function (childNode) {
                                    console.log('processing Url ' + href);
                                    if (!childNode || childNode.score < data.minScore) {
                                        resolve(false);
                                        return;
                                    }
                                    var childIndex = nodes.push(childNode) - 1;
                                    childNode.id = childIndex;
                                    childNode.label = childNode.score;
                                    childNode.value = childNode.score;
                                    edges.push({'from': 0, 'to': childIndex});

                                    Rank.createOrUpdateRanking("Rancor!", nodes, data.dwTrailUrlId, data.requester, edges, false);
                                    resolve(true);
                                }).catch(function (reason) {
                                    console.log(JSON.stringify(reason));
                                    resolve(false);
                                });
                            });

                        })).then(function () {
                            Rank.createOrUpdateRanking("Rancor!", nodes, data.dwTrailUrlId, data.requester, edges, true);
                            resolve("processing finished cleanly!");
                        }).catch(function (reason) {
                            Rank.createOrUpdateRanking("Rancor!", nodes, data.dwTrailUrlId, data.requester, edges, true);
                            console.log(JSON.stringify(reason));
                            resolve("processing finished with an error!");
                        });
                    });
                }
                catch(error){
                    console.log(JSON.stringify(error));
                    resolve("processing finished with an x-ray error!");
                }

            }).catch(function(reason){
                console.log(JSON.stringify(reason));
            })
        }).catch(function(reason){
            console.log(JSON.stringify(reason));
        })
    };

    /*
    indexjs line 165
    var $ = html ? html.html ? html : cheerio.load(html) : null;
    if (url && $) $ = absolutes(url, $);
    return $;*/
    Rank.processUrl = function(url, terms){
        return new Promise(function(resolve){
            try{
                if(url.indexOf("mailto") >=0){
                    resolve(null);
                    return;
                }
                x(url, 'body@html')(function(err, body){
                    if(err){
                        resolve(null);
                        return;
                    }
                    textract.fromBufferWithMime('text/html', new Buffer(body), function (err, text) {
                        //score the body
                        if(!text){
                            resolve(null);
                            return;
                        }
                        console.log("scoring " + url);
                        Rank.scoreBody(url,text,terms).then(function(node){
                            resolve(node);
                        }).catch(function(reason){
                            console.log(JSON.stringify(reason));
                        })
                    })
                });

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
            var data =req.body;
            data.terms = data.terms.split(',');

            if(!data||data.urls[0]==''||data.terms[0]==''||!data.dwTrailUrlId||!data.requester){
                cb(null,"error: missing input, please fill out the entire form.");
                return;
            }

            if(typeof data == 'string'){
                data = JSON.parse(data);
            }

            Rank.processSingle(data).then(function(result){
                console.log(result);
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
                  "edges":true,
                  "finished":true
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
