var util = require('util');
var EventEmitter = require('events').EventEmitter;
var request = require('request');
var _ = require('lodash');
var Common = require('../lib/common');

function MarketsService(options) {

    this.common = new Common({log: options.node.log});

    this.info = {
        success: true,
        initialprice: 0,
        price: 0,
        high: 0,
		low: 0,
		volume: 0,
        bid:0,
        ask:0
    };

    this._updateInfo();

    var self = this;

    setInterval(function () {
        self._updateInfo();
    }, 90000);

}

util.inherits(MarketsService, EventEmitter);

MarketsService.prototype._updateInfo = function() {
    var self = this;
    return request.get({
        url: 'https://tradeogre.com/api/v1/ticker/BTC-ZEL',
        json: true
    }, function (err, response, body) {
        body = JSON.parse(this.response);
        if (err) {
            return self.common.log.error('Tradeogre error', err);
        }

        if (response.statusCode != 200) {
            return self.common.log.error('Tradeogre error status code', response.statusCode);
        }

        if (body && _.isArray(body) && body.length) {
            var needToTrigger = false;

            ['success', 'initialprice', 'price', 'high', 'low', 'volume', 'bid', 'ask' ].forEach(function (param) {

                if (self.info[param] !== body[0][param]) {
                    self.info[param] = body[0][param];
                    needToTrigger = true;
                }

            });

            if (needToTrigger) {
                self.emit('updated', self.info);
            }

            return self.info;
        }

        return self.common.log.error('Tradeogre error body', body);

    });

};

MarketsService.prototype.getInfo = function(next) {
    return next(null, this.info);
};

module.exports = MarketsService;