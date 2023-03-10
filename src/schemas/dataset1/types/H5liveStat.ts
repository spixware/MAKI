import { Agent } from './Agent';
import { GeoIp } from './GeoIp';

export type H5liveStat = {
	timestamp: number;
	orgahash: string;
	streamhash: string;
	referrer: string;
	options: number;
	group: string;
	playerId: number;
	session: number;
	version: string;
	durationRelative: number;
	durationTotal: number;
	startTime: number;
	h5liveTags: string;
	bitsPerSecSent: number;
	bytesSentRelative: number;
	dropTime: number;
	dropRatio: number;
	tokenValue: string;
	tokenExpires: number;
	geoip: GeoIp;
	agent: Agent;
};
