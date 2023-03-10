import moment from 'moment';
import { timeRange } from '../QueryMapper';

const now = moment().utc();
export const nowTwoWeeksAgo = now.clone().subtract(13, 'days');
export const startTwoWeeksAgo = nowTwoWeeksAgo.clone().subtract(5, 'minutes');
export const endTwoWeeksAgo = nowTwoWeeksAgo.clone().add(5, 'minutes');

export const regularIpsConnectQuery = {
	track_total_hits: false,
	sort: [
		{
			'@timestamp': {
				order: 'asc',
				unmapped_type: 'boolean',
			},
		},
	],
	fields: [
		{
			field: '*',
			include_unmapped: 'true',
		},
		{
			field: '@timestamp',
			format: 'strict_date_optional_time',
		},
		{
			field: 'blocklist.timestamp',
			format: 'strict_date_optional_time',
		},
		{
			field: 'h5live.token.expires',
			format: 'strict_date_optional_time',
		},
		{
			field: 'read_timestamp',
			format: 'strict_date_optional_time',
		},
		{
			field: 'secureplayback.timestamp',
			format: 'strict_date_optional_time',
		},
		{
			field: 'timestamp',
			format: 'strict_date_optional_time',
		},
		{
			field: 'webrtc.debug.timestamp',
			format: 'strict_date_optional_time',
		},
	],
	size: 10,
	version: true,
	script_fields: {},
	stored_fields: ['*'],
	runtime_mappings: {},
	_source: false,
	query: {
		bool: {
			must: [],
			filter: [
				{
					range: timeRange(startTwoWeeksAgo.unix(), endTwoWeeksAgo.unix()),
				},
				{
					match_phrase: {
						'stream.action.keyword': 'CONNECT',
					},
				},
				{
					match_phrase: {
						'bintu.orgahash.keyword': 'Av7gf',
					},
				},
			],
			should: [],
			must_not: [],
		},
	},
	highlight: {
		pre_tags: ['@kibana-highlighted-field@'],
		post_tags: ['@/kibana-highlighted-field@'],
		fields: {
			'*': {},
		},
		fragment_size: 2147483647,
	},
};

export const regularIpsValidationQuery = {
	track_total_hits: true,
	size: 1,
	version: true,
	script_fields: {},
	stored_fields: ['*'],
	runtime_mappings: {},
	_source: false,
	query: {
		bool: {
			must: [],
			filter: [
				{
					bool: {
						should: [
							{
								match_phrase: {
									IP: '',
								},
							},
						],
						minimum_should_match: 1,
					},
				},
				{
					range: timeRange(startTwoWeeksAgo.unix(), now.unix()),
				},
				{
					match_phrase: {
						'stream.action.keyword': 'block',
					},
				},
			],
			should: [],
			must_not: [],
		},
	},
};
