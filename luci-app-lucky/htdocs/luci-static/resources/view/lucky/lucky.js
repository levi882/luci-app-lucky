'use strict';
'require view';
'require form';
'require poll';
'require ui';
'require tools.lucky as lucky';

var state = { status: null, adminUrl: '', arch: '', readonly: true, busy: false, syncing: false, syncUntil: 0, syncFailed: false };

function content(id, value) {
	var node = document.getElementById(id);
	if (!node) return;
	while (node.firstChild) node.removeChild(node.firstChild);
	node.appendChild(typeof value === 'string' ? document.createTextNode(value) : value);
}

function button(label, handler, primary, id) {
	return E('button', { type: 'button', id: id, 'class': 'btn cbi-button lucky-button' + (primary ? ' lucky-primary' : ''),
		disabled: state.readonly || null, click: handler }, label);
}

function notify(message, error) {
	ui.addNotification(null, E('p', {}, message), error ? 'error' : 'info');
}

function applyBusy() {
	document.querySelectorAll('.lucky-page button').forEach(function(node) {
		node.disabled = state.readonly || state.busy || state.syncing;
	});
	['lucky-toggle', 'lucky-restart'].forEach(function(id) {
		var node = document.getElementById(id);
		if (node && (!state.status || !state.status.installed)) node.disabled = true;
	});
	var open = document.getElementById('lucky-open');
	if (open) {
		open.href = state.adminUrl || '#';
		open.setAttribute('aria-disabled', String(!state.status || !state.status.running || !state.adminUrl));
	}
}

function serviceAction(action) {
	if (state.readonly || state.busy || state.syncing) return Promise.resolve();
	state.busy = true;
	state.syncFailed = false;
	applyBusy();
	return lucky.service(action).then(function(res) {
		if (res.ret !== 0) throw new Error(_('Service operation failed.'));
		return refreshStatus();
	}).catch(function(error) { notify(error.message, true); }).finally(function() {
		state.busy = false;
		applyBusy();
	});
}

function confirmAction(message, handler) {
	ui.showModal(_('Confirm operation'), [ E('p', {}, message), E('div', { 'class': 'right' }, [
		E('button', { 'class': 'btn', click: ui.hideModal }, _('Cancel')), ' ',
		E('button', { 'class': 'btn cbi-button-action', click: function() { ui.hideModal(); handler(); } }, _('Confirm'))
	]) ]);
}

function saveSetting(key, value) {
	if (state.readonly || state.busy || state.syncing) return;
	state.busy = true;
	applyBusy();
	return lucky.setConfig(key, value).then(function(res) {
		if (res.ret !== 0) throw new Error(_('Unable to save the setting.'));
		// Editing settings must not turn a deliberately stopped service back on.
		if (state.status && state.status.running && state.status.enabled)
			return lucky.service('restart').then(function(result) {
				if (result.ret !== 0) throw new Error(_('Setting saved, but restart failed.'));
			});
	}).then(function() {
		notify(_('Setting saved.'));
		return refreshInfo().then(refreshStatus);
	}).catch(function(error) { notify(error.message, true); }).finally(function() {
		state.busy = false;
		applyBusy();
	});
}

function changePort() {
	var value = document.getElementById('lucky-port').value.trim();
	if (!/^\d+$/.test(value) || +value < 1 || +value > 65535) {
		notify(_('Enter a port between 1 and 65535.'), true);
		return;
	}
	return saveSetting('admin_http_port', String(+value));
}

function changeSafeURL() {
	var value = document.getElementById('lucky-safe-url').value.trim();
	if (value && !/^\/[A-Za-z0-9_\-/]*$/.test(value)) {
		notify(_('Use a path starting with /, containing letters, numbers, - or _.'), true);
		return;
	}
	return saveSetting('admin_safe_url', value);
}

function statusLabel(text, kind) {
	return E('span', { 'class': 'lucky-badge lucky-' + kind }, [ E('span', { 'class': 'lucky-dot' }), text ]);
}

function updateStatus(status) {
	state.status = status;
	var installed = status && status.installedInfo;
	var runtime = status && status.runtimeInfo;
	var running = status && status.running;
	var label = !status ? _('Status unavailable') : !status.installed ? _('Not installed') : running ? _('Running') : _('Stopped');
	content('lucky-state', statusLabel(label, !status ? 'muted' : running ? (status.stale ? 'warning' : 'success') : 'muted'));
	content('lucky-installed-version', installed ? installed.Version || '—' : '—');
	content('lucky-runtime-version', runtime ? runtime.Version || '—' : running ? _('Unknown') : '—');
	content('lucky-installed-date', installed ? installed.Date || '—' : '—');
	content('lucky-runtime-date', runtime ? runtime.Date || '—' : running ? _('Checking process version') : _('Service is stopped'));
	content('lucky-arch', state.arch || (installed ? installed.ARCH || '—' : '—'));
	var toggle = document.getElementById('lucky-toggle');
	if (toggle) toggle.textContent = running ? _('Stop') : _('Start');
	var restart = document.getElementById('lucky-restart');
	if (restart) restart.hidden = !running;
	var notice = document.getElementById('lucky-sync-notice');
	var message;
	if (!status) message = _('Unable to read service status. Retrying automatically.');
	else if (state.syncFailed || (status.stale && status.autoRestartAttempted && !state.syncing))
		message = _('Version switch did not complete. Use Restart to try again.');
	else if (state.syncing) message = _('Switching to the installed version…');
	else if (status.stale && !status.enabled) message = _('An older process is running. The service is disabled.');
	else if (status.stale && state.readonly) message = _('An older process is running. Restart requires write access.');
	else if (status.stale) message = _('The running program needs to be updated.');
	else if (running) message = _('The running program matches the installed version.');
	else message = _('Service is stopped');
	if (notice) notice.className = 'lucky-notice ' + (status && status.stale ? 'lucky-notice-warning' : '');
	content('lucky-sync-notice', message);
	applyBusy();
}

function refreshStatus() {
	return lucky.status().then(function(status) {
		if (typeof status.running !== 'boolean') throw new Error('Invalid status');
		if (state.syncing && status.running && !status.stale) {
			state.syncing = false;
			state.syncFailed = false;
		}
		else if (state.syncing && Date.now() > state.syncUntil) {
			state.syncing = false;
			state.syncFailed = true;
		}
		updateStatus(status);
		if (status.autoRestartAllowed && !state.readonly && !state.busy && !state.syncing && !state.syncFailed) {
			state.syncing = true;
			state.syncUntil = Date.now() + 30000;
			updateStatus(status);
			return lucky.syncVersion().then(function(result) {
				if (result.ret !== 0) throw new Error(_('Unable to switch to the installed version.'));
				if (!result.restarted) state.syncing = false;
			}).catch(function(error) {
				state.syncing = false;
				state.syncFailed = true;
				updateStatus(state.status);
				notify(error.message, true);
			});
		}
	}).catch(function() { updateStatus(null); });
}

function refreshInfo() {
	return lucky.info().then(function(info) {
		state.arch = (info.luckyArch || '').trim();
		var config = info.LuckyBaseConfigure || {};
		if (typeof config === 'string') {
			try { config = JSON.parse(config).BaseConfigure || {}; }
			catch (e) { config = {}; }
		}
		var port = config.AdminWebListenPort || '';
		var safeURL = config.SafeURL || config.SetSafeURL || '';
		var host = window.location.hostname;
		if (host.indexOf(':') !== -1 && host[0] !== '[') host = '[' + host + ']';
		state.adminUrl = port ? 'http://' + host + ':' + port + (safeURL ? '/' + safeURL.replace(/^\/+/, '') : '') : '';
		content('lucky-admin-url', state.adminUrl || _('No management address available'));
		// These inputs are refreshed only at load or after a saved change, not by polling.
		document.getElementById('lucky-port').value = port;
		document.getElementById('lucky-safe-url').value = safeURL;
		var allow = [true, 'true', 1, '1'].indexOf(config.AllowInternetaccess) !== -1;
		content('lucky-internet-state', statusLabel(allow ? _('Allowed') : _('Local access only'), allow ? 'warning' : 'success'));
		var toggle = document.getElementById('lucky-internet-toggle');
		toggle.textContent = allow ? _('Disable') : _('Enable');
		toggle.onclick = function() {
			confirmAction(allow ? _('Disable Internet access to the management panel?') : _('Allow Internet access to the management panel?'), function() {
				saveSetting('switch_Internetaccess', allow ? 'false' : 'true');
			});
		};
		applyBusy();
	}).catch(function() { notify(_('Unable to read management settings.'), true); });
}

function metric(label, id, captionId) {
	return E('div', { 'class': 'lucky-metric' }, [ E('span', { 'class': 'lucky-label' }, label),
		E('strong', { id: id, 'class': 'lucky-version' }, '—'), E('span', { id: captionId, 'class': 'lucky-caption' }, _('Collecting data...')) ]);
}

function setting(label, description, input, handler) {
	return E('div', { 'class': 'lucky-setting' }, [ E('label', { 'for': input.id, 'class': 'lucky-label' }, label),
		E('div', { 'class': 'lucky-input-action' }, [ E('input', Object.assign({ 'class': 'cbi-input-text', disabled: state.readonly || null }, input)), button(_('Change'), handler) ]),
		E('p', { 'class': 'lucky-caption' }, description) ]);
}

return view.extend({
	render: function() {
		state.readonly = !L.hasViewPermission();
		var m = new form.Map('lucky');
		var s = m.section(form.TypedSection, 'lucky', _('Configuration storage'));
		s.anonymous = true;
		s.addremove = false;
		var o = s.option(form.Value, 'configdir', _('Config dir path'), _('The path to store the config file'));
		o.placeholder = '/etc/config/lucky.daji';
		o.rmempty = false;
		return m.render().then(function(mapNode) {
			var page = E('div', { 'class': 'lucky-page' }, [
				E('link', { rel: 'stylesheet', href: L.resource('view/lucky/lucky.css') }),
				E('div', { 'class': 'lucky-heading' }, [ E('div', {}, [ E('span', { 'class': 'lucky-eyebrow' }, _('NETWORK SERVICES')),
					E('h2', {}, 'Lucky'), E('p', {}, _('Port forwarding, dynamic DNS, reverse proxy and Wake-on-LAN.')) ]),
					E('a', { 'class': 'lucky-doc-link', href: 'https://release.66666.host/', target: '_blank', rel: 'noopener noreferrer' }, _('View releases') + ' ↗') ]),
				E('section', { 'class': 'lucky-card lucky-overview' }, [
					E('div', { 'class': 'lucky-card-heading' }, [ E('div', {}, [ E('h3', {}, _('Service overview')), E('div', { id: 'lucky-state' }, statusLabel(_('Collecting data...'), 'muted')) ]),
						E('div', { 'class': 'lucky-actions' }, [
							button(_('Restart'), function() { serviceAction('restart'); }, false, 'lucky-restart'),
							button(_('Start'), function() {
								if (state.status && state.status.running) confirmAction(_('Stop Lucky? Active connections will be interrupted.'), function() { serviceAction('stop'); });
								else serviceAction('start');
							}, false, 'lucky-toggle'),
							E('a', { id: 'lucky-open', 'class': 'lucky-button lucky-primary', href: '#', target: '_blank', rel: 'noopener noreferrer', 'aria-disabled': 'true', click: function(ev) {
								if (this.getAttribute('aria-disabled') === 'true') ev.preventDefault();
							} }, _('Open management panel') + ' ↗')
						]) ]),
					E('div', { 'class': 'lucky-metrics' }, [ metric(_('Installed version'), 'lucky-installed-version', 'lucky-installed-date'), metric(_('Running version'), 'lucky-runtime-version', 'lucky-runtime-date') ]),
					E('div', { 'class': 'lucky-overview-footer' }, [ E('span', { 'class': 'lucky-architecture' }, [ E('span', { id: 'lucky-arch' }, '—') ]), E('span', { id: 'lucky-sync-notice', 'class': 'lucky-notice', role: 'status' }, _('Collecting data...')) ]) ]),
				E('div', { 'class': 'lucky-settings-grid' }, [
					E('section', { 'class': 'lucky-card' }, [ E('h3', {}, _('Management access')), E('p', { id: 'lucky-admin-url', 'class': 'lucky-address' }, _('Collecting data...')),
						setting(_('HTTP port'), _('Port used by the Lucky management panel.'), { id: 'lucky-port', type: 'text', inputmode: 'numeric', maxlength: 5 }, changePort),
						setting(_('Admin Safe URL'), _('Path required to open the management panel.'), { id: 'lucky-safe-url', type: 'text', placeholder: '/your-path' }, changeSafeURL) ]),
					E('section', { 'class': 'lucky-card' }, [ E('h3', {}, _('Access protection')),
						E('div', { 'class': 'lucky-protection-row' }, [ E('div', {}, [ E('span', { 'class': 'lucky-label' }, _('Allow Internet access')), E('p', { 'class': 'lucky-caption' }, _('Control remote access to the management panel.')) ]),
							E('div', { 'class': 'lucky-protection-action' }, [ E('span', { id: 'lucky-internet-state' }), button(_('Enable'), function() {}, false, 'lucky-internet-toggle') ]) ]),
						E('div', { 'class': 'lucky-protection-row' }, [ E('div', {}, [ E('span', { 'class': 'lucky-label' }, _('Login credentials')), E('p', { 'class': 'lucky-caption' }, _('Reset only if you have forgotten your login.')) ]),
							button(_('Reset login'), function() { confirmAction(_('Reset 666 as admin account and password?'), function() { saveSetting('reset_auth_info', ''); }); }) ]),
						E('div', { 'class': 'lucky-tip' }, _('Manage forwarding rules and other features in the Lucky management panel.')) ]) ]),
				E('div', { 'class': 'lucky-card lucky-form' }, [ mapNode ])
			]);
			poll.add(refreshStatus, 3);
			window.setTimeout(function() { refreshInfo().then(refreshStatus); }, 0);
			return page;
		});
	},

	handleSaveApply: function(ev, mode) {
		return this.handleSave(ev).then(function() {
			return ui.changes.apply(mode == '0');
		}).then(function() { return refreshInfo().then(refreshStatus); });
	}
});
