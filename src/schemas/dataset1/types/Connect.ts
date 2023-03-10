import { GeoIp } from './GeoIp';
import { Agent } from './Agent';

export type Connect = {
	timestamp: number;
	orgahash: string;
	streamhash: string;
	duration: number;
	bytes_sent: number;
	referrer: string;
	h5liveTags: string;
	geoip: GeoIp;
	agent: Agent;
};
