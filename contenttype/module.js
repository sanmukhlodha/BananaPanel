/*

  ## Hits

  ### Parameters
  * style :: A hash of css styles
  * arrangement :: How should I arrange the query results? 'horizontal' or 'vertical'
  * chart :: Show a chart? 'none', 'bar', 'pie'
  * donut :: Only applies to 'pie' charts. Punches a hole in the chart for some reason
  * tilt :: Only 'pie' charts. Janky 3D effect. Looks terrible 90% of the time.
  * lables :: Only 'pie' charts. Labels on the pie?

*/
define([
  'angular',
  'app',
  'underscore',
  'jquery',
  'kbn',
 'd3',	
  'jquery.flot',
  'jquery.flot.pie'
], function (angular, app, _, $, kbn) {
  'use strict';


 var ContentObj = function(name,value)
{
	var self = this;
	self.name  = name;
	self.value = value;
	return self;
}

  var module = angular.module('kibana.panels.contenttype', []);
  app.useModule(module);

  module.controller('contenttype', function($scope, $q, querySrv, dashboard, filterSrv) {
    $scope.panelMeta = {
      modals : [
        {
          description: "Inspect",
          icon: "icon-info-sign",
          partial: "app/partials/inspector.html",
          show: $scope.panel.spyable
        }
      ],
      editorTabs : [
        {title:'Queries', src:'app/partials/querySelect.html'}
      ],
      status  : "Stable",
      description : "The total hits for the current query including all the applied filters."
    };

    // Set and populate defaults
    var _d = {
      queries     : {
        mode        : 'all',
        ids         : [],
        query       : '*:*',
        basic_query : '',
        custom      : ''
      },
      style   : { "font-size": '10pt'},
      arrangement : 'horizontal',
      chart       : 'total',
      counter_pos : 'above',
      donut   : false,
      tilt    : false,
      labels  : true,
      spyable : true,
      show_queries:true,
    };
    _.defaults($scope.panel,_d);

    $scope.init = function () {
      $scope.hits = 0;

      $scope.$on('refresh',function(){
        $scope.get_data();
      });
      $scope.get_data();

    };


    $scope.get_data = function() {
      delete $scope.panel.error;
      $scope.panelMeta.loading = true;

      // Make sure we have everything for the request to complete
      if(dashboard.indices.length === 0) {
        return;
      }

      // Solr
      $scope.sjs.client.server(dashboard.current.solr.server + dashboard.current.solr.core_name);

      var request = $scope.sjs.Request().indices(dashboard.indices);

      $scope.panel.queries.ids = querySrv.idsByMode($scope.panel.queries);
      // Build the question part of the query
      _.each($scope.panel.queries.ids, function(id) {
        var _q = $scope.sjs.FilteredQuery(
          querySrv.getEjsObj(id),
          filterSrv.getBoolFilter(filterSrv.ids));

        request = request
          .facet($scope.sjs.QueryFacet(id)
            .query(_q)
          ).size(0);
      });

      // Populate the inspector panel
      $scope.populate_modal(request);

      //Solr Search Query
      var fq = '';
      if (filterSrv.getSolrFq() && filterSrv.getSolrFq() != '') {
        fq = '&' + filterSrv.getSolrFq();
      }
      var wt_json = '&wt=json';
      var rows_limit = '&rows=1000'; // for hits, we do not need the actual response doc, so set rows=0
      var facet = '';

      //$scope.panel.queries.query = querySrv.getQuery(0) + fq + facet + wt_json + rows_limit;

      var promises = [];
      $scope.data = [];
      $scope.hits =0;
      $scope.name = "Sanmukh";
      $scope.panel.queries.query="";

       _.each($scope.panel.queries.ids, function(id) {
        var temp_q =  querySrv.getQuery(id)  + wt_json + rows_limit;
        $scope.panel.queries.query += temp_q + "\n";
        // Set the additional custom query
        if ($scope.panel.queries.custom !== null) {
          request = request.setQuery(temp_q + $scope.panel.queries.custom);
        } else {
          request = request.setQuery(temp_q);
        }
        promises.push(request.doSearch());
      });
      // Populate scope when we have results
      $q.all(promises).then(function(results) {
        _.each(dashboard.current.services.query.ids, function(id, i) {
          $scope.panelMeta.loading = false;
	  $scope.contentCount = {};
	  $scope.contentTypes = [];
          $scope.hits += results[i].response.numFound;
          $scope.maxVal = 0;
          for(i=0; i<results[0].response.docs.length; i++)	
	  {
		if(results[0].response.docs[i].title)
			$scope.name += "\n" + results[0].response.docs[i].title[0];

		if(results[0].response.docs[i].content_type)
		if($scope.contentCount[[results[0].response.docs[i].content_type[0].split(';')[0]]])	
		{
			var oldVal = $scope.contentCount[[results[0].response.docs[i].content_type[0].split(';')[0]]];
			oldVal++;
      if($scope.maxVal < oldVal)
        $scope.maxVal = oldVal;
			$scope.contentCount[[results[0].response.docs[i].content_type[0].split(';')[0]]] = oldVal;
		}
		else
		{
			$scope.contentCount[[results[0].response.docs[i].content_type[0].split(';')[0]]] = 1;
		}
	  }		

	for (var property in $scope.contentCount) {
 	   if ($scope.contentCount.hasOwnProperty(property)) {
 	       var contentObj = new ContentObj(property.split(';')[0],$scope.contentCount[property]);
	       $scope.contentTypes.push(contentObj);
	    }
	}	
	  
          // Check for error and abort if found
          $scope.data = $scope.contentTypes;
          $scope.$emit('render');
        });
      })
    };

    $scope.set_refresh = function (state) {
      $scope.refresh = state;
    };

    $scope.close_edit = function() {
      if($scope.refresh) {
        $scope.get_data();
      }
      $scope.refresh =  false;
      $scope.$emit('render');
    };

    $scope.populate_modal = function(request) {
      $scope.inspector = angular.toJson(JSON.parse(request.toString()), true);
    };

  });


module.directive('barChart', function() {
    return {
        restrict: 'E',
        link: function(scope, element) {
            scope.$on('render',function(){
                render_panel();
            });

            // Render the panel when resizing browser window
            angular.element(window).bind('resize', function() {
                render_panel();
            });

            // Function for rendering panel
            function render_panel() {
                // Clear the panel
                element.html('');
                
                var colors = d3.scale.category20();
                var parent_width = element.parent().width(),
                    height = parseInt(scope.row.height),
                    width = parent_width - 20,
                    barHeight = height / scope.data.length;

                var x = d3.scale.linear()
                        .domain([0, scope.maxVal])
                        .range([0, width]);

                var chart = d3.select(element[0]).append('svg')
                            .attr('width', width)
                            .attr('height', height)
                          .style('background','black')

                var bar = chart.selectAll('g')
                            .data(scope.data)
                          .enter().append('g')
                            .attr('transform', function(d,i) {
                                return 'translate(0,' + i * barHeight + ")";
                            })
                           .style('background','black');

                bar.append('rect')
                    .attr('width', function(d){ return x(d.value) })
                    .attr('height', barHeight - 1)
                    .style('fill', function(d,i){ return colors(i);  });

                bar.append('text')
                    .attr('x', function(d) { return 500;  })
                    .attr('y', barHeight / 2)
                    .attr('dy', '.35em')
                    .text(function(d) { return d.name + '='+d.value ; });


            }
        }
    };
});
});
