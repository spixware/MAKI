import { GeoIp } from './GeoIp';

export type Block = {
	timestamp: number;
	referrer: string;
	orgahash: string;
	streamhash: string;
	provider?: string; // only available after ip analysis
	subnet?: string; // only available after ip analysis
	geoip: GeoIp;
};
