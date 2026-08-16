window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-settings-plugin-inventory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-settings-plugin-inventory/src/client/PluginInventorySettingsTab.module.css.mjs
		const css = ".qSYn7G_section{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:14px;display:flex}.qSYn7G_catalogHeading h3,.qSYn7G_status,.qSYn7G_failure p{margin:0}.qSYn7G_status,.qSYn7G_failure{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.qSYn7G_failure{color:var(--dsw-alias-state-error-primary);align-items:center;gap:10px;display:flex}.qSYn7G_failure button{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:4px 10px}.qSYn7G_catalog{flex-direction:column;gap:12px;display:flex}.qSYn7G_search{width:100%;color:var(--dsw-alias-label-tertiary);align-items:center;display:flex;position:relative}.qSYn7G_search>svg{pointer-events:none;position:absolute;left:12px}.qSYn7G_search input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:100%;height:36px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;outline:none;padding:0 34px 0 36px;font-size:13px}.qSYn7G_search input::placeholder{color:var(--dsw-alias-label-tertiary)}.qSYn7G_search input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}.qSYn7G_catalogHeading{align-items:baseline;gap:7px;padding:0 2px;display:flex}.qSYn7G_catalogHeading h3{font-size:13px;font-weight:600;line-height:20px}.qSYn7G_catalogHeading span{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:12px;line-height:18px}.qSYn7G_cards{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:10px;margin:0;padding:0;list-style:none;display:grid}.qSYn7G_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;min-width:0;overflow:hidden}.qSYn7G_card[data-open=true]{border-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-shadow-lv1)}.qSYn7G_cardContent{box-sizing:border-box;width:100%;min-height:52px;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;display:flex}.qSYn7G_cardContent:hover,.qSYn7G_card[data-open=true]>.qSYn7G_cardContent{background:var(--dsw-alias-interactive-bg-hover)}.qSYn7G_cardContent:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.qSYn7G_cardTitle{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:14px;font-weight:600;line-height:20px;overflow:hidden}.qSYn7G_cardTrailing{color:var(--dsw-alias-label-tertiary);flex:none;align-items:center;gap:7px;display:inline-flex}.qSYn7G_statusDot{background:var(--dsw-alias-label-tertiary);border-radius:999px;flex:none;width:7px;height:7px;display:inline-block}.qSYn7G_statusDot[data-phase=active]{background:var(--dsw-alias-state-success-primary)}.qSYn7G_statusDot[data-phase=failed]{background:var(--dsw-alias-state-error-primary)}.qSYn7G_statusDot[data-phase=loading]{background:var(--dsw-alias-state-business-primary)}.qSYn7G_configTag{background:var(--dsw-alias-bg-layer-1);min-height:20px;color:var(--dsw-alias-label-secondary);white-space:nowrap;border-radius:5px;align-items:center;padding:1px 6px;font-size:11px;line-height:16px;display:inline-flex}.qSYn7G_configTag[data-enabled=true]{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);color:var(--dsw-alias-state-success-primary)}.qSYn7G_chevron{color:var(--dsw-alias-label-tertiary);flex:none}.qSYn7G_card[data-open=true] .qSYn7G_chevron{transform:rotate(180deg)}.qSYn7G_cardDetails{border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);padding:10px 14px 12px}.qSYn7G_entryValue{overflow-wrap:anywhere;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;display:block}.qSYn7G_details{grid-template-columns:76px minmax(0,1fr);gap:6px 10px;margin:8px 0 0;display:grid}.qSYn7G_details div{display:contents}.qSYn7G_details dt{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}.qSYn7G_details dd{overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:17px}.qSYn7G_visuallyHidden{clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}@media (prefers-reduced-motion:no-preference){.qSYn7G_chevron{transition:transform .14s var(--ds-ease-in-out)}}@media (width<=680px){.qSYn7G_cards{grid-template-columns:minmax(0,1fr)}}";
		const tagId = "@deepseek-ai/dsh-client-ui-settings-plugin-inventory/PluginInventorySettingsTab.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-settings-plugin-inventory";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var PluginInventorySettingsTab_module_css_default = {
			"cardContent": "qSYn7G_cardContent",
			"visuallyHidden": "qSYn7G_visuallyHidden",
			"configTag": "qSYn7G_configTag",
			"search": "qSYn7G_search",
			"catalogHeading": "qSYn7G_catalogHeading",
			"cards": "qSYn7G_cards",
			"chevron": "qSYn7G_chevron",
			"cardTrailing": "qSYn7G_cardTrailing",
			"status": "qSYn7G_status",
			"section": "qSYn7G_section",
			"catalog": "qSYn7G_catalog",
			"cardTitle": "qSYn7G_cardTitle",
			"entryValue": "qSYn7G_entryValue",
			"failure": "qSYn7G_failure",
			"statusDot": "qSYn7G_statusDot",
			"cardDetails": "qSYn7G_cardDetails",
			"details": "qSYn7G_details",
			"card": "qSYn7G_card"
		};
		//#endregion
		//#region lib/types/client/PluginInventorySettingsTab.js
		const PHASE_KEYS = {
			pending: "pending",
			loading: "loadingPhase",
			active: "active",
			failed: "failed",
			unloading: "unloading"
		};
		/** Localized accessible label for one root Fiber phase. */
		function phaseLabel(phase, t) {
			return phase === null ? t("unobserved") : t(PHASE_KEYS[phase]);
		}
		/** Compact a module specifier without guessing whether its Loader id was generated. */
		function moduleShortName(moduleName) {
			return (moduleName.startsWith("@") ? moduleName.slice(moduleName.indexOf("/") + 1) : moduleName).replace(/^cordis:/, "").replace(/^cordis-plugin-/, "").replace(/^dsh-(?:host-|client-)?/, "");
		}
		/** Whether an inventory row matches the local catalog query. */
		function matches(entry, normalizedQuery) {
			if (normalizedQuery.length === 0) return true;
			return [entry.moduleName, entry.entryId].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
		}
		/** Render the read-only current Loader inventory. */
		function PluginInventorySettingsTab({ list, t }) {
			const catalogId = (0, react.useId)();
			const [request, setRequest] = (0, react.useState)(0);
			const [query, setQuery] = (0, react.useState)("");
			const [expanded, setExpanded] = (0, react.useState)(null);
			const [state, setState] = (0, react.useState)({ status: "loading" });
			const [pending, setPending] = (0, react.useState)({});
			(0, react.useEffect)(() => {
				let current = true;
				Promise.resolve().then(() => list()).then((snapshot) => {
					if (current) setState({
						status: "ready",
						snapshot
					});
				}, () => {
					if (current) setState({ status: "error" });
				});
				return () => {
					current = false;
				};
			}, [list, request]);
			const normalizedQuery = query.trim().toLocaleLowerCase();
			const filteredEntries = (0, react.useMemo)(() => state.status === "ready" ? state.snapshot.entries.filter((entry) => matches(entry, normalizedQuery)) : [], [normalizedQuery, state]);
			(0, react.useEffect)(() => {
				if (expanded !== null && !filteredEntries.some((entry) => entry.entryId === expanded)) setExpanded(null);
			}, [expanded, filteredEntries]);
			const retry = () => {
				setState({ status: "loading" });
				setRequest((value) => value + 1);
			};
			const togglePlugin = (id, disabled) => {
				setPending((previous) => ({ ...previous, [id]: true }));
				fetch("http://127.0.0.1:3091/plugins", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ id, disabled })
				}).then((response) => response.json()).then((result) => {
					if (result.ok) setState((previous) => previous.status === "ready" ? {
						status: "ready",
						snapshot: {
							entries: previous.snapshot.entries.map((entry) => entry.entryId === id ? { ...entry, enabled: disabled } : entry)
						}
					} : previous);
				}).catch(() => {}).finally(() => {
					setPending((previous) => ({ ...previous, [id]: false }));
				});
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				className: PluginInventorySettingsTab_module_css_default.section,
				"aria-busy": state.status === "loading",
				children: [
					state.status === "loading" ? (0, react_jsx_runtime.jsx)("p", {
						className: PluginInventorySettingsTab_module_css_default.status,
						children: t("loading")
					}) : null,
					state.status === "error" ? (0, react_jsx_runtime.jsxs)("div", {
						className: PluginInventorySettingsTab_module_css_default.failure,
						children: [(0, react_jsx_runtime.jsx)("p", {
							role: "alert",
							children: t("error")
						}), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: retry,
							children: t("retry")
						})]
					}) : null,
					state.status === "ready" ? (0, react_jsx_runtime.jsxs)("div", {
						className: PluginInventorySettingsTab_module_css_default.catalog,
						children: [
							(0, react_jsx_runtime.jsxs)("label", {
								className: PluginInventorySettingsTab_module_css_default.search,
								children: [
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, { "aria-hidden": "true" }),
									(0, react_jsx_runtime.jsx)("span", {
										className: PluginInventorySettingsTab_module_css_default.visuallyHidden,
										children: t("search")
									}),
									(0, react_jsx_runtime.jsx)("input", {
										type: "search",
										value: query,
										placeholder: t("search"),
										"aria-label": t("search"),
										onChange: (event) => {
											setQuery(event.currentTarget.value);
										}
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: PluginInventorySettingsTab_module_css_default.catalogHeading,
								children: [(0, react_jsx_runtime.jsx)("h3", { children: t("catalog") }), (0, react_jsx_runtime.jsx)("span", {
									"data-plugin-count": filteredEntries.length,
									children: filteredEntries.length
								})]
							}),
							state.snapshot.entries.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
								className: PluginInventorySettingsTab_module_css_default.status,
								children: t("empty")
							}) : null,
							state.snapshot.entries.length > 0 && filteredEntries.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
								className: PluginInventorySettingsTab_module_css_default.status,
								children: t("emptySearch")
							}) : null,
							filteredEntries.length > 0 ? (0, react_jsx_runtime.jsx)("ul", {
								className: PluginInventorySettingsTab_module_css_default.cards,
								children: filteredEntries.map((entry) => {
									const status = phaseLabel(entry.fiberPhase, t);
									const title = moduleShortName(entry.moduleName);
									const configuration = t(entry.enabled ? "enabledTag" : "disabledTag");
									const open = expanded === entry.entryId;
									const detailId = `${catalogId}-details-${encodeURIComponent(entry.entryId)}`;
									return (0, react_jsx_runtime.jsxs)("li", {
										className: PluginInventorySettingsTab_module_css_default.card,
										"data-plugin-entry": entry.entryId,
										"data-open": open ? "true" : void 0,
										children: [(0, react_jsx_runtime.jsxs)("button", {
											className: PluginInventorySettingsTab_module_css_default.cardContent,
											type: "button",
											"aria-expanded": open,
											"aria-controls": detailId,
											"aria-label": entry.enabled ? `${title}, ${status}, ${configuration}` : `${title}, ${configuration}`,
											onClick: () => {
												setExpanded((current) => current === entry.entryId ? null : entry.entryId);
											},
											children: [(0, react_jsx_runtime.jsx)("strong", {
												className: PluginInventorySettingsTab_module_css_default.cardTitle,
												title: entry.moduleName,
												children: title
											}), (0, react_jsx_runtime.jsxs)("span", {
												className: PluginInventorySettingsTab_module_css_default.cardTrailing,
												children: [
													entry.enabled ? (0, react_jsx_runtime.jsx)("span", {
														className: PluginInventorySettingsTab_module_css_default.statusDot,
														"data-phase": entry.fiberPhase ?? "unobserved",
														role: "img",
														"aria-label": status,
														title: status
													}) : null,
													(0, react_jsx_runtime.jsx)("span", {
														className: PluginInventorySettingsTab_module_css_default.configTag,
														"data-enabled": entry.enabled ? "true" : "false",
														children: configuration
													}),
													(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {
														className: PluginInventorySettingsTab_module_css_default.chevron,
														size: 12,
														"aria-hidden": "true"
													})
												]
											})]
										}), open ? (0, react_jsx_runtime.jsxs)("div", {
											className: PluginInventorySettingsTab_module_css_default.cardDetails,
											id: detailId,
											children: [(0, react_jsx_runtime.jsx)("code", {
												className: PluginInventorySettingsTab_module_css_default.entryValue,
												"data-loader-entry": true,
												children: entry.entryId
											}), (0, react_jsx_runtime.jsxs)("dl", {
												className: PluginInventorySettingsTab_module_css_default.details,
												children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("dt", { children: t("configuration") }), (0, react_jsx_runtime.jsx)("dd", { children: configuration })] }), entry.enabled ? (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("dt", { children: t("cordis") }), (0, react_jsx_runtime.jsx)("dd", { children: status })] }) : null]
											}), (0, react_jsx_runtime.jsxs)("div", {
												style: { marginTop: 10, alignItems: "center", gap: 8, display: "flex" },
												children: [(0, react_jsx_runtime.jsx)("button", {
													type: "button",
													disabled: pending[entry.entryId] === true,
													onClick: () => togglePlugin(entry.entryId, !entry.enabled),
													style: { font: "inherit", cursor: "pointer", border: "1px solid var(--dsw-alias-border-l2)", color: "var(--dsw-alias-label-primary)", background: "transparent", borderRadius: 6, padding: "4px 12px", fontSize: 12 },
													children: pending[entry.entryId] === true ? t("saving") : t(entry.enabled ? "disable" : "enable")
												}), (0, react_jsx_runtime.jsx)("span", {
													style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 12 },
													children: t("restartHint")
												})]
											})]
										}) : null]
									}, entry.entryId);
								})
							}) : null
						]
					}) : null
				]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** Copy dictionaries for the plugin inventory Settings section. */
		/** Simplified Chinese dictionary and key source of truth. */
		const zh = {
			tab: "插件列表",
			loading: "正在读取插件…",
			error: "暂时无法读取插件。",
			retry: "重试",
			search: "搜索插件",
			catalog: "插件列表",
			empty: "暂无插件。",
			emptySearch: "没有匹配的插件。",
			enabledTag: "已启用",
			disabledTag: "已停用",
			enable: "启用",
			disable: "停用",
			saving: "保存中…",
			restartHint: "重启后生效",
			marketplaceTab: "插件商城",
			"marketplace.search": "搜索插件",
			"marketplace.install": "安装",
			"marketplace.remove": "卸载",
			"marketplace.customPlaceholder": "npm 包名 / github:user/repo",
			"marketplace.subscribe": "订阅库",
			"marketplace.subscribePlaceholder": "GitHub 仓库，如 user/repo，或完整 URL",
			configuration: "配置状态",
			cordis: "Cordis 状态",
			unobserved: "未挂载",
			pending: "等待依赖",
			loadingPhase: "加载中",
			active: "已挂载",
			failed: "挂载失败",
			unloading: "卸载中"
		};
		/** English dictionary checked against the Chinese key set. */
		const en = {
			tab: "Plugin list",
			loading: "Reading plugins…",
			error: "Plugins are temporarily unavailable.",
			retry: "Retry",
			search: "Search plugins",
			catalog: "Plugin list",
			empty: "No plugins are available.",
			emptySearch: "No matching plugins.",
			enabledTag: "Enabled",
			disabledTag: "Disabled",
			enable: "Enable",
			disable: "Disable",
			saving: "Saving…",
			restartHint: "Takes effect after restart",
			marketplaceTab: "Marketplace",
			"marketplace.search": "Search plugins",
			"marketplace.install": "Install",
			"marketplace.remove": "Remove",
			"marketplace.customPlaceholder": "npm package / github:user/repo",
			"marketplace.subscribe": "Subscribe",
			"marketplace.subscribePlaceholder": "GitHub repo, e.g. user/repo, or full URL",
			configuration: "Configuration",
			cordis: "Cordis status",
			unobserved: "Not mounted",
			pending: "Waiting for dependencies",
			loadingPhase: "Loading",
			active: "Mounted",
			failed: "Mount failed",
			unloading: "Unloading"
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Read-only Host plugin inventory registered into Web Settings. */
		/** Dictionary namespace owned by this plugin. */
		const NS = "settings.pluginInventory";
		/** Services required by the Settings registration and generated Remote face. */
		const inject = [
			"slots",
			"locale",
			"remote",
			"remote.pluginInventory"
		];
		/** Native plugin marketplace tab: lists subscribed registries and their
		* merged plugin catalog, with one-click install/remove through the Electron
		* bridge on :3091. Rendered with the same primitives as the inventory list. */
		function MarketplaceTab({ t }) {
			const API = "http://127.0.0.1:3091";
			const [registries, setRegistries] = (0, react.useState)([]);
			const [plugins, setPlugins] = (0, react.useState)([]);
			const [installed, setInstalled] = (0, react.useState)([]);
			const [query, setQuery] = (0, react.useState)("");
			const [customSpec, setCustomSpec] = (0, react.useState)("");
			const [subscribeUrl, setSubscribeUrl] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)({});
			const [log, setLog] = (0, react.useState)("");
			const api = (path, options) => fetch(API + path, {
				headers: { "Content-Type": "application/json" },
				...options
			}).then(async (r) => {
				const data = await r.json().catch(() => ({}));
				if (!r.ok && data.error) throw new Error(data.error);
				return data;
			});
			const refresh = async () => {
				try {
					const [regs, inst] = await Promise.all([api("/registries"), api("/plugins/installed")]);
					setRegistries(regs.registries || []);
					setPlugins(regs.plugins || []);
					setInstalled(inst.installed || []);
				} catch {}
			};
			(0, react.useEffect)(() => {
				refresh();
			}, []);
			const isInstalled = (spec) => installed.some((p) => spec === p || spec.endsWith("/" + p) || spec === "github:" + p);
			const poll = async (jobId) => {
				while (true) {
					await new Promise((r) => setTimeout(r, 800));
					const job = await api("/plugins/install/" + jobId);
					if (job.status === "done" || job.status === "failed") return job;
				}
			};
			const run = async (action, spec) => {
				setBusy((b) => ({ ...b, [spec]: true }));
				try {
					const { jobId } = await api(action === "add" ? "/plugins/install" : "/plugins/remove", { method: "POST", body: JSON.stringify({ spec }) });
					const job = await poll(jobId);
					setLog(job.status === "done" ? "✓ " + spec + " " + (action === "add" ? "已安装" : "已卸载") : "✗ " + spec + "\n" + job.output);
					await refresh();
				} catch (err) {
					setLog("✗ " + err.message);
				}
				setBusy((b) => ({ ...b, [spec]: false }));
			};
			const subscribe = async (url) => {
				try {
					await api("/registries/subscribe", { method: "POST", body: JSON.stringify({ url }) });
					setLog("✓ 已订阅 " + url);
					await refresh();
				} catch (err) {
					setLog("✗ " + err.message);
				}
			};
			const unsubscribe = async (url) => {
				try {
					await api("/registries/unsubscribe", { method: "POST", body: JSON.stringify({ url }) });
					setLog("✓ 已取消订阅 " + url);
					await refresh();
				} catch (err) {
					setLog("✗ " + err.message);
				}
			};
			const q = query.trim().toLowerCase();
			const filtered = plugins.filter((p) => !q || [p.title, p.name, p.description, p.install].some((v) => (v || "").toLowerCase().includes(q)));
			return (0, react_jsx_runtime.jsxs)("div", {
				style: { display: "flex", flexDirection: "column", gap: 12 },
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						style: { display: "flex", gap: 8 },
						children: [(0, react_jsx_runtime.jsx)("input", {
							type: "search",
							value: query,
							placeholder: t("marketplace.search"),
							style: { flex: 1, padding: "8px 12px", border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)", borderRadius: 8, fontSize: 13 },
							onChange: (e) => {
								setQuery(e.target.value);
							}
						}), (0, react_jsx_runtime.jsx)("input", {
							value: customSpec,
							placeholder: t("marketplace.customPlaceholder"),
							style: { flex: 1.2, padding: "8px 12px", border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)", borderRadius: 8, fontSize: 13 },
							onChange: (e) => {
								setCustomSpec(e.target.value);
							}
						}), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: !customSpec.trim(),
							onClick: () => {
								const spec = customSpec.trim();
								if (spec) run("add", spec);
							},
							style: { padding: "8px 14px", borderRadius: 8, border: "1px solid var(--dsw-alias-brand-primary)", background: "var(--dsw-alias-brand-primary)", color: "var(--dsw-alias-label-primary-invert, #fff)", cursor: "pointer" },
							children: t("marketplace.install")
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: { display: "flex", flexWrap: "wrap", gap: 8 },
						children: registries.map((reg) => (0, react_jsx_runtime.jsxs)("span", {
							style: { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 999, fontSize: 12, color: "var(--dsw-alias-label-secondary)" },
							children: [reg.error ? "⚠ " + (reg.title || reg.url) : (reg.title || reg.name || reg.url), reg.source === "subscribed" ? (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									unsubscribe(reg.url);
								},
								style: { border: "none", background: "none", cursor: "pointer", color: "var(--dsw-alias-label-tertiary)", padding: 0, fontSize: 12 },
								children: "×"
							}) : null]
						}, reg.url || reg.name))
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: { display: "flex", gap: 8 },
						children: [(0, react_jsx_runtime.jsx)("input", {
							value: subscribeUrl,
							placeholder: t("marketplace.subscribePlaceholder"),
							style: { flex: 1, padding: "8px 12px", border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)", borderRadius: 8, fontSize: 13 },
							onChange: (e) => {
								setSubscribeUrl(e.target.value);
							}
						}), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: !subscribeUrl.trim(),
							onClick: () => {
								const url = subscribeUrl.trim();
								if (url) {
									subscribe(url);
									setSubscribeUrl("");
								}
							},
							style: { padding: "8px 14px", borderRadius: 8, border: "1px solid var(--dsw-alias-border-l2)", background: "transparent", color: "var(--dsw-alias-label-primary)", cursor: "pointer" },
							children: t("marketplace.subscribe")
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						style: { display: "flex", flexDirection: "column", gap: 8 },
						children: filtered.map((p) => {
							const inst = isInstalled(p.install);
							const b = busy[p.install] === true;
							return (0, react_jsx_runtime.jsxs)("div", {
								style: { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 10, background: "var(--dsw-alias-bg-layer-3)" },
								children: [(0, react_jsx_runtime.jsxs)("div", {
									style: { flex: 1, minWidth: 0 },
									children: [(0, react_jsx_runtime.jsx)("div", {
										style: { fontWeight: 600, fontSize: 14 },
										children: p.title || p.name
									}), (0, react_jsx_runtime.jsx)("div", {
										style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)", marginTop: 2 },
										children: p.description || ""
									}), (0, react_jsx_runtime.jsx)("code", {
										style: { fontSize: 11, color: "var(--dsw-alias-label-secondary)", background: "var(--dsw-alias-bg-module-platform)", borderRadius: 4, padding: "1px 6px", marginTop: 4, display: "inline-block" },
										children: p.install
									})]
								}), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: b,
									onClick: () => {
										run(inst ? "remove" : "add", p.install);
									},
									style: { padding: "5px 12px", borderRadius: 8, border: "1px solid " + (inst ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-brand-primary)"), background: "transparent", color: inst ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-brand-primary)", cursor: "pointer", fontSize: 12 },
									children: b ? "…" : inst ? t("marketplace.remove") : t("marketplace.install")
								})]
							}, p.install);
						})
					}),
					log ? (0, react_jsx_runtime.jsx)("pre", {
						style: { margin: 0, padding: "10px 12px", background: "#111827", color: "#d1d5db", borderRadius: 8, fontSize: 12, whiteSpace: "pre-wrap" },
						children: log
					}) : null
				]
			});
		}
		/** Contribute the lazy inventory tab to the Plugins settings section. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-settings-plugin-inventory: dictionaries");
			const t = ctx.locale.bind(NS);
			const list = async () => {
				const result = await ctx.remote.pluginInventory.list();
				if (!result.ok) throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`);
				return result.value;
			};
			const injected = () => ({ list });
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "all",
				order: 10,
				label: () => t("tab"),
				locale: NS,
				inject: injected
			}, PluginInventorySettingsTab));
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "marketplace",
				order: 20,
				label: () => t("marketplaceTab"),
				locale: NS,
				inject: () => ({})
			}, MarketplaceTab));
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map