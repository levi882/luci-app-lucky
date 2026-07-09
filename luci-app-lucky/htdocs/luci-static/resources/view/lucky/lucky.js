'use strict';
'require view';
'require form';
'require poll';
'require tools.lucky as lucky';

var state = {
	installed: false,
	adminUrl: ''
};

function clearNode(node) {
	while (node && node.firstChild)
		node.removeChild(node.firstChild);
}

function appendContent(node, content) {
	if (!node)
		return;

	clearNode(node);

	if (Array.isArray(content)) {
		for (var i = 0; i < content.length; i++)
			node.appendChild(typeof content[i] === 'string' ? document.createTextNode(content[i]) : content[i]);
	}
	else if (typeof content === 'string') {
		node.appendChild(document.createTextNode(content));
	}
	else if (content) {
		node.appendChild(content);
	}
}

function badge(text, color) {
	return E('strong', { style: 'color:' + color }, text);
}

function actionButton(title, style, handler) {
	var button = E('button', {
		type: 'button',
		'class': 'btn cbi-button cbi-button-' + (style || 'button')
	}, title);

	button.addEventListener('click', handler);
	return button;
}

function externalLink(url) {
	return E('a', {
		href: url,
		target: '_blank',
		rel: 'noreferrer noopener'
	}, url);
}

function space() {
	return document.createTextNode('      ');
}

function openURL(url) {
	var win = window.open(url, '_blank');

	if (win == null || typeof win === 'undefined')
		window.location.href = url;
}

function serviceAction(action) {
	return lucky.service(action).then(function(res) {
		if (!res || res.ret !== 0)
			throw new Error('service action failed');

		return refreshStatus();
	}).catch(function() {
		alert(_('update failed'));
	});
}

function setLuckyConfig(key, value) {
	return lucky.setConfig(key, value).then(function(res) {
		if (!res || res.ret !== 0) {
			alert(_('update failed'));
			return;
		}

		alert(_('update success'));
		return serviceAction('restart').then(refreshInfo);
	}).catch(function() {
		alert(_('update failed'));
	});
}

function switchInternetAccess(allow) {
	var message = allow ? _('Are you sure Enalbe Internetaccess?') : _('Are you sure Disable Internetaccess?');

	if (confirm(message))
		return setLuckyConfig('switch_Internetaccess', allow ? 'true' : 'false');
}

function changeHttpPort() {
	var input = document.getElementById('_luckyHttpPortInput');
	var value = input ? input.value.trim() : '';
	var port;

	if (!/^\d+$/.test(value)) {
		alert(_('portValueError'));
		return;
	}

	port = parseInt(value, 10);

	if (port <= 0 || port > 65535) {
		alert(_('portValueError'));
		return;
	}

	return setLuckyConfig('admin_http_port', String(port));
}

function changeSafeURL() {
	var input = document.getElementById('_luckySafeURLInput');
	var value = input ? input.value.trim() : '';

	return setLuckyConfig('admin_safe_url', value);
}

function resetAuthInfo() {
	if (confirm(_('Reset 666 as admin account and password?')))
		return setLuckyConfig('reset_auth_info', '');
}

function updateStatus(running) {
	var status = document.getElementById('_luckyStatus');
	var adminOpen = document.getElementById('_luckyAdminOpen');

	if (running) {
		appendContent(status, [
			badge(_('The Lucky service is running.'), 'green'),
			space(),
			actionButton(_('Stop'), 'reload', function() {
				if (confirm(_('are you sure stop lucky service?')))
					serviceAction('stop');
			})
		]);
		appendContent(adminOpen, state.adminUrl ? externalLink(state.adminUrl) : '');
	}
	else if (state.installed) {
		appendContent(status, [
			badge(_('The Lucky service is not running.'), 'red'),
			space(),
			actionButton(_('Start'), 'reload', function() {
				if (confirm(_('are you sure start lucky service?')))
					serviceAction('start');
			})
		]);
		appendContent(adminOpen, '');
	}
	else {
		appendContent(status, badge(_('Not installed'), 'red'));
		appendContent(adminOpen, '');
	}
}

function refreshStatus() {
	return L.resolveDefault(lucky.status(), false).then(function(running) {
		updateStatus(!!running);
	});
}

function renderLatestButton() {
	return actionButton(_('get latest version'), 'reload', function() {
		openURL('https://release.66666.host/');
	});
}

function setNotInstalled() {
	var ids = [
		'_luckyInstallStatus',
		'_luckyCompilationTime',
		'_luckyVersion',
		'_luckyLoginInfo',
		'_luckyAdminOpen',
		'_luckyHttpPort',
		'_luckySafeURL',
		'_luckyAllowInternetaccess'
	];

	state.installed = false;
	state.adminUrl = '';

	for (var i = 0; i < ids.length; i++)
		appendContent(document.getElementById(ids[i]), badge(_('Not installed'), 'red'));

	appendContent(document.getElementById('_luckyVersion'), [
		badge(_('Not installed'), 'red'),
		space(),
		renderLatestButton()
	]);
	updateStatus(false);
}

function refreshInfo() {
	return L.resolveDefault(lucky.info(), null).then(function(info) {
		var luckyInfo = null;
		var baseConfig;
		var port;
		var safeURL;
		var allowInternetAccess;

		if (!info)
			return;

		appendContent(document.getElementById('_luckyArch'), badge((info.luckyArch || '').trim() || '-', 'blue'));

		if (!info.luckyInfo || !String(info.luckyInfo).trim()) {
			setNotInstalled();
			return refreshStatus();
		}

		try {
			luckyInfo = JSON.parse(info.luckyInfo);
		}
		catch (e) {
			luckyInfo = {};
		}

		baseConfig = info.LuckyBaseConfigure || {};
		if (typeof baseConfig === 'string') {
			try {
				baseConfig = JSON.parse(baseConfig).BaseConfigure || {};
			}
			catch (e) {
				baseConfig = {};
			}
		}
		port = baseConfig.AdminWebListenPort || '';
		safeURL = baseConfig.SafeURL || baseConfig.SetSafeURL || '';
		allowInternetAccess = baseConfig.AllowInternetaccess === true ||
			baseConfig.AllowInternetaccess === 'true' ||
			baseConfig.AllowInternetaccess === 1 ||
			baseConfig.AllowInternetaccess === '1';
		state.installed = true;
		state.adminUrl = port ? 'http://' + window.location.hostname + ':' + port : '';

		if (state.adminUrl && safeURL)
			state.adminUrl += safeURL;

		appendContent(document.getElementById('_luckyInstallStatus'), badge(_('Installed'), 'green'));
		appendContent(document.getElementById('_luckyCompilationTime'), badge(luckyInfo.Date || '-', 'green'));
		appendContent(document.getElementById('_luckyVersion'), [
			badge(luckyInfo.Version || '-', 'green'),
			space(),
			renderLatestButton()
		]);
		appendContent(document.getElementById('_luckyLoginInfo'), [
			badge(_('DefaultAuth') + ':666', 'green'),
			space(),
			actionButton(_('Reset'), 'reload', resetAuthInfo)
		]);
		appendContent(document.getElementById('_luckyHttpPort'), [
			E('input', {
				id: '_luckyHttpPortInput',
				type: 'text',
				'class': 'cbi-input-text',
				style: 'width:30%',
				inputmode: 'numeric',
				pattern: '[0-9]*',
				value: port
			}),
			space(),
			actionButton(_('Change'), 'reload', changeHttpPort)
		]);
		appendContent(document.getElementById('_luckySafeURL'), [
			E('input', {
				id: '_luckySafeURLInput',
				type: 'text',
				'class': 'cbi-input-text',
				style: 'width:30%',
				value: safeURL
			}),
			space(),
			actionButton(_('Change'), 'reload', changeSafeURL)
		]);

		if (allowInternetAccess) {
			appendContent(document.getElementById('_luckyAllowInternetaccess'), [
				badge(_('allow'), 'green'),
				space(),
				actionButton(_('Disable'), 'reload', function() {
					switchInternetAccess(false);
				})
			]);
		}
		else {
			appendContent(document.getElementById('_luckyAllowInternetaccess'), [
				badge(_('not allow'), 'red'),
				space(),
				actionButton(_('Enable'), 'reload', function() {
					switchInternetAccess(true);
				})
			]);
		}

		return refreshStatus();
	});
}

function infoRow(label, id) {
	return E('tr', {}, [
		E('td', { style: 'font-weight:bold; padding-right:1em' }, label),
		E('td', { id: id }, _('Collecting data...'))
	]);
}

function renderStatusSections() {
	return E('div', { 'class': 'lucky-status' }, [
		E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Main Program Information')),
			E('table', {}, [
				infoRow(_('Installation Status'), '_luckyInstallStatus'),
				infoRow(_('Lucky Status'), '_luckyStatus'),
				infoRow(_('Lucky Arch'), '_luckyArch'),
				infoRow(_('Compilation Time'), '_luckyCompilationTime'),
				infoRow(_('Lucky Version'), '_luckyVersion')
			])
		]),
		E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Admin Panel Information')),
			E('table', {}, [
				infoRow(_('Admin Panel'), '_luckyAdminOpen'),
				infoRow(_('Admin Panel Login Info'), '_luckyLoginInfo'),
				infoRow(_('Lucky Admin Http Port'), '_luckyHttpPort'),
				infoRow(_('Admin Safe URL'), '_luckySafeURL'),
				infoRow(_('Allow Internet access'), '_luckyAllowInternetaccess')
			])
		])
	]);
}

return view.extend({
	render: function() {
		var m;
		var s;
		var o;
		var sections = renderStatusSections();

		m = new form.Map('lucky', _('Lucky'), _('ipv4/ipv6 portforward,ddns,reverseproxy proxy,wake on lan,IOT and more...'));

		s = m.section(form.TypedSection, 'lucky', _('Basic Settings'));
		s.addremove = false;
		s.anonymous = true;

		o = s.option(form.Value, 'configdir', _('Config dir path'), _('The path to store the config file'));
		o.placeholder = '/etc/config/lucky.daji';

		poll.add(function() {
			return refreshStatus();
		}, 3);

		return m.render().then(function(mapNode) {
			window.setTimeout(refreshInfo, 0);
			return E('div', {}, [ mapNode, sections ]);
		});
	},

	handleSaveApply: function(ev, mode) {
		return this.handleSave(ev).finally(function() {
			return serviceAction('restart');
		});
	}
});
