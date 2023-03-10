import moment from 'moment';
import { blockedIpsQuery } from './queries/fetchMisuseIps';
import { rtmpQuery } from './queries/fetchRtmpstats';
import { connectQuery } from './queries/fetchConnects';
import { playQuery } from './queries/fetchPlays';
import { h5liveQuery } from './queries/fetchH5livestats';
import { closeQuery } from './queries/fetchCloses';
import { blockQuery } from './queries/fetchBlocks';

export enum QUERRIES {
	BLOCKS = 'BLOCKINGS',
	BLOCKINGS = 'BLOCKINGS',
	BLOCKED_IPS = 'BLOCKED_IPS',
	IPS = 'REGULAR_IPS',
	RTMPSTATS = 'RTMP',
	CONNECTS = 'CONNECTS',
	PLAYS = 'PLAYS',
	H5LIVESTATS = 'H5LIVE',
	CLOSES = 'CLOSES',
}

const queryMapper = {
	[QUERRIES.BLOCKED_IPS]: buildBlockedIPSQuery(),
	[QUERRIES.RTMPSTATS]: (streamname: string, timestamp: number) =>
		buildRtmpStatQuery(streamname, timestamp),
	[QUERRIES.CONNECTS]: buildConnectQuery(),
	[QUERRIES.PLAYS]: buildPlayQuery(),
	[QUERRIES.H5LIVESTATS]: buildH5liveStatQuery(),
	[QUERRIES.CLOSES]: buildCloseSQuery(),
	[QUERRIES.BLOCKS]: buildBlockQuery(),
};

function buildBlockedIPSQuery() {
	let request = blockedIpsQuery;

	const now = moment.utc();
	const startOfYesterday = now.clone().subtract(1, 'day').startOf('day');
	const endOfYesterday = startOfYesterday.clone().endOf('day');

	request.query.bool.filter[0].range = timeRange(
		startOfYesterday.unix(),
		endOfYesterday.unix()
	);

	return request;
}

function buildRtmpStatQuery(streamname: string, timestamp: number) {
	let request = rtmpQuery;
	// prettier-ignore
	request.query.bool.filter[0].bool!.should[0].match_phrase['bintu.streamname.keyword'] = streamname;

	let timeOfConnect = moment.unix(timestamp);
	let preTimeOfConnect = timeOfConnect.clone().subtract(5, 'minutes');
	let postTimeOfConnect = timeOfConnect.clone().add(5, 'minutes');

	request.query.bool.filter[1].range = timeRange(
		preTimeOfConnect.unix(),
		postTimeOfConnect.unix()
	);

	// console.log(
	// 	'PreTime at ' + preTimeOfConnect.format('YYYY-MM-DD HH:mm:ss:SSS')
	// );
	// console.log(
	// 	'PostTime at ' + postTimeOfConnect.format('YYYY-MM-DD HH:mm:ss:SSS')
	// );

	return request;
}

function buildConnectQuery() {
	let request = connectQuery;

	const now = moment.utc();
	const startOfYesterday = now.clone().subtract(1, 'day').startOf('day');
	const endOfYesterday = startOfYesterday.clone().endOf('day');
	const oneWeekAgo = startOfYesterday.clone().subtract(7, 'days');

	request.query.bool.filter[1].range = timeRange(
		oneWeekAgo.unix(),
		endOfYesterday.unix()
	);

	return request;
}

function buildPlayQuery() {
	let request = playQuery;

	const now = moment.utc();
	const startOfYesterday = now.clone().subtract(1, 'day').startOf('day');
	const endOfYesterday = startOfYesterday.clone().endOf('day');
	const oneWeekAgo = startOfYesterday.clone().subtract(7, 'days');

	request.query.bool.filter[1].range = timeRange(
		oneWeekAgo.unix(),
		endOfYesterday.unix()
	);

	return request;
}

function buildH5liveStatQuery() {
	let request = h5liveQuery;

	const now = moment.utc();
	const startOfYesterday = now.clone().subtract(1, 'day').startOf('day');
	const endOfYesterday = startOfYesterday.clone().endOf('day');
	const oneWeekAgo = startOfYesterday.clone().subtract(7, 'days');

	request.query.bool.filter[1].range = timeRange(
		oneWeekAgo.unix(),
		endOfYesterday.unix()
	);

	return request;
}

function buildCloseSQuery() {
	let request = closeQuery;

	const now = moment.utc();
	const startOfYesterday = now.clone().subtract(1, 'day').startOf('day');
	const endOfYesterday = startOfYesterday.clone().endOf('day');
	const oneWeekAgo = startOfYesterday.clone().subtract(7, 'days');

	request.query.bool.filter[1].range = timeRange(
		oneWeekAgo.unix(),
		endOfYesterday.unix()
	);

	return request;
}

function buildBlockQuery() {
	let request = blockQuery;
	const now = moment.utc();
	const startOfYesterday = now.clone().subtract(1, 'day').startOf('day');
	const endOfYesterday = startOfYesterday.clone().endOf('day');
	const oneWeekAgo = startOfYesterday.clone().subtract(7, 'days');

	request.query.bool.filter[1].range = timeRange(
		oneWeekAgo.unix(),
		endOfYesterday.unix()
	);

	return request;
}

export function timeRange(from: number, to: number) {
	// prettier-ignore
	const gte = typeof from === 'number' ? moment.unix(from).format('YYYY-MM-DD[T]HH:mm:ss.SSS[Z]') : from;
	// prettier-ignore
	const lte = typeof to === 'number' ? moment.unix(to).format('YYYY-MM-DD[T]HH:mm:ss.SSS[Z]') : to;

	const rangeFilter = {
		'@timestamp': {
			format: 'strict_date_optional_time',
			gte: gte,
			lte: lte,
		},
	};

	return rangeFilter;
}

export default queryMapper;
