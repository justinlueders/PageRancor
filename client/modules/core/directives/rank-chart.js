angular.module('com.module.core')
    .directive('rankChart', ['DwUrlRanking','$http',function(DwUrlRanking,$http) {
        return {
            templateUrl: '/modules/core/views/partials/rank-chart',
            restrict: 'E',
            link: function postLink($scope, element) {
                element.text('this is the adminForm directive');

                var network = null;
                var data = null;

                $scope.request_model = {
                    dwTrailUrlId:"myTrail",
                    requester:"jabba",
                    urls:"http://localhost:3004/testsite",
                    terms:"batman,robin",
                    minScore:5
                };


                $scope.load= function() {
                    draw();
                };

                $scope.submit = function(){

                    $http.post("/api/rank/process", $scope.request_model).success(function(data, status) {
                        console.log(data);
                    })
                };

                function destroy() {
                    if (network !== null) {
                        network.destroy();
                        network = null;
                    }
                }

                function draw() {
                    destroy();
                    $http.get("/api/rank/process",{params:$scope.request_model}).success(function(result) {
                        data = {nodes: result[0].nodes, edges: result[0].edges};
                        var options = {
                            layout: {
                                randomSeed: undefined,
                                improvedLayout: false
                            },
                            nodes: {
                                shape: 'dot',
                                scaling: {
                                    customScalingFunction: function (min,max,total,score) {
                                        return score/total;
                                    },
                                    min:5,
                                    max:150
                                }
                            }
                        };
                        network = new vis.Network(element[0], data, options);

                        network.on("showPopup", function (params) {
                            document.getElementById('eventSpan').innerHTML = '<h2>showPopup event: </h2>' + JSON.stringify(params, null, 4);
                        });
                        // add event listeners
                        network.on('select', function (params) {
                            //document.getElementById('selection').innerHTML = 'Selection: ' + params.nodes;
                            document.getElementById('eventSpan').innerHTML = '<h2>Selected Node: </h2> <a href="' + data.nodes[params.nodes[0]].url + '">' +
                                data.nodes[params.nodes[0]].url + '</a>';
                        });

                    });
                }

                draw();
            }
        };
    }]);