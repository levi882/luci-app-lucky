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

var callLuckySyncVersion = rpc.declare({
	object: 'luci.lucky',
	method: 'sync_version',
	expect: { '': {} }
});

var callLuckyPrepareConfigDir = rpc.declare({
	object: 'luci.lucky',
	method: 'prepare_config_dir',
	params: [ 'path' ],
	expect: { '': {} }
});

return baseclass.extend({
	prepareConfigDir: function(path) {
		return callLuckyPrepareConfigDir(path);
	},

	status: function() {
		return callLuckyStatus();
	},

	syncVersion: function() {
		return callLuckySyncVersion();
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
