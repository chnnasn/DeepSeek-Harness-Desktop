import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import * as yaml from "js-yaml";
import { Context, Service } from "@deepseek-ai/cordis";
import Loader, { EntryGroup, EntryTree, isJsExpr } from "@deepseek-ai/cordis-plugin-loader";
import { access, constants, readFile, rename, writeFile } from "node:fs/promises";
import { setTimeout as setTimeout$1 } from "node:timers/promises";
import Group from "@deepseek-ai/cordis-plugin-group";
import { dshHomePath, resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { createLaunchEnvironmentSnapshot } from "@deepseek-ai/dsh-launch-environment";
//#region ../../../vendor/include/src/index.ts
const JsExpr = new yaml.Type("tag:yaml.org,2002:js", {
	kind: "scalar",
	resolve: (data) => typeof data === "string",
	construct: (data) => ({ __jsExpr: data }),
	predicate: isJsExpr,
	represent: (data) => data["__jsExpr"]
});
/**
* The entry-list YAML dialect: `!!js` scalars round-trip as expression nodes
* the Loader evaluates at entry activation. Exported so config tooling
* (`dsh --dump-config`) parses and prints exactly the dialect this include
* mounts.
*/
const entryListSchema = yaml.JSON_SCHEMA.extend(JsExpr);
const schema = entryListSchema;
const writable = {
	".json": "application/json",
	".yaml": "application/yaml",
	".yml": "application/yaml"
};
const supported = new Set(Object.keys(writable));
const WRITE_RETRY_LIMIT = 10;
const WRITE_RETRY_DELAY_MS = 50;
function retryableWriteError(error) {
	const code = error?.code;
	return code === "EACCES" || code === "EBUSY" || code === "EPERM";
}
/**
* Apply patch lists to an entry list — THE patch semantics of this include,
* shared by mounting (`applyPatches`) and offline config tooling
* (`dsh --dump-config`) so a dump can never drift from what boots. The input
* is never mutated and the result is always detached from it (even with no
* patches): patching or mounting shared entry objects would bake earlier
* values into the cached parse, so repeated application (config hot-reloads)
* could never revert a removed or changed patch. Inserted entries are indexed
* as they are added, so a later patch in the same list can target a row an
* earlier patch inserted. A patch that matches nothing warns and is skipped.
* @param data - the parsed entry list (JSON-safe plain data).
* @param patches - the patch list to apply, in order.
* @param warn - sink for skipped-patch diagnostics (printf-style, `%C` = code).
* @returns a detached entry list with every applicable patch applied.
*/
function applyEntryPatches(data, patches, warn) {
	data = structuredClone(data);
	if (!patches?.length) return data;
	const entryMap = /* @__PURE__ */ new Map();
	const buildMap = (entries) => {
		for (const entry of entries) {
			if (entry.id) entryMap.set(entry.id, entry);
			if (entry.group && Array.isArray(entry.config)) buildMap(entry.config);
		}
	};
	buildMap(data);
	for (const patch of patches) {
		const { id, insert, name, ...overrides } = patch;
		if (insert) {
			if (id) {
				const target = entryMap.get(id);
				if (!target) {
					warn("patch insert: entry %C not found", id);
					continue;
				}
				if (!target.group) {
					warn("patch insert: entry %C is not a group", id);
					continue;
				}
				if (!Array.isArray(target.config)) target.config = [];
				target.config.push(...insert);
			} else data.push(...insert);
			buildMap(insert);
			continue;
		}
		if (!id) {
			warn("patch: id is required for non-insert patches");
			continue;
		}
		const target = entryMap.get(id);
		if (!target) {
			warn("patch: entry %C not found", id);
			continue;
		}
		if (name && name !== target.name) {
			warn("patch: name mismatch for %C (expected %C, got %C), skipping", id, target.name, name);
			continue;
		}
		for (const [key, value] of Object.entries(overrides)) {
			if (key === "id") continue;
			target[key] = value;
		}
	}
	return data;
}
var ConfigFileError = class extends Error {
	stage;
	constructor(stage, path, cause) {
		super(`failed to ${stage} config file ${path}`, { cause });
		this.stage = stage;
		this.name = "ConfigFileError";
	}
};
/** Loader entry tree backed by a YAML or JSON file. */
var Include = class extends EntryTree {
	config;
	static inject = ["loader"];
	static [EntryGroup.key] = true;
	filename;
	type;
	readonly;
	content;
	data;
	writeTask;
	pendingWrite;
	writeQueue = Promise.resolve();
	applyQueue = Promise.resolve();
	constructor(ctx, config) {
		super(ctx);
		this.config = config;
		this.enableLogs = config.enableLogs ?? ctx.fiber.entry?.parent.tree.enableLogs ?? false;
		this.filename = fileURLToPath(new URL(this.config.path, this.ctx.baseUrl));
		const ext = extname(this.filename);
		if (!supported.has(ext)) throw new Error(`extension "${ext}" not supported`);
		this.type = writable[ext];
		this.readonly = !this.type;
		this.ctx.baseUrl = new URL(".", pathToFileURL(this.filename)).href;
		ctx.on("internal/update", async (config, _, next) => {
			if (config.path !== this.config.path) return next();
			await this.enqueue(async () => {
				const data = this.applyPatches(this.data, config.patches);
				await this.root.update(data);
				this.config = config;
			});
		});
	}
	/**
	* Serialize one child-tree mutation behind every earlier one. The group's
	* transactional `update` is not reentrant: two concurrent applies (the init
	* apply racing an HMR-triggered refresh from the watcher's initial scan)
	* interleave create and rollback on the same entries and strand the include
	* fiber without settling, so every apply path funnels through this queue.
	* A predecessor's failure is its own caller's outcome and never gates the
	* next task.
	*/
	enqueue(task) {
		const run = this.applyQueue.then(task, task);
		this.applyQueue = run.then(() => {}, () => {});
		return run;
	}
	async checkAccess() {
		if (!this.type) return;
		try {
			await access(this.filename, constants.W_OK);
		} catch {
			this.readonly = true;
		}
	}
	async read(forced = false) {
		let content;
		try {
			content = await readFile(this.filename, "utf8");
		} catch (error) {
			throw new ConfigFileError("read", this.filename, error);
		}
		if (!forced && this.content === content) return;
		let data;
		try {
			if (this.type === "application/yaml") data = yaml.load(content, { schema });
			else if (this.type === "application/json") data = JSON.parse(content);
			else {
				const module = await import(
					/* @vite-ignore */
					this.filename
);
				data = module.default || module;
			}
		} catch (error) {
			throw new ConfigFileError("parse", this.filename, error);
		}
		if (!Array.isArray(data)) throw new ConfigFileError("validate", this.filename, /* @__PURE__ */ new TypeError("config file must be a top-level array"));
		return {
			content,
			data
		};
	}
	applyPatches(data, patches) {
		return applyEntryPatches(data, patches, (message, ...args) => {
			this.ctx.root.logger?.("loader").warn(message, ...args);
		});
	}
	async *[Service.init]() {
		let candidate;
		try {
			candidate = await this.read(true);
		} catch (error) {
			if (!(error instanceof ConfigFileError) || error.stage !== "read" || error.cause?.code !== "ENOENT") throw error;
			if (this.config.initial) {
				await this._writeFile(this.config.initial);
				candidate = await this.read(true);
			} else throw new Error(`config file not found: ${this.filename}`);
		}
		yield () => this.stop();
		await this.apply(candidate);
	}
	async stop() {
		await this.root.stop();
		await this.flushWrite();
	}
	/**
	* Re-read the file and transactionally refresh child entries when content changed.
	* @returns a promise resolving after the new tree commits, or immediately when unchanged.
	* @throws when reading, parsing, validation, application, or rollback fails; the last good tree remains active when rollback succeeds.
	*/
	async refresh() {
		await this.enqueue(async () => {
			const candidate = await this.read();
			if (!candidate) return;
			await this._apply(candidate);
		});
	}
	apply(candidate) {
		return this.enqueue(() => this._apply(candidate));
	}
	async _apply(candidate) {
		const data = this.applyPatches(candidate.data, this.config.patches);
		await this.root.update(data);
		this.content = candidate.content;
		this.data = candidate.data;
		await this.checkAccess();
	}
	async _writeFile(config) {
		if (this.readonly) throw new Error(`cannot overwrite readonly config`);
		if (this.type === "application/yaml") this.content = yaml.dump(config, { schema });
		else if (this.type === "application/json") this.content = JSON.stringify(config, null, 2);
		await writeFile(this.filename + ".tmp", this.content);
		for (let retry = 0;; retry++) try {
			await rename(this.filename + ".tmp", this.filename);
			return;
		} catch (error) {
			if (!retryableWriteError(error) || retry >= WRITE_RETRY_LIMIT) throw error;
			await setTimeout$1((retry + 1) * WRITE_RETRY_DELAY_MS);
		}
	}
	writeFile(config) {
		clearTimeout(this.writeTask);
		this.pendingWrite = config;
		this.writeTask = setTimeout(() => {
			this.flushWrite();
		}, 0);
	}
	flushWrite() {
		clearTimeout(this.writeTask);
		this.writeTask = void 0;
		const config = this.pendingWrite;
		this.pendingWrite = void 0;
		if (config === void 0) return this.writeQueue;
		const run = this.writeQueue.then(() => this._writeFile(config), () => this._writeFile(config));
		this.writeQueue = run;
		run.catch((error) => {
			this.ctx.root.logger?.("loader").warn("failed to write config file %C", this.filename);
			this.ctx.root.logger?.("loader").warn(error);
		});
		return run;
	}
	/** Schedule a write of the current root entry data. */
	write() {
		this.context.emit("loader/config-update");
		return this.writeFile(this.root.data);
	}
};
//#endregion
//#region lib/types/profile.js
/**
* Profile discovery, initialization, and patch-layer composition for the
* `dsh --profile` launcher family.
*
* A profile is a directory under `$DSH_HOME/profiles/<name>` holding a
* `package.json` (out-of-tree plugin dependencies plus the profile manifest
* `dsh.profile` with its ordered `bundles` list) and a `cordis.patch.yml`
* (the user's own patch layer, applied after every bundle layer). Bundles are
* npm packages whose manifest declares
* `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`; the tree is
* composed by applying each bundle's patch list in `dsh.profile.bundles` order over
* an empty entry list, then the profile's own patches, then any launcher
* layers (`--patch` files and flag-derived patches).
*
* Module resolution is two-anchor by construction: a bundle name resolves
* first from the dsh installation (the launcher's own package), then from the
* profile directory. The Loader's `baseUrl` is the profile directory, whose
* `node_modules` pnpm manages for out-of-tree plugins, while the maintained
* flat fallback directory `$DSH_HOME/profiles/node_modules` (one symlink per
* package the installation's app and bundles depend on) makes every in-box
* plugin Node-resolvable from any profile through the ordinary parent-walk.
* @module @deepseek-ai/dsh-app-boot/profile
*/
/** Directory under the Harness home holding every profile. */
const PROFILES_DIR = "profiles";
/** The user patch layer inside a profile directory (hot-reloaded on long-lived surfaces). */
const PROFILE_PATCH_FILENAME = "cordis.patch.yml";
/**
* Resolve a profile's directory under the Harness home.
* @param name - the profile name (`dsh --profile <name>`).
* @param home - the Harness home; defaults to {@link resolveDshHome}.
* @returns the absolute profile directory (which may not exist yet).
*/
function resolveProfileDir(name, home = resolveDshHome()) {
	if (name === "" || name.includes("/") || name.includes("\\") || name === "." || name === ".." || name === "node_modules") throw new Error(`dsh: invalid profile name ${JSON.stringify(name)}`);
	return join(home, PROFILES_DIR, name);
}
/** The shipped profile templates auto-initialized on first use, by name. */
const PROFILE_TEMPLATES = {
	web: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@linxin666/dsh-web-ui-all"],
	headless: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless"]
};
/** Installation-owned bundle tuples normalized to the shipped template. */
const INSTALLATION_OWNED_PROFILE_TUPLES = { headless: [
	"@deepseek-ai/dsh-base",
	"@deepseek-ai/dsh-web-app",
	"@deepseek-ai/dsh-headless"
] };
/** The bundle list a `dsh plugin` init uses for a name with no shipped template. */
const DEFAULT_PROFILE_BUNDLES = ["@deepseek-ai/dsh-base"];
const PROFILE_PATCH_TEMPLATE = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
[]
`;
const PROFILE_PNPM_WORKSPACE = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
`;
/**
* Initialize a profile directory: manifest, empty user patch layer, and the
* pnpm settings out-of-tree plugins need. Existing files are never touched,
* so re-running is a no-op on an initialized profile.
* @param dir - the profile directory from {@link resolveProfileDir}.
* @param bundles - the initial `dsh.profile.bundles` layer list.
*/
function initProfile(dir, bundles) {
	mkdirSync(dir, { recursive: true });
	const manifestPath = join(dir, "package.json");
	if (!existsSync(manifestPath)) {
		const manifest = {
			name: `dsh-profile-${basename(dir)}`,
			private: true,
			dependencies: {},
			dsh: { profile: { bundles: [...bundles] } }
		};
		writeFileSync(manifestPath, JSON.stringify(manifest, void 0, 2) + "\n");
	}
	const patchPath = join(dir, PROFILE_PATCH_FILENAME);
	if (!existsSync(patchPath)) writeFileSync(patchPath, PROFILE_PATCH_TEMPLATE);
	const workspacePath = join(dir, "pnpm-workspace.yaml");
	if (!existsSync(workspacePath)) writeFileSync(workspacePath, PROFILE_PNPM_WORKSPACE);
}
/** Ensure `link` is a symlink to `target`, replacing a wrong or dangling link; a real directory throws. */
function ensureSymlink(link, target) {
	let stat;
	try {
		stat = lstatSync(link);
	} catch {
		stat = void 0;
	}
	if (stat !== void 0) {
		if (!stat.isSymbolicLink()) throw new Error(`dsh: ${link} exists and is not a symlink; remove it so dsh can manage the installation fallback`);
		if (readlinkSync(link) === target) return;
		unlinkSync(link);
	}
	try {
		symlinkSync(target, link, "junction");
	} catch (error) {
		/* v8 ignore next 4 */
		if (error.code !== "EEXIST" || !lstatSync(link).isSymbolicLink() || readlinkSync(link) !== target) throw error;
	}
}
/**
* Maintain the flat module fallback `$DSH_HOME/profiles/node_modules`: one
* symlink per package in the dsh app's resolvable dependency CLOSURE (BFS
* over `dependencies` from the app manifest), each resolved from its own
* real location. Node's parent-directory walk from any profile finds this
* directory after the profile's own `node_modules`, so every in-box plugin
* resolves without pnpm ever managing it — the exact "bundles come from the
* installation" contract. The closure (not just direct dependencies) is
* required for out-of-tree plugins: their peer dependencies name Service
* Definition packages (`dsh-compaction`, `dsh-invariants`, ...) that the app
* reaches only through its Service Provider packages. Symlinked packages
* resolve their own dependencies from their real directories (Node's default
* symlink-following), so each package needs only its one flat link.
* Idempotent: correct links are kept and moved installations are
* re-pointed; a stale link to a vanished package stays until its name is
* reused (dangling links are invisible to resolution).
* @param installAnchor - absolute path of the dsh app's package.json.
* @param home - the Harness home; defaults to {@link resolveDshHome}.
*/
function healProfilesModuleFallback(installAnchor, home = resolveDshHome()) {
	const modulesDir = join(join(home, PROFILES_DIR), "node_modules");
	mkdirSync(modulesDir, { recursive: true });
	const appManifest = JSON.parse(readFileSync(installAnchor, "utf8"));
	const links = /* @__PURE__ */ new Map();
	/* v8 ignore next -- a real app manifest always declares its name */
	if (appManifest.name !== void 0) links.set(appManifest.name, dirname(installAnchor));
	const queue = [{
		anchor: installAnchor,
		manifest: appManifest
	}];
	for (let next = queue.shift(); next !== void 0; next = queue.shift())
 /* v8 ignore next -- a real app manifest always declares dependencies */
	for (const dep of [...Object.keys(next.manifest.dependencies ?? {}), ...Object.keys(next.manifest.peerDependencies ?? {})]) {
		if (links.has(dep)) continue;
		const dir = packageDirFromAnchor(next.anchor, dep);
		if (dir === void 0) continue;
		links.set(dep, dir);
		const manifestPath = join(dir, "package.json");
		queue.push({
			anchor: manifestPath,
			manifest: JSON.parse(readFileSync(manifestPath, "utf8"))
		});
	}
	// Desktop bundling extension: the dsh installation may ship packages that
	// are not part of dsh's own dependency closure (e.g. @linxin666/* community
	// bundles, pnpm). Mirror the whole runtime node_modules into the flat
	// fallback so every shipped package is resolvable from any profile;
	// closure links above stay first, this only adds what they missed.
	let installNodeModules;
	for (let dir = dirname(installAnchor); dir !== dirname(dir); dir = dirname(dir)) {
		const candidate = join(dir, "node_modules");
		if (existsSync(candidate)) {
			installNodeModules = candidate;
			break;
		}
	}
	if (installNodeModules !== void 0) {
		for (const entry of readdirSync(installNodeModules)) {
			const entryPath = join(installNodeModules, entry);
			if (!lstatSync(entryPath).isDirectory()) continue;
			if (entry.startsWith("@")) {
				for (const name of readdirSync(entryPath)) {
					const packageName = `${entry}/${name}`;
					if (links.has(packageName)) continue;
					const dir = join(entryPath, name);
					if (existsSync(join(dir, "package.json"))) links.set(packageName, dir);
				}
			} else {
				if (links.has(entry)) continue;
				if (existsSync(join(entryPath, "package.json"))) links.set(entry, entryPath);
			}
		}
	}
	for (const [packageName, target] of links) {
		const link = join(modulesDir, packageName);
		mkdirSync(dirname(link), { recursive: true });
		ensureSymlink(link, target);
	}
}
/**
* Read a profile's manifest.
* @param binName - the diagnostic prefix on the thrown error.
* @param dir - the profile directory.
* @returns the parsed manifest.
*/
function readProfileManifest(binName, dir) {
	const path = join(dir, "package.json");
	let raw;
	try {
		raw = readFileSync(path, "utf8");
	} catch (error) {
		throw new Error(`${binName}: failed to read profile manifest ${path}: ${String(error)}`);
	}
	const parsed = JSON.parse(raw);
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${binName}: profile manifest ${path} must hold a JSON object`);
	return parsed;
}
/**
* Write a profile's manifest back (2-space JSON, trailing newline).
* @param dir - the profile directory.
* @param manifest - the manifest value to persist.
*/
function writeProfileManifest(dir, manifest) {
	writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, void 0, 2) + "\n");
}
/** Return whether two bundle lists have the same values in the same order. */
function sameBundles(left, right) {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}
/**
* Normalize an exact installation-owned bundle tuple to its shipped template
* while preserving every other manifest field. Any other list is user-owned.
*/
function normalizeShippedProfile(name, dir, manifest) {
	const installationOwned = INSTALLATION_OWNED_PROFILE_TUPLES[name];
	const current = PROFILE_TEMPLATES[name];
	const bundles = manifest.dsh?.profile?.bundles;
	if (installationOwned === void 0 || current === void 0 || bundles === void 0 || !sameBundles(bundles, installationOwned)) return manifest;
	const normalized = {
		...manifest,
		dsh: {
			...manifest.dsh,
			profile: {
				...manifest.dsh?.profile,
				bundles: [...current]
			}
		}
	};
	writeProfileManifest(dir, normalized);
	return normalized;
}
/**
* Resolve a package's root directory from one anchor without depending on the
* package exporting `./package.json` (`require.resolve` would need that):
* probe the require resolution paths for a directory holding the named
* manifest. This is Node's own node_modules lookup order, so the result
* matches what the Loader would import from the same anchor, and
* `existsSync` follows the symlinks pnpm's isolated layout uses.
*/
function packageDirFromAnchor(anchor, packageName) {
	/* v8 ignore next */
	for (const searchPath of createRequire(anchor).resolve.paths(packageName) ?? []) {
		const candidate = join(searchPath, packageName);
		if (existsSync(join(candidate, "package.json"))) return candidate;
	}
}
/**
* Resolve one bundle package's directory: installation anchor first, then the
* profile directory. The installation-first order is the contract that
* `@deepseek-ai/dsh-base` (and every other in-box bundle) always comes from
* the same installation as the running dsh, never from a profile-local copy.
* Resolution does not require the package to export `./package.json`.
* @param binName - the diagnostic prefix on the thrown error.
* @param packageName - the bundle's package name from `dsh.profile.bundles`.
* @param installAnchor - absolute path of a file inside the dsh app package (its package.json).
* @param profileDir - the profile directory (second anchor).
* @returns the bundle package's absolute directory.
*/
function resolveBundleDir(binName, packageName, installAnchor, profileDir) {
	for (const anchor of [installAnchor, join(profileDir, "package.json")]) {
		const dir = packageDirFromAnchor(anchor, packageName);
		if (dir !== void 0) return dir;
	}
	throw new Error(`${binName}: cannot resolve profile bundle ${JSON.stringify(packageName)} from the dsh installation or ${profileDir}; run 'dsh plugin --profile ${basename(profileDir)} install' if its dependency is not installed`);
}
/**
* Load a profile: resolve every `dsh.profile.bundles` entry to its patch
* layer and parse the profile's own patch file. A listed bundle without a
* `dsh.bundle` manifest fails loud — naming a bundle-less package as a layer
* is a misconfiguration, not "no patches".
* @param binName - the diagnostic prefix on thrown errors.
* @param name - the profile name.
* @param installAnchor - absolute path of the dsh app's package.json (first resolution anchor).
* @param home - the Harness home; defaults to {@link resolveDshHome}.
* @param options - `userLayer: false` skips reading `cordis.patch.yml`, so a
* bundles-only consumer (`--dump-default-config`, a recovery diagnostic)
* cannot fail on a broken user layer.
* @returns the loaded profile (empty `patches` when the user layer is skipped).
*/
function loadProfile(binName, name, installAnchor, home = resolveDshHome(), options = {}) {
	const dir = resolveProfileDir(name, home);
	if (!existsSync(join(dir, "package.json"))) {
		const template = PROFILE_TEMPLATES[name];
		if (template === void 0) throw new Error(`${binName}: profile ${JSON.stringify(name)} does not exist; create it with 'dsh plugin --profile ${name} add <package>'`);
		initProfile(dir, template);
	}
	const layers = (normalizeShippedProfile(name, dir, readProfileManifest(binName, dir)).dsh?.profile?.bundles ?? []).map((packageName) => {
		const packageDir = resolveBundleDir(binName, packageName, installAnchor, dir);
		const declared = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")).dsh?.bundle?.patch;
		if (declared === void 0) throw new Error(`${binName}: profile bundle ${JSON.stringify(packageName)} declares no dsh.bundle in its package.json`);
		const patchPath = join(packageDir, declared);
		return {
			packageName,
			packageDir,
			patchPath,
			patches: loadOverlayPatches(binName, patchPath)
		};
	});
	const patchPath = join(dir, PROFILE_PATCH_FILENAME);
	return {
		name,
		dir,
		layers,
		patchPath,
		patches: options.userLayer !== false && existsSync(patchPath) ? loadOverlayPatches(binName, patchPath) : []
	};
}
/**
* Compose patch layers into the effective entry list over an empty root —
* the same single `applyEntryPatches` call the boot include makes, so flag
* derivation and config dumps see exactly what mounts.
* @param layers - patch lists in application order.
* @param warn - sink for skipped-patch diagnostics; defaults to silent (boot repeats them).
* @returns the composed entry list.
*/
function composeEntries(layers, warn = () => {}) {
	return applyEntryPatches([], structuredClone(layers.flat()), (message, ...args) => {
		let index = 0;
		warn(message.replace(/%C/g, () => JSON.stringify(args[index++])));
	});
}
//#endregion
//#region lib/types/index.js
/**
* Shared boot glue for the app bins (`dsh`, `dsh-acp-demo`): load the gitignored
* `.env`, install the fail-loud Loader guards, resolve the config path (snapshot-aware), load the
* optional user patch layers from the Harness home (`~/.dsh`), expose its path resolver to
* config expressions, and drive the Cordis Loader against a leaf `cordis.yml` until the tree settles.
* @module @deepseek-ai/dsh-app-boot
*/
/**
* Resolve the config to boot. Replay swaps a `cordis.yml` basename for
* `cordis.snapshot.yml` in the same directory; every other mode keeps the path.
* @param configPath - the requested config path (absolute, or relative to `cwd`).
* @param snapshotMode - the bin's `$DSH_SNAPSHOT` value; only `'replay'` swaps the
*   basename.
* @param cwd - the base a relative `configPath` resolves against.
* @returns the absolute path of the config to boot.
*/
function resolveConfigPath(configPath, snapshotMode, cwd = process.cwd()) {
	const absolute = resolve(cwd, configPath);
	if (snapshotMode !== "replay") return absolute;
	return resolve(dirname(absolute), basename(absolute).replace(/cordis\.ya?ml$/, "cordis.snapshot.yml"));
}
/**
* Load the optional gitignored `.env` from `dir`. Missing files fall back to the
* ambient environment; other read failures are reported through `warn`.
* @param binName - the diagnostic prefix on the warn line.
* @param dir - the directory whose `.env` to load.
* @param warn - sink for the one-line misconfiguration diagnostic.
*/
function loadEnv(binName, dir = process.cwd(), warn = (line) => void process.stderr.write(line)) {
	try {
		process.loadEnvFile(resolve(dir, ".env"));
	} catch (error) {
		if (error?.code !== "ENOENT") warn(`${binName}: failed to load .env: ${String(error)}\n`);
	}
}
/** Exact names no discovered file may set. */
const BOOTSTRAP_NAMES = new Set([
	"PATH",
	"HOME",
	"USERPROFILE",
	"SHELL",
	"NODE_OPTIONS",
	"NODE_PATH",
	"NODE_EXTRA_CA_CERTS",
	"LD_PRELOAD",
	"LD_LIBRARY_PATH",
	"LD_AUDIT",
	"BASH_ENV",
	"ENV",
	"SHELLOPTS",
	"BASHOPTS",
	"PERL5OPT",
	"PERL5LIB",
	"PYTHONSTARTUP",
	"PYTHONPATH",
	"RUBYOPT",
	"RUBYLIB",
	"JAVA_TOOL_OPTIONS",
	"_JAVA_OPTIONS",
	"JDK_JAVA_OPTIONS",
	"PYTHONHOME",
	"GIT_SSH",
	"GIT_SSH_COMMAND",
	"GIT_EXTERNAL_DIFF",
	"GIT_PAGER",
	"GIT_EDITOR",
	"GIT_ASKPASS",
	"SSH_ASKPASS",
	"GIT_CONFIG_GLOBAL",
	"GIT_CONFIG_SYSTEM",
	"GIT_CONFIG_COUNT",
	"EDITOR",
	"VISUAL",
	"PAGER",
	"DEEPSEEK_BASE_URL",
	"DEEPSEEK_SEARCH_BASE_URL",
	"SSL_CERT_FILE",
	"SSL_CERT_DIR",
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"ALL_PROXY",
	"NO_PROXY",
	"REQUESTS_CA_BUNDLE",
	"CURL_CA_BUNDLE",
	"NODE_TLS_REJECT_UNAUTHORIZED"
]);
/** Name prefixes no discovered file may set. */
const BOOTSTRAP_PREFIXES = [
	"DSH_",
	"XDG_",
	"DYLD_",
	"BASH_FUNC_"
];
/**
* Whether a variable may come only from the inherited process environment
* because it changes process, runtime, VCS, or network bootstrap.
* @param name - the variable name.
* @returns true when only the inherited environment may supply it.
*/
function isBootstrapOnly(name) {
	const upper = name.toUpperCase();
	return BOOTSTRAP_NAMES.has(upper) || BOOTSTRAP_PREFIXES.some((prefix) => upper.startsWith(prefix));
}
/**
* Parse one directory's `.env` without applying it, rejecting bootstrap-only
* names before any value is materialized.
* @param binName - the diagnostic prefix on the thrown error.
* @param dir - the directory whose `.env` to read.
* @param warn - sink for the one-line unreadable-file diagnostic.
* @returns the parsed entries, or `undefined` when the file is absent or unreadable.
* @throws when the file declares a name {@link isBootstrapOnly} rejects.
*/
function readEnvLayer(binName, dir, warn) {
	const path = resolve(dir, ".env");
	let content;
	try {
		content = readFileSync(path, "utf8");
	} catch (error) {
		if (error?.code !== "ENOENT") warn(`${binName}: failed to load .env: ${String(error)}\n`);
		return;
	}
	const values = parseEnv(content);
	for (const name of Object.keys(values)) {
		if (!isBootstrapOnly(name)) continue;
		throw new Error(`${binName}: ${path} sets "${name}", which only the launching environment may set (it decides how this process starts, where its code and instructions load from, or how it reaches the network); export ${name} instead of putting it in a .env file`);
	}
	return {
		path,
		values
	};
}
/**
* Load the product CLI's inherited > invoking-directory `.env` > Harness-home
* `.env` snapshot. The Harness home resolves before either file; both files
* are checked before either is applied, and accepted values are materialized
* without replacing inherited ones. The snapshot preserves which layer supplied each value.
* @param binName - the diagnostic prefix on the diagnostics.
* @param cwd - the invoking directory whose `.env` is the project layer.
* @param warn - sink for the one-line misconfiguration diagnostics.
* @returns this run's frozen environment snapshot.
* @throws when either file declares a bootstrap-only variable.
*/
function loadLayeredEnv(binName, cwd = process.cwd(), warn = (line) => void process.stderr.write(line)) {
	const home = resolveDshHome();
	const inherited = { ...process.env };
	const project = readEnvLayer(binName, cwd, warn);
	const user = home === resolve(cwd) ? void 0 : readEnvLayer(binName, home, warn);
	for (const layer of [project, user]) {
		if (layer === void 0) continue;
		for (const [name, value] of Object.entries(layer.values)) if (process.env[name] === void 0) process.env[name] = value;
	}
	return createLaunchEnvironmentSnapshot([
		{
			source: "process",
			values: inherited
		},
		...project === void 0 ? [] : [{
			source: "project-env",
			path: project.path,
			values: project.values
		}],
		...user === void 0 ? [] : [{
			source: "user-env",
			path: user.path,
			values: user.values
		}]
	]);
}
const bootstrapIncludes = /* @__PURE__ */ new WeakMap();
const userPatchesSchema = entryListSchema;
/**
* Watch the user patch layer through Cordis HMR and transactionally reapply it to the boot include.
* @param ctx - settled app context containing the root Include and an active HMR service.
* @param options - diagnostic, file, and patch-composition inputs.
* @returns an asynchronous disposer after the exact-path watcher is ready.
* @throws when HMR or the root Include is absent, watcher setup fails, or initial path resolution fails.
*/
async function watchUserPatches(ctx, options) {
	const { binName, filename, compose = (patches) => patches } = options;
	const hmr = ctx.get("hmr");
	if (hmr === void 0) throw new Error(`${binName}: user patch-layer watching requires the Cordis HMR service`);
	const entry = bootstrapIncludes.get(ctx);
	if (entry === void 0) throw new Error(`${binName}: user patch-layer watching requires the root Include entry`);
	const register = hmr.registerConfig(filename, async () => {
		const { patches: _previousPatches, ...includeConfig } = entry.options.config;
		const patches = compose(loadOptionalPatches(binName, filename) ?? []);
		await entry.update({ config: {
			...includeConfig,
			patches
		} });
	});
	try {
		return await register;
	} catch (error) {
		if (error?.code === "INACTIVE_EFFECT") return async () => {};
		throw error;
	}
}
/**
* Load an optional patch-list file: a top-level YAML array of loader patch
* entries (`@deepseek-ai/cordis-plugin-include`'s `PatchOptions`): id-targeted config
* overrides and `insert` lists, with `!!js` expressions allowed. A missing
* file means "no layer"; an unreadable, unparsable, or non-array file throws —
* a present patch file that cannot apply is a misconfiguration and must fail
* loud at boot, never be silently skipped.
* @param binName - the diagnostic prefix on the thrown error.
* @param file - absolute path of the patch file.
* @returns the parsed patches, or `undefined` when the file does not exist.
*/
function loadOptionalPatches(binName, file) {
	let content;
	try {
		content = readFileSync(file, "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") return void 0;
		throw new Error(`${binName}: failed to read patches ${file}: ${String(error)}`);
	}
	return parsePatchList(binName, file, content, "patches");
}
/**
* Load a required overlay patch list: a bundle's `cordis.patch.yml` or a
* `--patch <path>` overlay. Same file format as {@link loadOptionalPatches},
* but a missing file throws, because the caller named this file — its absence
* is a misconfiguration, not "no overlay".
* @param binName - the diagnostic prefix on the thrown error.
* @param file - absolute path of the overlay file.
* @returns the parsed patch list.
*/
function loadOverlayPatches(binName, file) {
	let content;
	try {
		content = readFileSync(file, "utf8");
	} catch (error) {
		throw new Error(`${binName}: failed to read overlay ${file}: ${String(error)}`);
	}
	return parsePatchList(binName, file, content, "overlay");
}
/**
* Parse one loader patch list: a top-level YAML array of
* `@deepseek-ai/cordis-plugin-include` `PatchOptions` (id-targeted config overrides and
* `insert` lists, `!!js` expressions allowed). Every invalid field or value throws,
* because a patch file that cannot be applied at all is a misconfiguration; a
* single patch whose target row is absent stays a per-entry Loader warning, so
* one overlay shared across surfaces does not have to match every tree.
* @param binName - the diagnostic prefix on the thrown error.
* @param file - the source path, quoted in errors.
* @param content - the file's text.
* @param label - what to call this list in errors (`patches`, `overlay`).
* @returns the parsed patch list.
*/
function parsePatchList(binName, file, content, label) {
	let parsed;
	try {
		parsed = yaml.load(content, { schema: userPatchesSchema });
	} catch (error) {
		throw new Error(`${binName}: failed to parse ${label} ${file}: ${String(error)}`);
	}
	if (!Array.isArray(parsed)) throw new Error(`${binName}: ${label} ${file} must be a top-level YAML array of loader patch entries`);
	parsed.forEach((entry, index) => {
		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) throw new Error(`${binName}: ${label} entry ${index + 1} in ${file} must be a mapping (a loader patch entry)`);
	});
	return parsed;
}
/**
* Compose the effective entry list exactly as `boot()` would mount it: parse
* the base config file with the include's entry-list dialect, apply every
* layer's patches as ONE flattened list through the include's own patch
* algorithm (`applyEntryPatches`) — the same single call `boot()` makes, so
* even patch-visibility corner cases (a later layer targeting a group child a
* plain config replacement introduced, which the single-pass id index never
* sees) compose identically — then render the result as YAML in the same
* dialect (`!!js` expressions print verbatim, unevaluated).
*
* Every run of rows from the same file and patch layers is preceded by a `# ==` comment
* naming the file that contributed the rows and any layers that patched them,
* so the output stays a loadable YAML document while showing which section
* comes from which file. The file and patch labels are derived from single-call prefix
* snapshots (base + layers 1..k), diffed positionally: the patch algorithm
* only rewrites rows in place or appends, so a top-level index identifies one
* row across snapshots, and a layer whose addition changes the row (config
* replacement, disable, group insert) is listed as having patched it.
*
* A patch that matches no row is reported through `warn` with its layer
* label, mirroring the Loader's boot-time warning. Earlier layers' patches
* see an identical preceding state in every snapshot that includes them, so
* each snapshot's warning list extends the previous one and the new tail
* belongs to the added layer.
* @param binName - the diagnostic prefix on read/parse errors.
* @param absoluteConfigPath - the base config file `boot()` would include.
* @param layers - overlay layers in application order (later wins).
* @param warn - sink for skipped-patch diagnostics; defaults to stderr.
* @returns the composed entry list rendered as a YAML document with
* source comment separators.
*/
function renderConfigDump(binName, absoluteConfigPath, layers, warn = (line) => void process.stderr.write(`${line}\n`)) {
	let content;
	try {
		content = readFileSync(absoluteConfigPath, "utf8");
	} catch (error) {
		throw new Error(`${binName}: failed to read config ${absoluteConfigPath}: ${String(error)}`);
	}
	let parsed;
	try {
		parsed = yaml.load(content, { schema: entryListSchema });
	} catch (error) {
		throw new Error(`${binName}: failed to parse config ${absoluteConfigPath}: ${String(error)}`);
	}
	if (!Array.isArray(parsed)) throw new Error(`${binName}: config ${absoluteConfigPath} must be a top-level YAML array of entries`);
	const baseLabel = basename(absoluteConfigPath);
	const base = parsed;
	const snapshot = (count, warnings) => {
		return applyEntryPatches(base, structuredClone(layers.slice(0, count).flatMap((layer) => layer.patches)), (message, ...args) => {
			let index = 0;
			warnings.push(message.replace(/%C/g, () => JSON.stringify(args[index++])));
		});
	};
	let previous = base;
	let previousWarnings = [];
	const provenance = base.map(() => ({
		origin: baseLabel,
		patchedBy: []
	}));
	let composed = base;
	for (let count = 1; count <= layers.length; count += 1) {
		const layer = layers[count - 1];
		/* v8 ignore next -- count iterates 1..length, so the slot exists */
		if (layer === void 0) continue;
		const warnings = [];
		composed = snapshot(count, warnings);
		for (const line of warnings.slice(previousWarnings.length)) warn(`${binName}: [${layer.label}] ${line}`);
		const before = previous.map((entry) => JSON.stringify(entry));
		for (let index = 0; index < composed.length; index += 1) if (index >= before.length) provenance.push({
			origin: layer.label,
			patchedBy: []
		});
		else if (JSON.stringify(composed[index]) !== before[index]) provenance[index]?.patchedBy.push(layer.label);
		previous = composed;
		previousWarnings = warnings;
	}
	return groupedDump(composed, provenance);
}
/** Render the composed rows grouped under one source-and-patches comment per contiguous run. */
function groupedDump(composed, provenance) {
	const lines = [];
	let currentLabel;
	let group = [];
	const flush = () => {
		if (currentLabel === void 0 || group.length === 0) return;
		lines.push(`# == ${currentLabel}`);
		lines.push(yaml.dump(group, {
			schema: entryListSchema,
			noRefs: true
		}).trimEnd());
		group = [];
	};
	for (let index = 0; index < composed.length; index += 1) {
		const record = provenance[index];
		/* v8 ignore next -- this array is index-aligned with composed by construction */
		if (record === void 0) continue;
		const label = record.patchedBy.length === 0 ? record.origin : `${record.origin}, patched by ${record.patchedBy.join(", ")}`;
		if (label !== currentLabel) {
			flush();
			currentLabel = label;
		}
		group.push(composed[index]);
	}
	flush();
	return lines.join("\n") + "\n";
}
/**
* Mount and remember the exact root Include entry used by app boot and user patch-layer HMR.
* @param ctx - context carrying an initialized Loader service.
* @param absoluteConfigPath - absolute YAML or JSON configuration path.
* @param patches - initial app and user patches, applied in order.
* @param bareModuleBaseUrl - optional installed-host base for bare package
* names; relative names continue to resolve beside the configuration file.
* @returns the created root Include entry, or `undefined` when a surface
* disposed the whole tree (taking the Loader service with it) while the
* transactional create was still settling entry lifecycle.
*/
async function mountRootInclude(ctx, absoluteConfigPath, patches = [], bareModuleBaseUrl) {
	ctx.loader.builtins.include = bareModuleBaseUrl === void 0 ? Include : class HostResolvedRootInclude extends Include {
		import(name, getOuterStack) {
			const specifier = isAbsolute(name) ? pathToFileURL(name).href : name;
			if (name.startsWith(".") || name.startsWith("cordis:")) return super.import(specifier, getOuterStack);
			const internal = this.ctx.loader.internal;
			/* v8 ignore next -- Node supplies the internal loader; this preserves the
			original diagnostic for hypothetical embedders without it. */
			if (internal === void 0) return super.import(specifier, getOuterStack);
			return internal.import(specifier, bareModuleBaseUrl, {});
		}
	};
	ctx.loader.builtins.group = Group;
	const rootInclude = {
		id: "include",
		name: "cordis:include",
		config: {
			path: pathToFileURL(absoluteConfigPath).href,
			...patches.length > 0 ? { patches: [...patches] } : {}
		}
	};
	const includeId = await ctx.loader.create(rootInclude);
	const loader = ctx.get("loader");
	if (loader === void 0) return void 0;
	const entry = loader.resolve(includeId);
	bootstrapIncludes.set(ctx, entry);
	return entry;
}
const assembledActivationRejections = /* @__PURE__ */ new Map();
function retainAssembledRejection(reason) {
	assembledActivationRejections.set(reason, (assembledActivationRejections.get(reason) ?? 0) + 1);
}
function releaseAssembledRejection(reason) {
	const count = assembledActivationRejections.get(reason);
	if (count === void 0 || count === 1) assembledActivationRejections.delete(reason);
	else assembledActivationRejections.set(reason, count - 1);
}
async function observeLoaderRejectionCheckpoint(reasons) {
	for (const reason of reasons) retainAssembledRejection(reason);
	try {
		await new Promise((resolve) => setImmediate(resolve));
	} finally {
		for (const reason of reasons) releaseAssembledRejection(reason);
	}
}
/**
* How long {@link installFailLoud} waits for its `release` hook before exiting
* anyway. A wedged disposer must delay the fatal exit, never cancel it.
*/
const FAIL_LOUD_RELEASE_TIMEOUT_MS = 2e3;
/**
* Install before boot to turn a late unhandled plugin-init rejection into one
* labelled stderr diagnostic and `exit(1)`. A rejection already included by
* {@link assertEntriesActivated} is ignored during its process checkpoint;
* every other rejection remains fatal. Stdout remains untouched for ACP; the
* returned function removes the handler.
*
* The Loader mounts entries concurrently, so a surface that owns the terminal
* can already hold it when a sibling entry rejects. Exiting straight from the
* handler would strand raw mode, bracketed paste, and the keyboard protocol on
* the user's shell, and leave an in-flight terminal query's reply to land as
* literal text at the next prompt. `release` is the terminal owner's chance to
* hand it back; it is awaited under {@link FAIL_LOUD_RELEASE_TIMEOUT_MS}, whose
* timer stays referenced so a never-settling disposer cannot let Node reach an
* empty event loop and exit 0 instead of failing.
*
* The diagnostic is written before the release so a hanging or failing disposer
* cannot swallow the reason. The handler stays installed while the release runs
* — removing it would let a second concurrent rejection become uncaught and kill
* the process mid-teardown, stranding exactly the terminal state this restores —
* so a latch keeps the first rejection the reported one and lets later
* rejections (including the release's own) fall through to the pending exit.
* @param binName - the diagnostic prefix on the fatal-failure line.
* @param proc - the process slice to register on; tests inject a fake.
* @param release - optional teardown awaited before exit, used by a
*   terminal-owning surface to restore the terminal. Its own failure is
*   swallowed because the pending fatal exit already owns the outcome.
* @returns the uninstaller that removes the rejection handler.
*/
function installFailLoud(binName, proc = process, release) {
	let exiting = false;
	const handler = (err) => {
		if (assembledActivationRejections.has(err)) return;
		if (exiting) return;
		exiting = true;
		proc.stderr.write(`${binName}: fatal load failure: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
		if (release === void 0) {
			proc.exit(1);
			return;
		}
		(async () => {
			let timer;
			try {
				await Promise.race([(async () => release())(), new Promise((resolve) => {
					timer = setTimeout(resolve, FAIL_LOUD_RELEASE_TIMEOUT_MS);
				})]);
			} catch {}
			clearTimeout(timer);
			proc.exit(1);
		})();
	};
	const uninstall = () => void proc.off("unhandledRejection", handler);
	proc.on("unhandledRejection", handler);
	return uninstall;
}
/**
* After the tree settles, reject entries with no fiber and name every plugin
* whose module failed to resolve. Disabled entries are the only valid
* fiber-less state.
* @param ctx - the settled context whose loader entries to audit.
* @param binName - the diagnostic prefix on the thrown error.
*/
function assertEntriesLoaded(ctx, binName) {
	const failed = [...ctx.loader.entries()].filter((entry) => entry.fiber === void 0 && !entry.disabled);
	if (failed.length > 0) {
		const names = failed.map((entry) => entry.options.name).join(", ");
		throw new Error(`${binName}: plugin(s) failed to load: ${names}; Cordis startup failed because these plugin(s) could not be resolved (see the error(s) logged above)`);
	}
}
/**
* Value mirrors used because Cordis's const enum has no runtime object to import.
* Keep aligned with `packages/extensions/tool-cordis/src/fiber-state.ts` and
* `packages/client/web/src/loader-status.ts`.
*/
const FIBER_PENDING = 0;
const FIBER_ACTIVE = 2;
const FIBER_FAILED = 3;
/** Render a thrown plugin value without discarding an Error's original stack. */
function formatActivationError(error) {
	return error instanceof Error ? error.stack ?? error.message : String(error);
}
/**
* Reject a settled Loader tree when an enabled entry failed or remains inactive.
* Plugin failures include the original thrown stack; pending entries name their
* unresolved services because no plugin error exists for that state. Active
* entries require no further wait; only failed fibers are awaited to recover
* their private rejection reason.
* @param ctx - the settled context whose Loader entries to audit.
* @param binName - the diagnostic prefix on the thrown error.
* @returns nothing when every enabled entry is active.
* @throws after one process rejection checkpoint when an entry failed to
* import, rejected during activation, or did not become active.
*/
async function assertEntriesActivated(ctx, binName) {
	assertEntriesLoaded(ctx, binName);
	const failures = [];
	const rejectionReasons = [];
	for (const entry of ctx.loader.entries()) {
		const fiber = entry.fiber;
		if (fiber === void 0 || entry.disabled) continue;
		const state = fiber.state;
		if (state === FIBER_ACTIVE) continue;
		if (state === FIBER_FAILED) {
			try {
				await fiber.await();
			} catch (error) {
				rejectionReasons.push(error);
				failures.push(`${entry.options.name}: ${formatActivationError(error)}`);
			}
			continue;
		}
		if (state === FIBER_PENDING) {
			const missing = Object.keys(fiber.inject).filter((service) => fiber.ctx.get(service) === void 0);
			const subject = missing.length === 1 ? "service" : "services";
			failures.push(`${entry.options.name}: pending (waiting for ${subject}: ${missing.join(", ") || "unknown"})`);
		} else failures.push(`${entry.options.name}: fiber state ${String(state)}`);
	}
	if (failures.length > 0) {
		if (rejectionReasons.length > 0) await observeLoaderRejectionCheckpoint(rejectionReasons);
		const noun = failures.length === 1 ? "entry" : "entries";
		throw new Error(`${binName}: ${String(failures.length)} ${noun} did not activate\n${failures.join("\n")}`);
	}
}
/**
* Boot the Loader against `absoluteConfigPath` and return only after the whole
* tree settles. Relative entry names resolve against the config directory;
* bare package names resolve there by default or against an explicit
* `bareModuleBaseUrl` for closed packaged runtimes. The bootstrap include
* is statically imported and mounted as the `cordis:include` builtin, loading
* through the ambient module pipeline (vite/tsx/plain ESM). The package build
* embeds Include while leaving Loader external, so the built include tree and
* host share one Loader peer. Loader
* settlement rejects startup failures, which `boot` wraps after disposing the
* partial context; a missing fiber or never-activating entry is rejected by
* the final audit, {@link assertEntriesActivated}, which rethrows a plugin's
* init rejection with its original stack; later unhandled rejections remain
* covered by {@link installFailLoud}. Built bins need the Loader's native
* helper for bare plugin specifiers; relative specifiers do not.
* @param binName - the diagnostic prefix for load-failure errors.
* @param absoluteConfigPath - the config to include; must already be absolute
* (see {@link resolveConfigPath}).
* @param patches - optional overlay patches applied over the included tree
* (see {@link loadOptionalPatches}); an empty list mounts none.
* @param prepare - optional host setup run after Loader installation and before any config-tree entry mounts.
* @param bareModuleBaseUrl - optional installed-host base for bare package
* names; use it when the host, rather than the configuration project, owns the
* complete plugin set.
* @returns the root context once every entry has started, or as soon as a
* surface disposed the tree while startup was still in flight.
* @throws a labelled error after disposing the partial context — `host
* preparation failed` when `prepare` threw before any config-tree entry
* mounted, `plugin tree failed to load` afterwards.
*/
async function boot(binName, absoluteConfigPath, patches, prepare, bareModuleBaseUrl) {
	const ctx = new Context();
	let stage = "host preparation failed";
	try {
		ctx.baseUrl = pathToFileURL(dirname(absoluteConfigPath)).href + "/";
		ctx.provide("dshHomePath", dshHomePath);
		await ctx.plugin(Loader);
		await prepare?.(ctx);
		stage = "plugin tree failed to load";
		await mountRootInclude(ctx, absoluteConfigPath, patches, bareModuleBaseUrl);
		await ctx.get("loader")?.await();
		if (ctx.get("loader") === void 0) return ctx;
		await assertEntriesActivated(ctx, binName);
		return ctx;
	} catch (cause) {
		await ctx.fiber.dispose();
		const detail = cause instanceof Error ? cause.message : String(cause);
		let deepest = cause;
		while (deepest instanceof Error && deepest.cause !== void 0) deepest = deepest.cause;
		const stack = deepest instanceof Error && deepest !== cause ? `\n${deepest.stack ?? deepest.message}` : "";
		throw new Error(`${binName}: ${stage}: ${detail}${stack}`, { cause });
	}
}
/** Prompt-section name for the harness-source location line an app bin adds after boot. */
const HARNESS_SOURCE_SECTION = "harness:source";
/**
* Add a global prompt section naming the on-disk harness source checkout while
* explicitly distinguishing it from the task workspace and current working
* directory. The self-referential `dsh-tool-cordis` toolset reads and edits this
* checkout. Call once on the settled boot context ({@link boot}); the section
* orders just after the harness identity opener (`-100`) and before the deployment
* persona (`0`). A booted tree with no `systemPrompt` service has no prompt to
* augment, so this is then a no-op that returns `undefined`. The section is
* registered against the `systemPrompt` service's fiber, so a dev HMR reload of
* that plugin drops it until the next boot.
* @param ctx - the settled boot context whose global system prompt to augment.
* @param sourceRoot - the absolute path to the harness checkout root.
* @returns the section disposer, or `undefined` when no `systemPrompt` service is mounted.
*/
function addHarnessSourceSection(ctx, sourceRoot) {
	const systemPrompt = ctx.get("systemPrompt");
	if (systemPrompt === void 0) return void 0;
	return systemPrompt.section({
		name: HARNESS_SOURCE_SECTION,
		order: -99,
		text: `The DeepSeek Harness implementation checkout is at ${sourceRoot}. The checkout location and current working directory are separate values and may differ; never infer the working directory from this path. Use pwd to determine the current working directory. Use this checkout only to inspect or extend DSH itself.`
	});
}
//#endregion
export { DEFAULT_PROFILE_BUNDLES, FAIL_LOUD_RELEASE_TIMEOUT_MS, HARNESS_SOURCE_SECTION, PROFILES_DIR, PROFILE_PATCH_FILENAME, PROFILE_TEMPLATES, addHarnessSourceSection, assertEntriesActivated, assertEntriesLoaded, boot, composeEntries, healProfilesModuleFallback, initProfile, installFailLoud, loadEnv, loadLayeredEnv, loadOptionalPatches, loadOverlayPatches, loadProfile, mountRootInclude, readProfileManifest, renderConfigDump, resolveBundleDir, resolveConfigPath, resolveProfileDir, watchUserPatches, writeProfileManifest };
