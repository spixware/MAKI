import { Block } from './Block';
import { Close } from './Close';
import { Connect } from './Connect';
import { H5liveStat } from './H5liveStat';
import { Play } from './Play';
import { RtmpStat } from './RtmpStat';

export type Dto = {
	ip: string;
	rtmpStats: Array<RtmpStat>;
	connects: Array<Connect>;
	plays: Array<Play>;
	h5liveStats: Array<H5liveStat>;
	closes: Array<Close>;
	blocks: Array<Block>;
};
