#!/usr/bin/env node

import { existsSync, writeFile } from "fs";
import ora from "ora";
import chalk from "chalk";
import process from "process";

const spinner = ora({
	text: "",
});

import {
	createCSV,
	createDataDir,
	delay,
	findDuplicates,
	formatCSV,
	generateDataDirName,
	skuDirs,
	csvRows,
	getFiles,
	isInvalidDir,
	findInvalidPaths,
	createZip,
	moveFiles,
} from "./util.js";

import chardet from "chardet";

const { detectFileSync } = chardet;

process.on("SIGINT", () => {
	spinner.fail("Terminating...");
	process.exit(1);
});

(async () => {
	try {
		spinner.succeed(`Start build`);
		await delay();

		spinner.info(`Looking for directory...`);
		await delay();
		// Check if files directory exists and not empty
		if (isInvalidDir()) {
			spinner.fail(
				`Fail - ${chalk.red.bold("files")}  doesn't exist or empty.`
			);
			return;
		}
		spinner.succeed("Success!");

		spinner.info("Looking for CSV file...");
		await delay();
		// Check if products.csv exists.
		if (!existsSync("./products.csv")) {
			spinner.fail(`Fail - products.csv not available.`);
			return;
		}
		spinner.succeed("Success!");

		spinner.info(`Checking charset...`);
		await delay();
		if ("UTF-8" !== detectFileSync("./products.csv")) {
			spinner.fail("Fail - Non UTF-8 charset.");
			return;
		}
		spinner.succeed("Success!");

		/****************************
		 * CSV READ PROCESS START
		 ***************************/
		spinner.info("Reading csv file...");
		await delay();

		// Fetch CSV rows.
		const rows = await csvRows();

		if (rows.length > 0) {
			const invalidSkus = findInvalidPaths(rows.map((row) => row.sku));
			if (invalidSkus.length) {
				spinner.fail(`Fail - Invalid skus`);
				console.table(invalidSkus);
				return;
			}

			const duplicates = findDuplicates(rows.map((row) => row.sku));
			if (duplicates.length) {
				spinner.fail(`Fail - Duplicates skus`);
				console.table(duplicates);
				return;
			}
		} else {
			spinner.fail("Fail - Empty csv file.");
			return;
		}

		const csvData = formatCSV(rows);
		// Get data size
		const size = Object.keys(csvData).length;
		// Check for empty CSV
		if (size > 0) {
			spinner.succeed(`Success - ${size} records found.`);
		}

		/************************************
		 * DIRECTORY SCAN PROCESS START
		 ***********************************/
		spinner.info(`Scanning files directory...`);
		await delay();
		const dirs = await skuDirs();
		if (dirs.length > 0) {
			const invalidDirs = findInvalidPaths(dirs.map((dir) => dir.name));
			if (invalidDirs.length) {
				spinner.fail("Fail - Invalid directory names.");
				console.table(invalidDirs);
				return;
			}
			spinner.succeed(`Success - ${dirs.length} directories found.`);
		} else {
			spinner.fail("Fail - sku directories not available.");
			return;
		}
		return;
		/**************************
		 * MAP ALL DIRECTORIES DATA
		 *************************/
		spinner.info(`Scanning all directories...`);
		await delay();
		let collection = {};
		for (let dir of dirs) {
			const dirFiles = await getFiles(dir, csvData);
			if (dirFiles.length) {
				collection[dir.name] = dirFiles;
				spinner.succeed(
					`Success - ${dir.name} direcory, ${dirFiles.length} files found.`
				);
			} else {
				spinner.warn(`Warn - ${dir.name} is empty.`);
			}
		}

		if (Object.keys(collection).length) {
			spinner.succeed(
				`Success - ${Object.keys(collection).length} directories listed.`
			);
		} else {
			spinner.fail(`Fail - All directories are empty.`);
			return;
		}

		spinner.info(`Creating new data directory...`);
		await delay();
		const dataDirName = generateDataDirName();
		const dataDir = await createDataDir(dataDirName);
		spinner.succeed(`Success!`);

		for (const dir in collection) {
			const files = collection[dir];
			for (let file of files) {
				spinner.info(`Processing [${file.name}]...`);
				await moveFiles(dataDir, file);
				spinner.succeed(`Created: "${file.sku}/${file.slugifed_name}"`);
			}
			spinner.info(`Ziping [${dir}] directory...`);
			await createZip(dataDir, dir, files);
			spinner.succeed(`Success - [${dir}/${dir}.zip] created.`);
		}

		spinner.info(`Creating new csv...`);
		await delay();
		const csvFilename = await createCSV(rows, collection, dataDirName);
		spinner.succeed(`Success - [${csvFilename}] created.`);

		spinner.start(`Finishing...`);
		await delay();
		spinner.succeed("Build finished.");
	} catch (e) {
		spinner.fail(`Error: ${e.message}`);
		console.log();
	}
})();
