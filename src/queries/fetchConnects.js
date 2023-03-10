export const connectQuery = {
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
			field: 'createdAt',
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
			field: 'timestamp_client',
			format: 'strict_date_optional_time',
		},
		{
			field: 'webrtc.debug.timestamp',
			format: 'strict_date_optional_time',
		},
	],
	size: 300,
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
					range: {
						'@timestamp': {
							format: 'strict_date_optional_time',
							gte: '',
							lte: '',
						},
					},
				},
				{
					match_phrase: {
						'stream.action.keyword': 'CONNECT',
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
