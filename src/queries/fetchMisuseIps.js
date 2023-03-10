export const blockedIpsQuery = {
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
						'stream.action.keyword': 'block',
					},
				},
			],
			should: [],
			must_not: [],
		},
	},
	aggs: {
		uniqueIps: {
			terms: {
				field: 'geoip.ip',
			},
		},
	},
};
