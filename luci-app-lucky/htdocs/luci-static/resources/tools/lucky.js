'use strict';
'require baseclass';
'require rpc';

var callLuckyStatus = rpc.declare({
	object: 'luci.lucky',
	method: 'status',
	expect: { '': {} }
});

var callLuckyInfo = rpc.declare({
	object: 'luci.lucky',
	method: 'info',
	expect: { '': {} }
});

var callLuckySetConfig = rpc.declare({
	object: 'luci.lucky',
	method: 'set_config',
	params: [ 'key', 'value' ],
	expect: { '': {} }
});

var callLuckyService = rpc.declare({
	object: 'luci.lucky',
	method: 'service',
	params: [ 'action' ],
	expect: { '': {} }
});

return baseclass.extend({
	status: function() {
		return callLuckyStatus().then(function(res) {
			return !!res.running;
		});
	},

	info: function() {
		return callLuckyInfo();
	},

	setConfig: function(key, value) {
		return callLuckySetConfig(key, value);
	},

	service: function(action) {
		return callLuckyService(action);
	},

	start: function() {
		return this.service('start');
	},

	stop: function() {
		return this.service('stop');
	},

	restart: function() {
		return this.service('restart');
	}
});
