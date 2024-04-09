import { launch } from 'chrome-launcher';
import chromium from '@sparticuz/chromium'
import CDP from 'chrome-remote-interface';
import axios from 'axios'
import Xvfb from 'xvfb';
import { notice, slugify } from './general.js'

export const closeSession = async ({ xvfbsession, cdpSession, chrome }) => {
	if (xvfbsession) {
		try {
			xvfbsession.stopSync();
		} catch (err) { }
	}
	if (cdpSession) {
		try {
			await cdpSession.close();
		} catch (err) { }
	}
	if (chrome) {
		try {
			await chrome.kill();
		} catch (err) { }
	}
	return true
}


export const startSession = ({ args = [], headless = 'auto', customConfig = {}, proxy = {}, resolution = { width: 1366, height: 768 } }) => {
	return new Promise(async (resolve, reject) => {
		try {
			var xvfbsession = null
			var chromePath = customConfig.executablePath || customConfig.chromePath || chromium.path;

			if (slugify(process.platform).includes('linux') && headless === false) {
				notice({
					message: 'This library is stable with headless: true in linuxt environment and headless: false in Windows environment. Please send headless: \'auto\' for the library to work efficiently.',
					type: 'error'
				})
			} else if (slugify(process.platform).includes('win') && headless === true) {
				notice({
					message: 'This library is stable with headless: true in linuxt environment and headless: false in Windows environment. Please send headless: \'auto\' for the library to work efficiently.',
					type: 'error'
				})
			}

			if (headless === 'auto') {
				headless = slugify(process.platform).includes('linux') ? true : false
			}

			const chromeFlags = new Set(['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'].concat(args))

			if (headless === true) {
				slugify(process.platform).includes('win') ? chromeFlags.add('--headless=new') : ''
			}

			if (proxy?.url?.length > 0) {
				chromeFlags.add(`--proxy-server=${proxy.url}`);
			}
			else if (proxy?.host?.length > 0) {
				chromeFlags.add(`--proxy-server=${proxy.protocol ? `${proxy.protocol}://` : ""}${proxy.host}:${proxy.port}`);
			}

			if (process.platform === 'linux') {
				try {
					var xvfbsession = new Xvfb({
						silent: true,
						xvfb_args: ['-screen', '0', `${resolution.width}x${resolution.height}x24`, '-ac'],
						displayNum: 1,
					});
					xvfbsession.startSync();
				} catch (err) {
					notice({
						message: 'You are running on a Linux platform but do not have xvfb installed. The browser can be captured. Please install it with the following command\n\nsudo apt-get install xvfb\n\n' + err.message,
						type: 'error'
					})
				}
			}

			chromeFlags.add(`--window-size=${resolution.width},${resolution.height}`)
			chromeFlags.add('--start-maximized')

			var chrome = await launch({
				chromePath,
				chromeFlags: [...chromeFlags],
				...customConfig
			});
			var cdpSession = await CDP({ port: chrome.port });
			const { Network, Page, Runtime, DOM } = cdpSession;
			await Promise.all([
				Page.enable(),
				Page.setLifecycleEventsEnabled({ enabled: true }),
				Runtime.enable(),
				Network.enable(),
				DOM.enable()
			]);

			var chromeSession = await axios.get('http://localhost:' + chrome.port + '/json/version')
				.then(response => {
					response = response.data
					return {
						browserWSEndpoint: response.webSocketDebuggerUrl,
						agent: response['User-Agent']
					}
				})
				.catch(err => {
					throw new Error(err.message)
				})
			return resolve({
				chromeSession: chromeSession,
				cdpSession: cdpSession,
				chrome: chrome,
				xvfbsession: xvfbsession
			})

		} catch (err) {
			console.log(err);
			throw new Error(err.message)
		}
	})
}

