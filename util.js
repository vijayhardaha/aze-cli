import {
	existsSync,
	mkdirSync,
	createWriteStream,
	createReadStream,
	copyFile,
} from "fs";
import { promises } from "fs";
import { join, extname, resolve } from "path";
import neatCsv from "neat-csv";
import latinize from "latinize";
import archiver from "archiver-promise";
import { createObjectCsvWriter as createCsvWriter } from "csv-writer";
import date from "date-and-time";
import junk from "junk";

const { readdir, stat, readFile, mkdir } = promises;
const __dirname = resolve();
const filesDir = join(__dirname, "files");

const modifyName = (name, artists, sku, slugify = false) => {
	if (isImage(name)) {
		return name;
	}

	const ext = extname(name);
	let args = latinize(
		[artists, name.replace(ext, ""), sku]
			.filter((n) => n.trim() !== "")
			.join(" - ")
	);
	args = slugify ? args.replace(/[^a-zA-Z0-9-]/g, "-") : args;
	return [args, ext].join("");
};

export const delay = (ms = 0.2) =>
	new Promise((resolve) => setTimeout(resolve, ms * 1000));

export const findDuplicates = (arr) => {
	let seen = new Set();
	let store = new Array();
	arr.filter(
		(item) =>
			seen.size === seen.add(item).size &&
			!store.includes(item) &&
			store.push(item)
	);
	return store;
};

export const findInvalidPaths = (arr) => {
	return arr.filter(
		(a) => a.split("_").length > 2 || !a.match(/^[a-zA-Z0-9-_]+$/)
	);
};

export const isInvalidDir = () => {
	if (existsSync(filesDir)) {
		const files = readdir(filesDir);
		return files.length === 0;
	}
	return true;
};

export const csvRows = async () => {
	const data = await readFile("./products.csv");
	let rows = await neatCsv(data);
	return rows
		.filter((row) => row.hasOwnProperty("sku") && row.sku.trim() !== "")
		.map((row) => {
			row.artists =
				row.hasOwnProperty("artists") && row.artists.trim() !== ""
					? row.artists
							.split("|")
							.map((a) => a.trim())
							.join(" and ")
					: "";
			return row;
		});
};

export const skuDirs = async () => {
	let files = await readdir(filesDir);
	files = files.filter(junk.not).map((file) => {
		return { name: file, path: join(filesDir, file) };
	});

	let results = [];
	for (const file of files) {
		const st = await stat(file.path);
		if (st.isDirectory()) {
			results.push(file);
		}
	}
	return results;
};

export const getFiles = async (dir, csvData) => {
	let files = await readdir(dir.path);
	files = files
		.filter(junk.not)
		.filter((file) => isAudio(file) || isImage(file))
		.map((file) => {
			let num = false;
			const sku = dir.name;
			if (isAudio(file)) {
				num = file.split(" ");
				num = num[0];
				num = isNaN(num) ? false : parseInt(num);
			}

			const track_sku = num ? `${sku}_${num}` : sku;
			const artists =
				isAudio(file) && csvData.hasOwnProperty(track_sku)
					? csvData[track_sku]
					: csvData.hasOwnProperty(sku)
					? csvData[sku]
					: "";
			return {
				name: file,
				path: join(dir.path, file),
				ext: extname(file),
				num: num,
				sku: dir.name,
				track_sku: track_sku,
				artists: artists,
				modified_name: modifyName(file, artists, dir.name),
				slugifed_name: modifyName(file, artists, dir.name, true),
			};
		});
	return files;
};

export const formatCSV = (rows) =>
	rows.reduce((obj, item) => {
		return {
			...obj,
			[item["sku"]]: latinize(item.artists),
		};
	}, {});

export const isAudio = (file) => [".wav", ".mp3"].includes(extname(file));

export const isImage = (file) =>
	[".jpg", ".jpeg", ".png"].includes(extname(file));

export const currentTime = () =>
	date.format(new Date(), "YYYY-MM-DD-hh-mm-ss-SSS");

export const generateDataDirName = () =>
	["files-data", currentTime()].join("-");

export const createDataDir = async (dirName) => {
	const dataDir = join(__dirname, dirName);

	await mkdir(join(__dirname, dirName)).catch(console.error);
	await mkdir(join(__dirname, dirName, "EP")).catch(console.error);
	await mkdir(join(__dirname, dirName, "wav")).catch(console.error);
	return dataDir;
};

export const moveFiles = (dest, file) => {
	const newDir = join(dest, "wav", file.sku);

	if (!existsSync(newDir)) {
		mkdirSync(newDir);
	}

	const filePath = isAudio(file.name)
		? join(newDir, file.slugifed_name)
		: join(newDir, file.name);

	copyFile(file.path, filePath, (err) => {
		if (err) throw err;
	});

	return file;
};

export const createZip = async (dest, sku, files) => {
	const newDir = join(dest, "EP", `${sku}.zip`);
	const output = createWriteStream(newDir);
	const archive = archiver("zip");

	archive.on("error", function (err) {
		throw err;
	});

	archive.pipe(output);

	for (let file of files) {
		const fileName = isAudio(file.name) ? file.modified_name : file.name;
		archive.append(createReadStream(file.path), { name: fileName });
	}
	await archive.finalize();
};

export const createCSV = async (rows, collection, dataDirName) => {
	const fileName = `products-${currentTime()}.csv`;

	const csvWriter = createCsvWriter({
		path: join(__dirname, dataDirName, fileName),
		header: [
			{ id: "title", title: "title" },
			{ id: "sku", title: "sku" },
			{ id: "slug", title: "slug" },
			{ id: "sku_ep", title: "sku_ep" },
			{ id: "type", title: "type" },
			{ id: "short_description", title: "short_description" },
			{ id: "price", title: "price" },
			{ id: "product_categories", title: "product_categories" },
			{ id: "product_tags", title: "product_tags" },
			{ id: "artists", title: "artists" },
			{ id: "labels", title: "labels" },
			{ id: "genres", title: "genres" },
			{ id: "years", title: "years" },
			{ id: "owners", title: "owners" },
			{ id: "product_visibility", title: "product_visibility" },
			{ id: "featured_image", title: "featured_image" },
			{ id: "download_file_paths", title: "download_file_paths" },
			{ id: "download_file_names", title: "download_file_names" },
			{ id: "playlist_data", title: "playlist_data" },
		],
	});

	let records = [];

	for (let row of rows) {
		let data = {
			title: row.hasOwnProperty("title") ? latinize(row.title) : "",
			sku: row.hasOwnProperty("sku") ? row.sku : "",
			short_description: row.hasOwnProperty("short_description")
				? latinize(row.short_description)
				: "",
			playlist_data: row.hasOwnProperty("playlist_data")
				? row.playlist_data
				: "",
			price: row.hasOwnProperty("price") ? row.price : "",
			featured_image: row.hasOwnProperty("featured_image")
				? row.featured_image
				: "",
			artists: row.hasOwnProperty("artists") ? latinize(row.artists) : "",
			labels: row.hasOwnProperty("labels") ? latinize(row.labels) : "",
			genres: row.hasOwnProperty("genres") ? latinize(row.genres) : "",
			years: row.hasOwnProperty("years") ? row.years : "",
			owners: row.hasOwnProperty("owners") ? latinize(row.owners) : "",
			product_categories: row.hasOwnProperty("product_categories")
				? row.product_categories
				: "",
			product_tags: row.hasOwnProperty("product_tags") ? row.product_tags : "",
			download_file_paths: row.hasOwnProperty("download_file_paths")
				? row.download_file_paths
				: "",
			download_file_names: row.hasOwnProperty("download_file_names")
				? row.download_file_names
				: "",
			slug: row.hasOwnProperty("slug") ? row.slug : "",
			sku_ep: row.hasOwnProperty("sku_ep") ? row.sku_ep : "",
			type: row.hasOwnProperty("type") ? row.type : "",
			product_visibility: row.hasOwnProperty("product_visibility")
				? row.product_visibility
				: "",
		};

		const sku = row.sku;
		let skuArr = sku.split("_");
		const isTrack = skuArr[skuArr.length - 1].length > 1 ? false : true;
		skuArr =
			skuArr.length > 1
				? skuArr.filter((s, i) => i != skuArr.length - 1)
				: skuArr;
		const epSKU = skuArr.join("_");
		let files = collection.hasOwnProperty(epSKU) ? collection[epSKU] : false;
		const baseUrl = `https://www.files.aze.digital`;
		if (isTrack) {
			if (files !== false && files.length) {
				files = files.filter((file) => isAudio(file.name));
				const file = files.find((file) => file.track_sku === sku);
				if (typeof file !== "undefined") {
					data.download_file_paths = `${baseUrl}/wav/${epSKU}/${file.slugifed_name}`;
					data.download_file_names = `${file.modified_name}`;
				}
			}
		} else {
			data.download_file_paths = `${baseUrl}/EP/${epSKU}.zip`;
			data.download_file_names = `${epSKU}.zip`;
		}
		records.push(data);
	}

	await csvWriter.writeRecords(records);
	return fileName;
};
