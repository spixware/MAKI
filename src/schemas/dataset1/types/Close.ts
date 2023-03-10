import { Agent } from './Agent';
import { GeoIp } from './GeoIp';

export type Close = {
	timestamp: number;
	orgahash: string;
	streamhash: string;
	referrer: string;
	duration: number;
	bytesSent: number;
	geoip: GeoIp;
	agent: Agent;
};
