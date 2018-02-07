'use strict';

var async = require('async');
var bitcore = require('bitcore-lib-zelcash');
var Common = require('./common');
var LRU = require('lru-cache');

function ChartController(options) {
  var self = this;
  this.node = options.node;
  this.blocks = options.blocks;

  this.chartCache = LRU(options.chartCacheSize || ChartController.DEFAULT_CHART_CACHE_SIZE);

  this.common = new Common({log: this.node.log});
}

ChartController.DEFAULT_CHART_CACHE_SIZE = 5;
ChartController.CHARTS = {
  'block-size': {
    name: 'Block Size'
  },
  'block-interval': {
    name: 'Block Interval'
  },
  'difficulty': {
    name: 'Difficulty'
  },
  'mining-revenue': {
    name: 'Mining revenue'
  }
};

ChartController.prototype.list = function(req, res) {
  var data = {
    charts: ChartController.CHARTS
  };
  res.jsonp(data);
};

ChartController.prototype.chart = function(req, res, next) {
  var self = this;
  var chartType = req.params.chartType;
  if (!(chartType in ChartController.CHARTS)) {
    return self.common.handleErrors(null, res);
  }

  var cacheKey = chartType;
  var chartCached = self.chartCache.get(cacheKey);

  if (chartCached) {
    req.chart = chartCached;
    next();
  } else {
    var dateStr;
    var todayStr = this.formatTimestamp(new Date());
    dateStr = todayStr;
    var gte = Math.round((new Date(dateStr)).getTime() / 1000);
    var lte = parseInt(req.query.startTimestamp) || gte + 86400;

    self.node.services.bitcoind.getBlockHashesByTimestamp(lte, gte, function(err, hashes) {
      if (err) {
        return self.common.handleErrors(err, res);
      }

      async.mapSeries(
        hashes,
        function(hash, next) {
          var subReq = {
            params: {
              blockHash: hash
            }
          };
          self.blocks.block(subReq, res, function() {
            next(null, subReq.block);
          });
        },
        function(err, blocks) {
          if (err) {
            return self.common.handleErrors(err, res);
          }
          self.generateChart(chartType, blocks, function(err, chart) {
            if (err) {
              return self.common.handleErrors(err, res);
            }
            self.chartCache.set(cacheKey, chart);
            req.chart = chart;
            next();
          });
        }
      );
    });
  }
};

ChartController.prototype.generateChart = function(chartType, blocks, callback) {
  if (chartType == 'mining-revenue') {
    this._miningRevenueChart(blocks, callback);
  } else {
    this._simpleChart(chartType, blocks, callback);
  }
};

ChartController.prototype._miningRevenueChart = function(blocks, callback) {
  var self = this;
  async.mapSeries(
    blocks,
    function(block, next) {
      async.reduce(
        block.tx,
        block.reward * 1e8,
        function(memo, txid, next2) {
          self.node.getDetailedTransaction(txid, function(err, tx) {
            next2(null, memo+tx.feeSatoshis);
          });
        },
        function(err, revenueSatoshis) {
          next(err, revenueSatoshis);
        }
      );
    },
    function(err, revenuesSat) {
      var chart = {
        name: ChartController.CHARTS['mining-revenue'].name,
        data: {
          x: 'height',
          json: {
          },
          names: {
          }
        }
      };

      chart.data.json.height = blocks.map(function(block, index) {
        return block.height;
      });
      chart.data.names.height = 'Height';

      chart.data.json.revenue = revenuesSat.map(function(revenueSatoshis, index) {
        return (revenueSatoshis / 1e8).toFixed(8);
      });
      chart.data.names.revenue = 'Mining revenue';

      callback(null, chart);
    }
  );
};

ChartController.prototype._simpleChart = function(chartType, blocks, callback) {
  var chart = {
    name: ChartController.CHARTS[chartType].name,
    data: {
      x: 'height',
      json: {
      },
      names: {
      }
    }
  };

  chart.data.json.height = blocks.map(function(block, index) {
    return block.height;
  });
  chart.data.names.height = 'Height';

  if (chartType == 'block-size') {
    chart.data.json.size = blocks.map(function(block, index) {
      return block.size;
    });
    chart.data.names.size = 'Block size';
  } else if (chartType == 'block-interval') {
    chart.data.json.height = chart.data.json.height.slice(1);
    chart.data.json.blockinterval = blocks.slice(1).map(function(block, index) {
      return block.time - blocks[index].time;
    });
    chart.data.names.blockinterval = 'Block interval';
  } else if (chartType == 'difficulty') {
    chart.data.json.difficulty = blocks.map(function(block, index) {
      return block.difficulty;
    });
    chart.data.names.difficulty = 'Difficulty';
  }

  callback(null, chart);
};

ChartController.prototype.show = function(req, res) {
  if (req.chart) {
    res.jsonp(req.chart);
  }
};

//helper to convert timestamps to yyyy-mm-dd format
ChartController.prototype.formatTimestamp = function(date) {
  var yyyy = date.getUTCFullYear().toString();
  var mm = (date.getUTCMonth() + 1).toString(); // getMonth() is zero-based
  var dd = date.getUTCDate().toString();

  return yyyy + '-' + (mm[1] ? mm : '0' + mm[0]) + '-' + (dd[1] ? dd : '0' + dd[0]); //padding
};

module.exports = ChartController;
