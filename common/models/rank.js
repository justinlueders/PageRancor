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

    Rank.postQueue = [];

    Rank.createOrUpdateRanking = function(name,nodes,dwTrailUrlId,requester, edges,finished,urlCount, urlsProcessed){
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
                    "finished":finished,
                    "urlCount":urlCount,
                    "urlsProcessed":urlsProcessed
                });
                return;
            }

            if(item.finished && !finished){
                return;
            }

            dwUrlRanking.upsert({
                "id":item.id,
                "nodes": nodes,
                "dwTrailUrlId": dwTrailUrlId,
                "ranker": name,
                "requester": requester,
                "edges": edges,
                "finished":finished,
                "urlCount":urlCount,
                "urlsProcessed":urlsProcessed
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

    Rank.filterNodes = function(maxNodes,rootNode, nodes){
        var filteredNodes = nodes.sort(function(a, b){return b.score - a.score});
        var bestFilteredNodes = filteredNodes.slice(0,maxNodes-1);
        bestFilteredNodes.splice(0,0,rootNode);
        bestFilteredNodes.forEach(function(node,idx){
            node.label = node.score;
            node.value = node.score;
            node.id = idx;
        });
        return bestFilteredNodes;
    };

    Rank.buildEdges = function(rootNode,nodes){
        var edges = [];
        nodes.forEach(function(node,idx){
            if(idx == 0){[0]
                return;
            }
            edges.push({'from': rootNode.id, 'to': node.id});
        });
        return edges;
    };
    Rank.processSingle = function(data){
        var dwUrlRanking = app.models.DwUrlRanking;
        var rootNode = null;
        var nodes = [];
        var url = data.urls;
        var processedUrls = [];

        x.timeout(10000);

        if(data.timeout){
            x.timeout(data.timeout);
        }

        dwUrlRanking.destroyAll({"requester": data.requester});

        console.log("process Single for " + url);
        return new Promise(function(resolve,reject){
            Rank.processUrl(url,data.terms).then(function(node){
                console.log('processing Url ' + url);
                rootNode = node;
                processedUrls.push(url);
                Rank.createOrUpdateRanking("Rancor!", [rootNode], data.dwTrailUrlId, data.requester, [], false,0,0);

                try {
                    x(url, 'body', ['a@href'])(function (err, hrefs) {
                        if (!hrefs) {
                            reject("No other urls found.");
                            Rank.createOrUpdateRanking("Rancor!", [rootNode], data.dwTrailUrlId, data.requester, [], true, 0,0);
                            Rank.postQueue = Rank.postQueue.slice(1,Rank.postQueue.length);
                            if(Rank.postQueue.length>0){
                                Rank.processSingle(Rank.postQueue[0]);
                            }
                            resolve(false);
                            return;
                        }
                        var processed = 0;
                        Rank.createOrUpdateRanking("Rancor!", [rootNode], data.dwTrailUrlId, data.requester, [], false, hrefs.length,processed);

                        Promise.all(hrefs.map(function (href) {
                            return new Promise(function (resolve) {
                                if (processedUrls.indexOf(href) != -1 || !href) {
                                    console.log("ignoring invalid url: " + href);
                                    processed++;
                                    resolve(false);
                                    return;
                                }
                                processedUrls.push(href);
                                Rank.processUrl(href, data.terms).then(function (childNode) {
                                    console.log('processing Url ' + href);
                                    if (!childNode || childNode.score < data.minScore) {
                                        resolve(false);
                                        processed++;
                                        return;
                                    }
                                    nodes.push(childNode);
                                    processed++;
                                    Rank.createOrUpdateRanking("Rancor!", [rootNode], data.dwTrailUrlId, data.requester, [], false, hrefs.length,processed);
                                    resolve(true);
                                }).catch(function (reason) {
                                    console.log(JSON.stringify(reason));
                                    processed++;
                                    Rank.createOrUpdateRanking("Rancor!", [rootNode], data.dwTrailUrlId, data.requester, [], false, hrefs.length,processed);
                                    resolve(false);
                                });
                            });

                        })).then(function () {
                            var finalNodes = Rank.filterNodes(data.maxNodes,rootNode, nodes);
                            var finalEdges = Rank.buildEdges(rootNode,finalNodes);
                            Rank.createOrUpdateRanking("Rancor!", finalNodes, data.dwTrailUrlId, data.requester, finalEdges, true, hrefs.length,processed);
                            resolve("processing finished cleanly!");

                            Rank.postQueue = Rank.postQueue.slice(1,Rank.postQueue.length);
                            if(Rank.postQueue.length>0){
                                Rank.processSingle(Rank.postQueue[0]);
                            }

                        }).catch(function (reason) {
                            var finalNodes = Rank.filterNodes(data.maxNodes,rootNode, nodes);
                            var finalEdges = Rank.buildEdges(rootNode,finalNodes);
                            Rank.createOrUpdateRanking("Rancor!", finalNodes, data.dwTrailUrlId, data.requester, finalEdges, true, hrefs.length,processed);
                            resolve("processing finished with an error!" + JSON.stringify(reason));

                            Rank.postQueue = Rank.postQueue.slice(1,Rank.postQueue.length);
                            if(Rank.postQueue.length>0){
                                Rank.processSingle(Rank.postQueue[0]);
                            }
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
            console.log(JSON.stringify(reason));//dwUrlRanking.destroyAll({"requester": requester});
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
                if(!Rank.validateUrl(url)){
                    resolve(null);
                    return;
                }
                x(url, 'body@html')(function(err, body){
                    if(err || !body){
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
                            resolve(null);
                        })
                    })
                });

            }
            catch (getError) {
                console.log(getError);
                resolve(null);
            }

        }).catch(function(reason){
            console.log(JSON.stringify(reason));
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
              resolve(null);
          })
      }).catch(function(reason){
          console.log(JSON.stringify(reason));
      })
    };

    Rank.validateUrl = function(url){
        if(!url || url.length ===0){
            return false;
        }

        var lowerUrl = string.toLowerCase();

        if(lowerUrl.indexOf("http")!= 0){
            return false;
        }

        if(lowerUrl.indexOf("mailto")>=0){
            return false;
        }

        return true;
    };

    Rank.processPost = function(req,res, cb) {
        console.log("Rancor says: RAAWWWRRRR (got some data)");
        try {
            var data =req.body;
            data.terms = data.terms.split(',');

            if(!data||data.urls==''||data.terms[0]==''||!data.dwTrailUrlId||!data.requester){
                cb(null,"error: missing input, please fill out the entire form.");
                return;
            }

            if(! Rank.validateUrl(data.urls)){
                cb(null,"error: Invalid Url sent to Rancor. "+ data.urls);
                console.log("Invalid Url sent to Rancor. " + data.urls);
                return;
            }

            if(typeof data == 'string'){
                data = JSON.parse(data);
            }

            if(Rank.postQueue.length > 0){
                Rank.postQueue.length = 1;
                Rank.postQueue.push(data);
                cb(null,"queued");
                return;
            }

            Rank.postQueue.push(data);
            Rank.processSingle(data).then(function(result){
                console.log(result);
            });

            cb(null,"processing");
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
            console.log('Rancor:' + requester + ' requested results.');
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
