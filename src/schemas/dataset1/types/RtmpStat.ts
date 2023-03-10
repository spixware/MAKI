import { GeoIp } from './GeoIp';

export type RtmpStat = {
	timestamp: number;
	orgahash: string;
	streamhash: string;
	videoCodec: string;
	audioCodec: string;
	framerate: number;
	videoWidth: number;
	videoHeight: number;
	clients: number;
	tid: number;
	duration: number;
	timeRatio: number;
	videoBytes: number;
	audioBytes: number;
	uniqueIPs?: number; // not implemented yet
	geoip: GeoIp;
};
