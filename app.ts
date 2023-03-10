'use strict';

import { Agent } from './src/schemas/dataset1/types/Agent';
import moment from 'moment';
import {
	createListing,
	client as mongoClient,
	findListing,
	updateListing,
} from './src/MongoManager';
import queryMapper, { QUERRIES } from './src/QueryMapper';
import { Dto } from './src/schemas/dataset1/types/Dto';
import { Block } from './src/schemas/dataset1/types/Block';
import { Connect } from './src/schemas/dataset1/types/Connect';
import { GeoIp } from './src/schemas/dataset1/types/GeoIp';
import { validateIP } from './src/util/Validator';
import { Play } from './src/schemas/dataset1/types/Play';
import { H5liveStat } from './src/schemas/dataset1/types/H5liveStat';
import { Close } from './src/schemas/dataset1/types/Close';
import { RtmpStat } from './src/schemas/dataset1/types/RtmpStat';
import { closest } from './src/util/Utils';
import {
	endTwoWeeksAgo,
	regularIpsConnectQuery,
	regularIpsValidationQuery,
	startTwoWeeksAgo,
} from './src/queries/fetchRegularIps';

require('dotenv').config();

const { Client } = require('@elastic/elasticsearch');

const ES_USER = process.env.ES7_USER;
const ES_PASS = process.env.ES7_PASS;
const ES_HOST = process.env.ES7_HOST;
const ES_PORT = process.env.ES7_PORT;

// const IP: string = process.argv[2];

const client = new Client({
	node: `https://${ES_USER}:${ES_PASS}@${ES_HOST}:${ES_PORT}`,
});

async function collectMisuseIps(): Promise<string[]> {
	console.log("Collecting Misuser IP's from yesterday...");

	const blockedIps = await client
		.search({
			index: 'streamcloud_logging*',
			body: queryMapper[QUERRIES.BLOCKED_IPS],
		})
		.then((jsondata: any) => {
			let array: string[] = [];
			jsondata.body.aggregations.uniqueIps.buckets.forEach((item) => {
				array.push(item.key);
			});
			return array;
		});

	console.log('These IPs were blocked yesterday:\n');
	blockedIps.forEach((item) => console.log(item));

	return blockedIps;
}

async function collectRegularIps(): Promise<string[]> {
	console.log("Collecting regular IP's from last month...");

	//console.log(JSON.stringify(regularIpsConnectQuery));

	let validIps = new Array<string>();

	const ips = await client
		.search({
			index: 'streamcloud_logging*',
			body: regularIpsConnectQuery,
		})
		.then((jsondata: any) => {
			const result = jsondata.body.hits.hits;

			if (result.length === 0) return [] as Array<string>;

			let array: string[] = [];
			result.forEach((item) => {
				let ip = item.fields['user.ip'][0];
				if (!array.includes(ip)) array.push(ip);
			});
			return array;
		});

	if (ips.length === 0) {
		console.log(
			'No CONNECT events found last month from: ' +
				startTwoWeeksAgo.format('YYYY-MM-DD HH:mm:ss:SSS') +
				' to: ' +
				endTwoWeeksAgo.format('YYYY-MM-DD HH:mm:ss:SSS')
		);
		return validIps;
	}

	console.log('Found ' + ips.length + ' unique IPs.');

	for (let i = 0; i < ips.length; i++) {
		console.log('Validating ' + ips[i]);

		const regularIpsQuery = regularIpsValidationQuery;
		regularIpsQuery.query.bool.filter[0].bool!.should[0].match_phrase.IP =
			validateIP(ips[i]);

		await client
			.search({
				index: 'streamcloud_logging*',
				body: regularIpsValidationQuery,
			})
			.then((jsondata: any) => {
				const result = jsondata.body.hits.hits;
				if (result && result.length === 0) {
					validIps.push(ips[i]);
					console.log(ips[i] + ' is valid');
				} else {
					console.log(ips[i] + ' is invalid');
				}
			});
	}
	return validIps;
}

async function collectRtmpStats(ip: string, DB, COLLECTION) {
	let timestamps = new Array<number>();
	let streamnames = new Array<string>();
	await findListing(mongoClient, DB, COLLECTION, ip).then((jsondata: Dto) => {
		for (let i = 0; i < jsondata.connects.length; i++) {
			timestamps.push(jsondata.connects[i].timestamp);
			streamnames.push(
				jsondata.connects[i].orgahash + '-' + jsondata.connects[i].streamhash
			);
		}
	});

	if (timestamps.length !== streamnames.length) {
		console.log('Aborting RTMP collection, found corrupt CONNECT event data.');
		return [] as Array<RtmpStat>;
	}

	const amountOfConnects = timestamps.length;

	// reduce request because of performance issues
	timestamps = timestamps.filter((x, i) => i % 2);
	streamnames = streamnames.filter((x, i) => i % 2);

	console.log(
		'Collecting ' +
			timestamps.length +
			' RTMP STATS based on ' +
			amountOfConnects +
			' CONNECT events...'
	);

	let rtmpStats = new Array<RtmpStat>();

	for (let i = 0; i < timestamps.length; i++) {
		const selectedQuery = queryMapper[QUERRIES.RTMPSTATS](
			streamnames[i],
			timestamps[i]
		);

		await client
			.search({
				index: 'streamcloud_metrics_serverstats*',
				body: selectedQuery,
			})
			.then((jsondata: any) => {
				const result = jsondata.body.hits.hits;

				// safety switch
				if (!result) {
					console.log(
						'Something went wrong with RTMPSTAT Query ',
						JSON.stringify(selectedQuery)
					);
					return;
				} else if (result.length === 0) {
					console.log(
						'No RTMPSTATS found in the timerange around ' +
							moment.unix(timestamps[i]).format('YYYY-MM-DD HH:mm:ss:SSS') +
							' for ' +
							streamnames[i]
					);
					return;
				}

				let resTimings = [] as Array<number>;

				// console.log('CONNECT at ' + timestamps[i] + ' (unix)');
				// console.log(
				// 	'CONNECT at ' +
				// 		moment.unix(timestamps[i]).format('YYYY-MM-DD HH:mm:ss:SSS')
				// );

				result.forEach((hit) => {
					// console.log('Hit at ' + hit.fields['@timestamp'][0]);

					resTimings.push(
						moment(hit.fields['@timestamp'][0].replace('Z', '')).unix()
					);
				});

				const closestTimestamp = closest(timestamps[i], resTimings);
				// console.log(
				// 	'Closest Time at ' +
				// 		moment.unix(closestTimestamp).format('YYYY-MM-DD HH:mm:ss:SSS')
				// );

				let currRtmpEvent: Array<any> = result.filter(
					(elem) =>
						moment(elem.fields['@timestamp'][0].replace('Z', '')).unix() ===
						closestTimestamp
				);

				let rtmpStat = {} as RtmpStat;
				rtmpStat.timestamp = moment(
					currRtmpEvent[0].fields['@timestamp'][0].replace('Z', '')
				).unix();
				rtmpStat.orgahash = currRtmpEvent[0].fields['bintu.orgahash.keyword'];
				rtmpStat.streamhash =
					currRtmpEvent[0].fields['bintu.streamhash.keyword'];
				rtmpStat.clients = currRtmpEvent[0].fields['rtmp.stat.clients'];
				rtmpStat.videoCodec = currRtmpEvent[0].fields['rtmp.stat.video.codec'];
				rtmpStat.audioCodec = currRtmpEvent[0].fields['rtmp.stat.audio.codec'];
				rtmpStat.duration = currRtmpEvent[0].fields['rtmp.stat.time'];
				rtmpStat.framerate =
					currRtmpEvent[0].fields['rtmp.stat.video.frame_rate'];
				rtmpStat.tid = currRtmpEvent[0].fields['rtmp.tid'];
				rtmpStat.timeRatio = currRtmpEvent[0].fields['rtmp.stat.time_ratio'];
				rtmpStat.videoHeight =
					currRtmpEvent[0].fields['rtmp.stat.video.height'];
				rtmpStat.videoWidth = currRtmpEvent[0].fields['rtmp.stat.video.width'];
				rtmpStat.videoBytes = currRtmpEvent[0].fields['rtmp.stat.bw.video'];
				rtmpStat.audioBytes = currRtmpEvent[0].fields['rtmp.stat.bw.audio'];

				rtmpStat.geoip = {} as GeoIp;
				rtmpStat.geoip.postal_code =
					currRtmpEvent[0].fields['geoip.postal_code'];
				rtmpStat.geoip.city_name = currRtmpEvent[0].fields['geoip.city_name'];
				rtmpStat.geoip.country = currRtmpEvent[0].fields['geoip.country_name'];
				rtmpStat.geoip.region_name =
					currRtmpEvent[0].fields['geoip.region_name'];
				rtmpStat.geoip.latitude = currRtmpEvent[0].fields['geoip.latitude'];
				rtmpStat.geoip.longitude = currRtmpEvent[0].fields['geoip.longitude'];

				rtmpStats.push(rtmpStat);
			})
			.catch((err) => {
				console.log(err);
			});
	}
	console.log('Found ' + rtmpStats.length + ' RtmpStats events for IP: ' + ip);

	return rtmpStats;
}

async function collectConnects(ip: string) {
	const selectedQuery = queryMapper[QUERRIES.CONNECTS];

	selectedQuery.query.bool.filter[0].bool!.should[0].match_phrase.IP =
		validateIP(ip);

	//console.log('CONNECT Query ', JSON.stringify(selectedQuery));

	return await client
		.search({
			index: 'streamcloud_logging*',
			body: selectedQuery,
		})
		.then((jsondata: any) => {
			const result = jsondata.body.hits.hits;

			// safety switch
			if (!result) {
				console.log(
					'Something went wrong with CONNECT Query ',
					JSON.stringify(selectedQuery)
				);
				return new Array<Connect>();
			} else if (result.length === 0) {
				console.log(
					'No CONNECT found in the timerange around ' +
						selectedQuery.query.bool.filter[1].range!['@timestamp'] +
						' for ' +
						ip
				);
				return new Array<Connect>();
			}

			let connects = [] as Array<Connect>;

			for (let i = 0; i < result.length; i++) {
				let connect = {} as Connect;

				connect.timestamp = moment(
					result[i].fields['@timestamp'][0].replace('Z', '')
				).unix();
				connect.orgahash = result[i].fields['bintu.orgahash.keyword'];
				connect.streamhash = result[i].fields['bintu.streamhash.keyword'];
				connect.referrer = result[i].fields['user.referer.keyword'];
				connect.bytes_sent = result[i].fields['stream.bytes_sent'];
				connect.h5liveTags = result[i].fields['h5live.tags'];

				connect.geoip = {} as GeoIp;
				connect.geoip.postal_code = result[i].fields['geoip.postal_code'];
				connect.geoip.city_name = result[i].fields['geoip.city_name'];
				connect.geoip.country = result[i].fields['geoip.country_name'];
				connect.geoip.region_name = result[i].fields['geoip.region_name'];
				connect.geoip.latitude = result[i].fields['geoip.latitude'];
				connect.geoip.longitude = result[i].fields['geoip.longitude'];

				connect.agent = {} as Agent;
				connect.agent.device = result[i].fields['user.agent.device'];
				connect.agent.id = result[i].fields['user.agent.id'];
				connect.agent.major = result[i].fields['user.agent.major'];
				connect.agent.minor = result[i].fields['user.agent.minor'];
				connect.agent.name = result[i].fields['user.agent.name'];
				connect.agent.os = result[i].fields['user.agent.os'];
				connect.agent.os_full = result[i].fields['user.agent.os_full'];
				connect.agent.os_major = result[i].fields['user.agent.os_major'];
				connect.agent.os_minor = result[i].fields['user.agent.os_minor'];
				connect.agent.os_name = result[i].fields['user.agent.os_name'];
				connect.agent.os_version = result[i].fields['user.agent.os_version'];
				connect.agent.patch = result[i].fields['user.agent.patch'];
				connect.agent.version = result[i].fields['user.agent.version'];
				connects.push(connect);
			}
			console.log('Found ' + connects.length + ' CONNECT events for IP: ' + ip);

			return connects;
		})
		.catch((err) => {
			console.log(err);
			return new Array<Connect>();
		});
}
async function collectPlays(ip: string) {
	const selectedQuery = queryMapper[QUERRIES.PLAYS];
	selectedQuery.query.bool.filter[0].bool!.should[0].match_phrase.IP =
		validateIP(ip);

	return await client
		.search({
			index: 'streamcloud_logging*',
			body: selectedQuery,
		})
		.then((jsondata: any) => {
			const result = jsondata.body.hits.hits;

			// safety switch
			if (!result) {
				console.log(
					'Something went wrong with PLAY Query ',
					JSON.stringify(selectedQuery)
				);
				return new Array<Play>();
			} else if (result.length === 0) {
				console.log(
					'No PLAY found in the timerange around ' +
						selectedQuery.query.bool.filter[1].range!['@timestamp'] +
						' for ' +
						ip
				);
				return new Array<Play>();
			}

			let plays = [] as Array<Play>;

			for (let i = 0; i < result.length; i++) {
				let play = {} as Play;
				play.timestamp = moment(
					result[i].fields['@timestamp'][0].replace('Z', '')
				).unix();
				play.orgahash = result[i].fields['bintu.orgahash.keyword'];
				play.streamhash = result[i].fields['bintu.streamhash.keyword'];
				play.referrer = result[i].fields['user.referer.keyword'];
				play.bytesSent = result[i].fields['stream.bytes_sent'];
				play.bytesReceived = result[i].fields['stream.bytes_received'];
				play.duration = result[i].fields['stream.duration'];
				play.h5liveTags = result[i].fields['h5live.tags'];

				play.geoip = {} as GeoIp;
				play.geoip.postal_code = result[i].fields['geoip.postal_code'];
				play.geoip.city_name = result[i].fields['geoip.city_name'];
				play.geoip.country = result[i].fields['geoip.country_name'];
				play.geoip.region_name = result[i].fields['geoip.region_name'];
				play.geoip.latitude = result[i].fields['geoip.latitude'];
				play.geoip.longitude = result[i].fields['geoip.longitude'];

				play.agent = {} as Agent;
				play.agent.device = result[i].fields['user.agent.device'];
				play.agent.id = result[i].fields['user.agent.id'];
				play.agent.major = result[i].fields['user.agent.major'];
				play.agent.minor = result[i].fields['user.agent.minor'];
				play.agent.name = result[i].fields['user.agent.name'];
				play.agent.os = result[i].fields['user.agent.os'];
				play.agent.os_full = result[i].fields['user.agent.os_full'];
				play.agent.os_major = result[i].fields['user.agent.os_major'];
				play.agent.os_minor = result[i].fields['user.agent.os_minor'];
				play.agent.os_name = result[i].fields['user.agent.os_name'];
				play.agent.os_version = result[i].fields['user.agent.os_version'];
				play.agent.patch = result[i].fields['user.agent.patch'];
				play.agent.version = result[i].fields['user.agent.version'];
				plays.push(play);
			}
			console.log('Found ' + plays.length + ' PLAY events for IP: ' + ip);

			return plays;
		})
		.catch((err) => {
			console.log(err);
			return new Array<Play>();
		});
}

async function collectH5liveStats(ip: string) {
	const selectedQuery = queryMapper[QUERRIES.H5LIVESTATS];
	selectedQuery.query.bool.filter[0].bool!.should[0].match_phrase.IP =
		validateIP(ip);

	return await client
		.search({
			index: 'streamcloud_metrics_serverstats*',
			body: selectedQuery,
		})
		.then((jsondata: any) => {
			const result = jsondata.body.hits.hits;

			// safety switch
			if (!result) {
				console.log(
					'Something went wrong with H5LIVESTAT Query ',
					JSON.stringify(selectedQuery)
				);
				return new Array<H5liveStat>();
			} else if (result.length === 0) {
				console.log(
					'No H5LIVESTAT found in the timerange around ' +
						selectedQuery.query.bool.filter[1].range!['@timestamp'] +
						' for ' +
						ip
				);
				return new Array<H5liveStat>();
			}

			let h5liveStats = [] as Array<H5liveStat>;

			for (let i = 0; i < result.length; i++) {
				let h5liveStat = {} as H5liveStat;

				h5liveStat.timestamp = moment(
					result[i].fields['@timestamp'][0].replace('Z', '')
				).unix();
				h5liveStat.orgahash = result[i].fields['bintu.orgahash.keyword'];
				h5liveStat.streamhash = result[i].fields['bintu.streamhash.keyword'];
				h5liveStat.referrer = result[i].fields['user.referer.keyword'];
				h5liveStat.options = result[i].fields['h5live.options'];
				h5liveStat.version = result[i].fields['h5live.stat.version'];
				h5liveStat.group = result[i].fields['h5live.group'];
				h5liveStat.playerId = result[i].fields['h5live.player_id'];
				h5liveStat.session = result[i].fields['h5live.session'];
				h5liveStat.durationRelative =
					result[i].fields['h5live.stat.play.duration.relative'];
				h5liveStat.durationTotal =
					result[i].fields['h5live.stat.play.duration.total'];
				h5liveStat.startTime = result[i].fields['h5live.stat.play.start.time'];
				h5liveStat.h5liveTags = result[i].fields['h5live.tags'];
				h5liveStat.bitsPerSecSent =
					result[i].fields['h5live.stat.bits_per_second.sent'];
				h5liveStat.bytesSentRelative =
					result[i].fields['h5live.stat.bytes.sent.relative'];
				h5liveStat.dropRatio =
					result[i].fields['h5live.stat.drop.ratio.relative'];
				h5liveStat.dropTime =
					result[i].fields['h5live.stat.drop.time.relative'];
				h5liveStat.tokenValue = result[i].fields['h5live.token.value'];
				h5liveStat.tokenExpires = moment(
					result[i].fields['h5live.token.expires']
				).unix();

				h5liveStat.geoip = {} as GeoIp;
				h5liveStat.geoip.postal_code = result[i].fields['geoip.postal_code'];
				h5liveStat.geoip.city_name = result[i].fields['geoip.city_name'];
				h5liveStat.geoip.country = result[i].fields['geoip.country_name'];
				h5liveStat.geoip.region_name = result[i].fields['geoip.region_name'];
				h5liveStat.geoip.latitude = result[i].fields['geoip.latitude'];
				h5liveStat.geoip.longitude = result[i].fields['geoip.longitude'];

				h5liveStat.agent = {} as Agent;
				h5liveStat.agent.device = result[i].fields['user.agent.device'];
				h5liveStat.agent.id = result[i].fields['user.agent.id'];
				h5liveStat.agent.major = result[i].fields['user.agent.major'];
				h5liveStat.agent.minor = result[i].fields['user.agent.minor'];
				h5liveStat.agent.name = result[i].fields['user.agent.name'];
				h5liveStat.agent.os = result[i].fields['user.agent.os'];
				h5liveStat.agent.os_full = result[i].fields['user.agent.os_full'];
				h5liveStat.agent.os_major = result[i].fields['user.agent.os_major'];
				h5liveStat.agent.os_minor = result[i].fields['user.agent.os_minor'];
				h5liveStat.agent.os_name = result[i].fields['user.agent.os_name'];
				h5liveStat.agent.os_version = result[i].fields['user.agent.os_version'];
				h5liveStat.agent.patch = result[i].fields['user.agent.patch'];
				h5liveStat.agent.version = result[i].fields['user.agent.version'];
				h5liveStats.push(h5liveStat);
			}
			console.log(
				'Found ' + h5liveStats.length + ' H5liveStat events for IP: ' + ip
			);

			return h5liveStats;
		})
		.catch((err) => {
			console.log(err);
			return new Array<H5liveStat>();
		});
}

async function collectCloses(ip: string) {
	const selectedQuery = queryMapper[QUERRIES.CLOSES];
	selectedQuery.query.bool.filter[0].bool!.should[0].match_phrase.IP =
		validateIP(ip);

	return await client
		.search({
			index: 'streamcloud_accounting*',
			body: selectedQuery,
		})
		.then((jsondata: any) => {
			const result = jsondata.body.hits.hits;

			// safety switch
			if (!result) {
				console.log(
					'Something went wrong with CLOSE Query ',
					JSON.stringify(selectedQuery)
				);
				return new Array<Close>();
			} else if (result.length === 0) {
				console.log(
					'No CLOSE found in the timerange around ' +
						selectedQuery.query.bool.filter[1].range!['@timestamp'] +
						' for ' +
						ip
				);
				return new Array<Close>();
			}

			let closes = [] as Array<Close>;

			for (let i = 0; i < result.length; i++) {
				let close = {} as Close;

				close.timestamp = moment(
					result[i].fields['@timestamp'][0].replace('Z', '')
				).unix();
				close.orgahash = result[i].fields['bintu.orgahash.keyword'];
				close.streamhash = result[i].fields['bintu.streamhash.keyword'];
				close.referrer = result[i].fields['user.referer.keyword'];
				close.bytesSent = result[i].fields['stream.bytes_sent'];
				close.duration = result[i].fields['stream.duration'];

				close.geoip = {} as GeoIp;
				close.geoip.postal_code = result[i].fields['geoip.postal_code'];
				close.geoip.city_name = result[i].fields['geoip.city_name'];
				close.geoip.country = result[i].fields['geoip.country_name'];
				close.geoip.region_name = result[i].fields['geoip.region_name'];
				close.geoip.latitude = result[i].fields['geoip.latitude'];
				close.geoip.longitude = result[i].fields['geoip.longitude'];

				close.agent = {} as Agent;
				close.agent.device = result[i].fields['user.agent.device'];
				close.agent.id = result[i].fields['user.agent.id'];
				close.agent.major = result[i].fields['user.agent.major'];
				close.agent.minor = result[i].fields['user.agent.minor'];
				close.agent.name = result[i].fields['user.agent.name'];
				close.agent.os = result[i].fields['user.agent.os'];
				close.agent.os_full = result[i].fields['user.agent.os_full'];
				close.agent.os_major = result[i].fields['user.agent.os_major'];
				close.agent.os_minor = result[i].fields['user.agent.os_minor'];
				close.agent.os_name = result[i].fields['user.agent.os_name'];
				close.agent.os_version = result[i].fields['user.agent.os_version'];
				close.agent.patch = result[i].fields['user.agent.patch'];
				close.agent.version = result[i].fields['user.agent.version'];
				closes.push(close);
			}
			console.log('Found ' + closes.length + ' CLOSE events for IP: ' + ip);

			return closes;
		})
		.catch((err) => {
			console.log(err);
			return new Array<Close>();
		});
}

async function collectBlocks(ip: string): Promise<Array<Block>> {
	const selectedQuery = queryMapper[QUERRIES.BLOCKINGS];

	selectedQuery.query.bool.filter[0].bool!.should[0].match_phrase.IP =
		validateIP(ip);

	return await client
		.search({
			index: 'streamcloud_logging*',
			body: selectedQuery,
		})
		.then((jsondata: any) => {
			const result = jsondata.body.hits.hits;

			// safety switch
			if (!result) {
				console.log(
					'Something went wrong with BLOCK Query ',
					JSON.stringify(selectedQuery)
				);
				return new Array<Block>();
			} else if (result.length === 0) {
				console.log(
					'No BLOCK found in the timerange around ' +
						selectedQuery.query.bool.filter[1].range!['@timestamp'] +
						' for ' +
						ip
				);
				return new Array<Block>();
			}

			let blockings = [] as Array<Block>;

			for (let i = 0; i < result.length; i++) {
				let block = {} as Block;
				block.timestamp = moment(
					result[i].fields['@timestamp'][0].replace('Z', '')
				).unix();
				block.orgahash = result[i].fields['bintu.orgahash.keyword'];
				block.streamhash = result[i].fields['bintu.streamhash.keyword'];
				block.referrer = result[i].fields['user.referer.keyword'];
				block.geoip = {} as GeoIp;
				block.geoip.postal_code = result[i].fields['geoip.postal_code'];
				block.geoip.city_name = result[i].fields['geoip.city_name'];
				block.geoip.country = result[i].fields['geoip.country_name'];
				block.geoip.region_name = result[i].fields['geoip.region_name'];
				block.geoip.latitude = result[i].fields['geoip.latitude'];
				block.geoip.longitude = result[i].fields['geoip.longitude'];
				blockings.push(block);
			}
			console.log('Found ' + blockings.length + ' BLOCK events for IP: ' + ip);
			// console.log(blockings);

			return blockings;
		})
		.catch((err) => {
			console.log(err);
			return new Array<Block>();
		});
}

async function collectPreBlockBehavior(
	ip: string,
	DB: string,
	COLLECTION: string
) {
	const connects = await collectConnects(ip);
	const plays = await collectPlays(ip);
	const h5liveStats = await collectH5liveStats(ip);
	const closes = await collectCloses(ip);

	let obj = {} as Dto;
	obj.ip = ip;
	obj.connects = connects;
	obj.plays = plays;
	obj.h5liveStats = h5liveStats;
	obj.closes = closes;
	await updateListing(mongoClient, DB, COLLECTION, ip, obj);

	const rtmpStats = await collectRtmpStats(ip, DB, COLLECTION);
	obj = {} as Dto;
	obj.rtmpStats = rtmpStats;

	await updateListing(mongoClient, DB, COLLECTION, ip, obj);

	obj = await findListing(mongoClient, DB, COLLECTION, ip);

	console.log(
		'IP: ' +
			ip +
			' has ' +
			obj.connects.length +
			' CONNECTS, ' +
			obj.rtmpStats.length +
			' RTMPSTATS, ' +
			obj.plays.length +
			' PLAYS, ' +
			obj.h5liveStats.length +
			' H5LIVESTATS, ' +
			obj.closes.length +
			' CLOSES, '
	);
}

async function collectPostBlockBehavior(
	ip: string,
	DB: string,
	COLLECTION: string
) {
	let obj = await findListing(mongoClient, DB, COLLECTION, ip);
	// prettier-ignore
	console.log('Collecting Blocks for IP: ' + ip + ' with ' + obj.blocks.length + ' current Block entries.');
	let newBlocks = await collectBlocks(ip);
	let lastBlocktime: number;
	let lengthBefore = newBlocks.length;
	if (obj!.blocks.length > 0) {
		lastBlocktime = obj!.blocks[obj!.blocks.length - 1].timestamp;
		newBlocks = newBlocks.filter((block) => {
			return block.timestamp >= lastBlocktime;
		});
	}
	let lengthAfter = newBlocks.length;
	console.log(
		'Got ' + (lengthBefore - lengthAfter) + ' overlapping Blocks for IP: ' + ip
	);

	newBlocks.sort(function (a, b) {
		return a.timestamp - b.timestamp;
	});
	obj!.blocks = obj!.blocks.concat(newBlocks);

	await updateListing(mongoClient, DB, COLLECTION, ip, { blocks: obj!.blocks });
	console.log(
		'IP: ' + ip + ' now has ' + obj!.blocks.length + ' related Block entries.'
	);
	return true;
}

async function gatheringMisuse() {
	const DB = process.env.DB;
	const COLLECTION = process.env.MISUSE_COLLECTION;

	console.log('GATHERING MISUSE');

	if (!DB || !COLLECTION) {
		console.log('Could not read DB or COLLECTION variable.');
		return;
	}

	const ips = await collectMisuseIps();
	if (ips.length === 0) console.log("No blocked IP's found yesterday!");
	for (let i = 0; i < ips.length; i++) {
		let dataAlreadyAvailable = await createListing(
			mongoClient,
			DB!,
			COLLECTION!,
			{
				ip: ips[i],
			}
		);

		// collect other data for that IP
		if (dataAlreadyAvailable) {
			console.log('Data available, skipping IP: ' + ips[i]);

			// await collectPostBlockBehavior(ips[i], DB, COLLECTION);
		} else {
			await collectPreBlockBehavior(ips[i], DB, COLLECTION);
			// await collectPostBlockBehavior(ips[i], DB, COLLECTION);
		}
	}
}

async function gatheringRegular() {
	const DB = process.env.DB;
	const COLLECTION = process.env.REGULAR_COLLECTION;

	console.log('GATHERING REGULAR');

	if (!DB || !COLLECTION) {
		console.log('Could not read DB or COLLECTION variable.');
		return;
	}

	const ips = await collectRegularIps();

	for (let i = 0; i < ips.length; i++) {
		let dataAlreadyAvailable = await createListing(
			mongoClient,
			DB,
			COLLECTION,
			{
				ip: ips[i],
			}
		);

		// collect other data for that IP
		if (dataAlreadyAvailable) {
			let obj = await findListing(mongoClient, DB, COLLECTION, ips[i]);

			console.log(
				'IP: ' +
					ips[i] +
					' had ' +
					obj.connects.length +
					' CONNECTS, ' +
					obj.rtmpStats.length +
					' RTMPSTATS, ' +
					obj.plays.length +
					' PLAYS, ' +
					obj.h5liveStats.length +
					' H5LIVESTATS, ' +
					obj.closes.length +
					' CLOSES, '
			);

			// re-analyzing not necessary would overwrite data now
			// await collectPreBlockBehavior(ips[i], DB, COLLECTION);
		} else {
			await collectPreBlockBehavior(ips[i], DB, COLLECTION);
		}
	}
}

async function dbTest() {
	// const DB = process.env.DB;
	// const COLLECTION = process.env.MISUSE_COLLECTION;

	// if (!DB || !COLLECTION) {
	// 	console.log('Could not read DB or COLLECTION variable.');
	// 	return;
	// }

	// await createListing(mongoClient, DB, COLLECTION, { ip: '8.8.8.8' });
	// await createListing(mongoClient, DB, COLLECTION, { ip: '8.8.8.8' });

	// console.log(await findListing(mongoClient, DB, COLLECTION, '8.8.8.8'));

	// await updateListing(mongoClient, DB, COLLECTION, '8.8.8.8', {
	// 	name: 'google',
	// });

	try {
		mongoClient.connect();
		let obj = await findListing(
			mongoClient,
			'dataset1',
			'regular_data',
			'157.38.48.203'
		);
		console.log(obj);
	} catch (e) {
		console.error(e);
	} finally {
		mongoClient.close();
	}
}

async function start() {
	try {
		mongoClient.connect();
		await gatheringMisuse();
		await gatheringRegular();
	} catch (e) {
		console.error(e);
	} finally {
		mongoClient.close();
	}
}

start();
//bTest();

// import { countries } from './src/util/countries';
// let array = new Array();
// let json = new Object();
// let i = 0;

// for (let prop in countries) {
// 	if (Object.prototype.hasOwnProperty.call(countries, prop)) {
// 		array.push(countries[prop].name);
// 		json[countries[prop].name] = i;
// 		i++;
// 	}
// }
// console.log(json);

// const FileSystem = require('fs');
// FileSystem.writeFile('./file.json', JSON.stringify(json), (err) => {
// 	if (err) throw err;
// });

//console.log(array);
//console.log(array.length);
