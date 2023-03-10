import { Agent } from './Agent';
import { GeoIp } from './GeoIp';

export type Play = {
	timestamp: number;
	orgahash: string;
	streamhash: string;
	referrer: string;
	duration: number;
	bytesSent: number;
	bytesReceived: number;
	h5liveTags: string;
	geoip: GeoIp;
	agent: Agent;
};
