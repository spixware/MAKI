import { MongoClient } from 'mongodb';
import { Block } from './schemas/dataset1/types/Block';
import { Close } from './schemas/dataset1/types/Close';
import { Connect } from './schemas/dataset1/types/Connect';
import { Dto } from './schemas/dataset1/types/Dto';
import { H5liveStat } from './schemas/dataset1/types/H5liveStat';
import { Play } from './schemas/dataset1/types/Play';
import { RtmpStat } from './schemas/dataset1/types/RtmpStat';

require('dotenv').config();

export const client = new MongoClient('mongodb://localhost:27017');

const COLLECTION = process.env.COLLECTION;
const DB = process.env.DB;

export async function createListing(
	client: MongoClient,
	db: string,
	collection: string,
	newListing
) {
	const listing = await findListing(client, db, collection, newListing.ip);
	if (!listing) {
		newListing.rtmpStats = [] as Array<RtmpStat>;
		newListing.connects = [] as Array<Connect>;
		newListing.plays = [] as Array<Play>;
		newListing.h5liveStats = [] as Array<H5liveStat>;
		newListing.plays = [] as Array<Close>;
		newListing.blocks = [] as Array<Block>;

		const result = await client
			.db(db)
			.collection(collection!)
			.insertOne(newListing);
		console.log(
			`New IP added ${newListing.ip} created with the following id: ${result.insertedId}`
		);
		return false;
	} else {
		console.log(`IP ${newListing.ip} already found in database.`);
		return true;
	}
}

export async function findListing(
	client: MongoClient,
	db: string,
	collection: string,
	ip: string
): Promise<Dto> {
	const listing = await client
		.db(db)
		.collection(collection!)
		.findOne({ ip: ip });
	let result;
	if (listing) {
		result = {} as Dto;
		result.ip = listing.ip;
		result.connects = listing.connects;
		result.rtmpStats = listing.rtmpStats;
		result.plays = listing.plays;
		result.h5liveStats = listing.h5liveStats;
		result.closes = listing.closes;
		result.blocks = listing.blocks;
	}

	return result;
}

export async function updateListing(
	client: MongoClient,
	db: string,
	collection: string,
	ip: string,
	updatedListing
) {
	const result = await client
		.db(db)
		.collection(collection)
		.updateOne({ ip: ip }, { $set: updatedListing });

	console.log(`${result.matchedCount} document(s) matched the query criteria.`);
	console.log(`${result.modifiedCount} document(s) was/were updated.`);
}

async function listDatabases(client: MongoClient) {
	const databasesList = await client.db().admin().listDatabases();

	console.log('Databases:');
	databasesList.databases.forEach((db) => console.log(` - ${db.name}`));
}
