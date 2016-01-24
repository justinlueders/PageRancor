angular.module('com.module.core')
    .directive('rankChart', function() {
        return {
            templateUrl: '/modules/core/views/partials/rank-chart',
            restrict: 'E',
            link: function postLink(scope, element) {
                element.text('this is the adminForm directive');

                var network = null;

                function getScaleFreeNetwork(nodeCount) {
                    var nodes = [];
                    var edges = [];
                    var connectionCount = [];
                    // randomly create some nodes and edges
                    for (var i = 0; i < nodeCount; i++) {
                        nodes.push({
                            id: i,
                            label: String(i)
                        });
                        connectionCount[i] = 0;
                        // create edges in a scale-free-network way
                        if (i == 1) {
                            var from = i;
                            var to = 0;
                            edges.push({
                                from: from,
                                to: to
                            });
                            connectionCount[from]++;
                            connectionCount[to]++;
                        }
                        else if (i > 1) {
                            var conn = edges.length * 2;
                            var rand = Math.floor(Math.random() * conn);
                            var cum = 0;
                            var j = 0;
                            while (j < connectionCount.length && cum < rand) {
                                cum += connectionCount[j];
                                j++;
                            }
                            var from = i;
                            var to = j;
                            edges.push({
                                from: from,
                                to: to
                            });
                            connectionCount[from]++;
                            connectionCount[to]++;
                        }
                    }
                    return {nodes: nodes, edges: edges};
                }

                function destroy() {
                    if (network !== null) {
                        network.destroy();
                        network = null;
                    }
                }

                function draw() {
                    destroy();
                    // randomly create some nodes and edges
                    var nodeCount = 20;
                    var data = getScaleFreeNetwork(nodeCount);

                    // create a network
                    var directionInput = "LR";
                    var options = {
                        layout: {
                            hierarchical: {
                                direction: directionInput
                            }
                        }
                    };
                    network = new vis.Network(element[0], data, options);

                    // add event listeners
                    network.on('select', function (params) {
                        //document.getElementById('selection').innerHTML = 'Selection: ' + params.nodes;
                    });
                }

                draw();
            }
        };
    });