const $ = require("../core/app");
const { produceArtifact } = require('./artifacts');
const { SUBS_KEY, COLLECTIONS_KEY } = require('./constants');

function register($app) {
	if (!$.read(SUBS_KEY)) $.write({}, SUBS_KEY);

	$app.get('/download/:name', downloadSubscription);

	$app.route('/api/sub/:name').get(getSubscription).patch(updateSubscription).delete(deleteSubscription);

	$app.route('/api/subs').get(getAllSubscriptions).post(createSubscription);
}

// subscriptions API
async function downloadSubscription(req, res) {
	const { name } = req.params;
	const { raw } = req.query || 'false';
	const platform = req.query.target || getPlatformFromHeaders(req.headers) || 'JSON';

	$.info(`正在下载订阅：${name}`);

	const allSubs = $.read(SUBS_KEY);
	const sub = allSubs[name];
	if (sub) {
		try {
			const output = await produceArtifact({
				type: 'subscription',
				item: sub,
				platform,
				noProcessor: raw
			});

			// forward flow headers
			const flowInfo = await getFlowHeaders(sub.url);
			if (flowInfo) {
				res.set('subscription-userinfo', flowInfo);
			}

			if (platform === 'JSON') {
				res.set('Content-Type', 'application/json;charset=utf-8').send(output);
			} else {
				res.send(output);
			}
		} catch (err) {
			$.notify(`🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』 下载订阅失败`, `❌ 无法下载订阅：${name}！`, `🤔 原因：${JSON.stringify(err)}`);
			$.error(JSON.stringify(err));
			res.status(500).json({
				status: 'failed',
				message: err
			});
		}
	} else {
		$.notify(`🌍 『 𝑺𝒖𝒃-𝑺𝒕𝒐𝒓𝒆 』 下载订阅失败`, `❌ 未找到订阅：${name}！`);
		res.status(404).json({
			status: 'failed'
		});
	}
}

function createSubscription(req, res) {
	const sub = req.body;
	const allSubs = $.read(SUBS_KEY);
	$.info(`正在创建订阅： ${sub.name}`);
	if (allSubs[sub.name]) {
		res.status(500).json({
			status: 'failed',
			message: `订阅${sub.name}已存在！`
		});
	}
	// validate name
	if (/^[\w-_]*$/.test(sub.name)) {
		allSubs[sub.name] = sub;
		$.write(allSubs, SUBS_KEY);
		res.status(201).json({
			status: 'success',
			data: sub
		});
	} else {
		res.status(500).json({
			status: 'failed',
			message: `订阅名称 ${sub.name} 中含有非法字符！名称中只能包含英文字母、数字、下划线、横杠。`
		});
	}
}

function getSubscription(req, res) {
	const { name } = req.params;
	const sub = $.read(SUBS_KEY)[name];
	if (sub) {
		res.json({
			status: 'success',
			data: sub
		});
	} else {
		res.status(404).json({
			status: 'failed',
			message: `未找到订阅：${name}!`
		});
	}
}

function updateSubscription(req, res) {
	const { name } = req.params;
	let sub = req.body;
	const allSubs = $.read(SUBS_KEY);
	if (allSubs[name]) {
		const newSub = {
			...allSubs[name],
			...sub
		};
		$.info(`正在更新订阅： ${name}`);
		// allow users to update the subscription name
		if (name !== sub.name) {
			// we need to find out all collections refer to this name
			const allCols = $.read(COLLECTIONS_KEY);
			for (const k of Object.keys(allCols)) {
				const idx = allCols[k].subscriptions.indexOf(name);
				if (idx !== -1) {
					allCols[k].subscriptions[idx] = sub.name;
				}
			}
			// update subscriptions
			delete allSubs[name];
			allSubs[sub.name] = newSub;
		} else {
			allSubs[name] = newSub;
		}
		$.write(allSubs, SUBS_KEY);
		res.json({
			status: 'success',
			data: newSub
		});
	} else {
		res.status(500).json({
			status: 'failed',
			message: `订阅${name}不存在，无法更新！`
		});
	}
}

function deleteSubscription(req, res) {
	const { name } = req.params;
	$.info(`删除订阅：${name}...`);
	// delete from subscriptions
	let allSubs = $.read(SUBS_KEY);
	delete allSubs[name];
	$.write(allSubs, SUBS_KEY);
	// delete from collections
	let allCols = $.read(COLLECTIONS_KEY);
	for (const k of Object.keys(allCols)) {
		allCols[k].subscriptions = allCols[k].subscriptions.filter((s) => s !== name);
	}
	$.write(allCols, COLLECTIONS_KEY);
	res.json({
		status: 'success'
	});
}

function getAllSubscriptions(req, res) {
	const allSubs = $.read(SUBS_KEY);
	res.json({
		status: 'success',
		data: allSubs
	});
}

async function getFlowHeaders(url) {
	const { headers } = await $.http.get({
		url,
		headers: {
			'User-Agent': 'Quantumult/1.0.13 (iPhone10,3; iOS 14.0)'
		}
	});
	const subkey = Object.keys(headers).filter((k) => /SUBSCRIPTION-USERINFO/i.test(k))[0];
	return headers[subkey];
}

function getPlatformFromHeaders(headers) {
	const keys = Object.keys(headers);
	let UA = '';
	for (let k of keys) {
		if (/USER-AGENT/i.test(k)) {
			UA = headers[k];
			break;
		}
	}
	if (UA.indexOf('Quantumult%20X') !== -1) {
		return 'QX';
	} else if (UA.indexOf('Surge') !== -1) {
		return 'Surge';
	} else if (UA.indexOf('Decar') !== -1 || UA.indexOf('Loon') !== -1) {
		return 'Loon';
	} else if (UA.indexOf('Stash') !== -1 || UA.indexOf('Shadowrocket') !== -1) {
		return 'Clash';
	} else {
		return null;
	}
}

module.exports = {
	register,
	getPlatformFromHeaders,
	getFlowHeaders
};