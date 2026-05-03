const METADATA_KEYS = [
	"Artist",
	"Title",
	"Album",
	"Genre",
	"Station name",
	"Slogan",
	"Audio bit rate",
	"Audio component",
	"BER",
	"MER",
	"Format",
];

const state = {
	chosenFrequency: 88.5,
	currentProgram: "0",
	currentTag: "",
	currentInfo: null,
	activeSession: null,
	hasLame: false,
	isIOSDevice: /iPad|iPhone|iPod/i.test(navigator.userAgent),
	blockPlayback: false,
	playing: false,
	pendingPlayback: false,
	playerTimeout: 30000,
	minTimeOut: 18000,
	blastIntervalMs: 3000,
	rtlTCP: "none",
	streamingFormat: "wav",
	serverVersion: "",
	bookmarkEditKey: "",
	bookmarkDraftName: "",
	bookmarkFeedbackMessage: "",
	bookmarkFeedbackTone: "",
	settingsFeedbackMessage: "",
	settingsFeedbackTone: "",
	playbackTimeoutId: 0,
	metadataIntervalId: 0,
	requestSerial: 0,
	statusMessage: "",
	statusTone: "neutral",
	lastErrorLog: "No recent playback errors.",
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
	cacheElements();
	hydrateSettings();
	bindEvents();
	registerMediaSession();
	render();
	void boot();
}

async function boot() {
	showStatus("Checking playback environment.", "neutral");
	await Promise.allSettled([checkLameSupport(), refreshActiveSession(), fetchServerVersion()]);
	enforceDeviceRules();
	render();

	if (state.blockPlayback) {
		showStatus("This iOS browser needs MP3 encoding on the server. Install lame to enable playback here.", "error");
		return;
	}

	if (!state.hasLame) {
		showStatus("WAV playback is ready. MP3 stays unavailable until the lame encoder is installed.", "neutral");
		return;
	}

	showStatus("Ready to tune.", "success");
}

function cacheElements() {
	Object.assign(els, {
		app: document.getElementById("app"),
		statusBanner: document.getElementById("statusBanner"),
		settingsButton: document.getElementById("settingsButton"),
		frequencyValue: document.getElementById("frequencyValue"),
		heroChips: document.getElementById("heroChips"),
		stationName: document.getElementById("stationName"),
		trackLine: document.getElementById("trackLine"),
		playToggle: document.getElementById("playToggle"),
		joinSessionButton: document.getElementById("joinSessionButton"),
		sessionSnapshot: document.getElementById("sessionSnapshot"),
		frequencySlider: document.getElementById("frequencySlider"),
		frequencyInput: document.getElementById("frequencyInput"),
		directTuneForm: document.getElementById("directTuneForm"),
		programList: document.getElementById("programList"),
		metadataGrid: document.getElementById("metadataGrid"),
		bookmarksButton: document.getElementById("bookmarksButton"),
		bookmarkChips: document.getElementById("bookmarkChips"),
		refreshSessionButton: document.getElementById("refreshSessionButton"),
		activeSessionCard: document.getElementById("activeSessionCard"),
		connectionCodec: document.getElementById("connectionCodec"),
		connectionTimeout: document.getElementById("connectionTimeout"),
		connectionSource: document.getElementById("connectionSource"),
		errorLog: document.getElementById("errorLog"),
		serverVersion: document.getElementById("serverVersion"),
		stickyPlayer: document.getElementById("stickyPlayer"),
		stickyTitle: document.getElementById("stickyTitle"),
		stickyMeta: document.getElementById("stickyMeta"),
		audio: document.getElementById("audioPlayer"),
		bookmarksDialog: document.getElementById("bookmarksDialog"),
		bookmarkHint: document.getElementById("bookmarkHint"),
		saveCurrentBookmark: document.getElementById("saveCurrentBookmark"),
		bookmarkCount: document.getElementById("bookmarkCount"),
		bookmarkList: document.getElementById("bookmarkList"),
		bookmarkFeedback: document.getElementById("bookmarkFeedback"),
		addBookmarkForm: document.getElementById("addBookmarkForm"),
		settingsDialog: document.getElementById("settingsDialog"),
		streamingFormatGroup: document.getElementById("streamingFormatGroup"),
		formatHint: document.getElementById("formatHint"),
		connectionForm: document.getElementById("connectionForm"),
		rtlInput: document.getElementById("rtlInput"),
		timeoutInput: document.getElementById("timeoutInput"),
		exportSettingsButton: document.getElementById("exportSettingsButton"),
		importSettingsForm: document.getElementById("importSettingsForm"),
		importKeyInput: document.getElementById("importKeyInput"),
		settingsFeedback: document.getElementById("settingsFeedback"),
		settingsServerVersion: document.getElementById("settingsServerVersion"),
		settingsEncoderState: document.getElementById("settingsEncoderState"),
		liveRegion: document.getElementById("liveRegion"),
	});
}

function hydrateSettings() {
	const storedTimeout = Number.parseInt(localStorage.getItem("playerTimeout") || "", 10);
	if (Number.isFinite(storedTimeout) && storedTimeout >= state.minTimeOut) {
		state.playerTimeout = storedTimeout;
	}

	const storedRtlTCP = (localStorage.getItem("rtlTCP") || "none").trim();
	state.rtlTCP = storedRtlTCP || "none";

	const storedFormat = localStorage.getItem("streamingFormat");
	if (storedFormat === "wav" || storedFormat === "mp3") {
		state.streamingFormat = storedFormat;
	}

	if (state.isIOSDevice) {
		state.streamingFormat = "mp3";
	}

	persistCoreSettings();
}

function bindEvents() {
	els.settingsButton.addEventListener("click", openSettingsDialog);
	els.bookmarksButton.addEventListener("click", openBookmarksDialog);
	els.playToggle.addEventListener("click", () => {
		void togglePrimaryPlayback();
	});
	els.joinSessionButton.addEventListener("click", () => {
		void joinActiveSession();
	});
	els.refreshSessionButton.addEventListener("click", () => {
		void refreshActiveSession(true);
	});

	els.frequencySlider.addEventListener("input", (event) => {
		setChosenFrequency(event.target.value);
	});

	els.directTuneForm.addEventListener("submit", (event) => {
		event.preventDefault();
		setChosenFrequency(els.frequencyInput.value);
	});

	document.querySelectorAll("[data-frequency-step]").forEach((button) => {
		button.addEventListener("click", () => {
			const delta = Number.parseFloat(button.dataset.frequencyStep || "0");
			setChosenFrequency(state.chosenFrequency + delta);
		});
	});

	els.programList.addEventListener("click", (event) => {
		const target = event.target.closest("[data-program]");
		if (!target) {
			return;
		}

		const nextProgram = target.dataset.program || "0";
		if (nextProgram === state.currentProgram && state.playing) {
			return;
		}

		void startStreamPlayback(currentPlayableFrequency(), nextProgram);
	});

	els.bookmarkChips.addEventListener("click", (event) => {
		const target = event.target.closest("[data-bookmark-key]");
		if (!target) {
			return;
		}

		void playBookmark(target.dataset.bookmarkKey || "");
	});

	els.saveCurrentBookmark.addEventListener("click", saveCurrentBookmark);
	els.addBookmarkForm.addEventListener("submit", (event) => {
		event.preventDefault();
		void addBookmarkFromForm();
	});
	els.bookmarkList.addEventListener("click", handleBookmarkListClick);
	els.bookmarkList.addEventListener("input", handleBookmarkListInput);

	els.streamingFormatGroup.addEventListener("click", handleStreamingFormatClick);
	els.connectionForm.addEventListener("submit", (event) => {
		event.preventDefault();
		saveConnectionSettings();
	});
	els.exportSettingsButton.addEventListener("click", () => {
		void exportSettings();
	});
	els.importSettingsForm.addEventListener("submit", (event) => {
		event.preventDefault();
		void importSettings();
	});

	els.audio.addEventListener("playing", handleAudioPlaying);
	els.audio.addEventListener("ended", handleAudioEnded);
	els.audio.addEventListener("error", handleAudioError);

	document.querySelectorAll("[data-close-dialog]").forEach((button) => {
		button.addEventListener("click", () => {
			const dialog = document.getElementById(button.dataset.closeDialog || "");
			if (dialog) {
				closeDialog(dialog);
			}
		});
	});

	[els.bookmarksDialog, els.settingsDialog].forEach((dialog) => {
		dialog.addEventListener("click", (event) => {
			const bounds = dialog.getBoundingClientRect();
			const inside =
				event.clientX >= bounds.left &&
				event.clientX <= bounds.right &&
				event.clientY >= bounds.top &&
				event.clientY <= bounds.bottom;
			if (!inside) {
				closeDialog(dialog);
			}
		});
	});
}

function render() {
	els.app.classList.toggle("is-playing", state.playing);
	els.app.classList.toggle("is-pending", state.pendingPlayback && !state.playing);

	renderStatus();
	renderHero();
	renderPrograms();
	renderMetadata();
	renderBookmarks();
	renderSession();
	renderUtility();
	renderStickyPlayer();
	updatePageTitle();
	updateMediaSession();

	if (els.bookmarksDialog.open) {
		renderBookmarksDialog();
	}
}

function renderStatus() {
	if (!state.statusMessage) {
		els.statusBanner.className = "status-banner";
		els.statusBanner.textContent = "";
		return;
	}

	els.statusBanner.className = `status-banner is-visible is-${state.statusTone}`;
	els.statusBanner.textContent = state.statusMessage;
}

function renderHero() {
	const info = state.currentInfo || {};
	const displayFrequency = info.freq || state.chosenFrequency;
	const liveProgram = Number.parseInt(info.programIndex ?? state.currentProgram, 10);
	const joinIsCurrent = Boolean(state.playing && state.activeSession && state.activeSession.tag === state.currentTag);
	const heroChips = [];

	if (Number.isFinite(liveProgram)) {
		heroChips.push({ label: `HD${liveProgram + 1}`, tone: "accent" });
	}

	if (state.playing) {
		heroChips.push({ label: "Live", tone: "live" });
	} else if (state.pendingPlayback) {
		heroChips.push({ label: "Connecting", tone: "accent" });
	} else if (state.blockPlayback) {
		heroChips.push({ label: "Blocked", tone: "error" });
	} else {
		heroChips.push({ label: "Standby", tone: "neutral" });
	}

	heroChips.push({ label: state.streamingFormat.toUpperCase(), tone: "neutral" });
	heroChips.push({
		label: state.rtlTCP === "none" ? "Local SDR" : `rtl_tcp ${state.rtlTCP}`,
		tone: "neutral",
	});
	heroChips.push({ label: `${Math.round(state.playerTimeout / 1000)}s timeout`, tone: "neutral" });

	els.frequencyValue.textContent = formatFrequency(displayFrequency);
	els.heroChips.innerHTML = heroChips.map(renderChip).join("");
	els.stationName.textContent =
		info["Station name"] ||
		info.Slogan ||
		(state.pendingPlayback ? "Waiting for live audio…" : "Tune across the HD FM band.");
	els.trackLine.textContent = buildTrackLine();
	els.sessionSnapshot.textContent = buildSessionSnapshot();

	if (state.pendingPlayback) {
		els.playToggle.textContent = "Connecting…";
	} else if (state.playing) {
		els.playToggle.textContent = "Stop listening";
	} else {
		els.playToggle.textContent = `Play ${formatFrequency(state.chosenFrequency)} FM`;
	}

	els.playToggle.classList.toggle("is-danger", state.playing || state.pendingPlayback);
	els.playToggle.disabled = state.blockPlayback;
	els.joinSessionButton.disabled =
		state.blockPlayback ||
		state.pendingPlayback ||
		!state.activeSession ||
		joinIsCurrent;
	els.joinSessionButton.textContent = joinIsCurrent
		? "Current session live"
		: state.activeSession
			? `Join ${formatFrequency(state.activeSession.freq)} FM`
			: "Join active session";

	els.frequencySlider.value = formatFrequency(state.chosenFrequency);
	els.frequencyInput.value = formatFrequency(state.chosenFrequency);
}

function renderPrograms() {
	const activeProgram = Number.parseInt(state.currentInfo?.programIndex ?? state.currentProgram, 10) || 0;
	const detectedPrograms = Math.max(
		Number.parseInt(state.currentInfo?.SIGCT ?? "0", 10) || 0,
		activeProgram + 1,
		1,
	);

	const markup = Array.from({ length: detectedPrograms }, (_, index) => {
		const activeClass = index === activeProgram ? " is-active" : "";
		return `<button class="program-pill${activeClass}" type="button" data-program="${index}">HD${index + 1}</button>`;
	});

	els.programList.innerHTML = markup.join("");
}

function renderMetadata() {
	if (!state.currentInfo) {
		els.metadataGrid.innerHTML =
			'<div class="metadata-empty">Start playback to see station, artist, title, bitrate, and signal details.</div>';
		return;
	}

	const cards = METADATA_KEYS.filter((key) => state.currentInfo[key] !== undefined && state.currentInfo[key] !== "")
		.map((key) => {
			return `<article class="meta-card"><span>${escapeHtml(key)}</span><strong>${escapeHtml(state.currentInfo[key])}</strong></article>`;
		})
		.join("");

	els.metadataGrid.innerHTML = cards || '<div class="metadata-empty">Live stream metadata is still coming in.</div>';
}

function renderBookmarks() {
	const bookmarks = getBookmarks();
	if (!bookmarks.length) {
		els.bookmarkChips.innerHTML = '<p class="empty-inline">No saved stations yet.</p>';
	} else {
		els.bookmarkChips.innerHTML = bookmarks.slice(0, 6).map((bookmark) => {
			return `<button class="bookmark-chip" type="button" data-bookmark-key="${escapeHtml(bookmark.key)}">${escapeHtml(bookmark.name)}</button>`;
		}).join("");
	}

	if (els.bookmarksDialog.open) {
		renderBookmarksDialog();
	}
}

function renderBookmarksDialog() {
	const bookmarks = getBookmarks();
	const currentKey = buildCurrentBookmarkKey();
	const currentLabel = localStorage.getItem(currentKey);

	els.bookmarkCount.textContent = String(bookmarks.length);
	els.bookmarkHint.textContent = currentLabel
		? `This station is already saved as ${currentLabel}.`
		: `Save ${formatFrequency(currentPlayableFrequency())} FM on HD${Number.parseInt(state.currentInfo?.programIndex ?? state.currentProgram, 10) + 1}.`;
	els.saveCurrentBookmark.disabled = state.blockPlayback;

	if (!bookmarks.length) {
		els.bookmarkList.innerHTML = '<p class="empty-inline">No saved bookmarks yet.</p>';
	} else {
		els.bookmarkList.innerHTML = bookmarks.map((bookmark) => renderBookmarkRow(bookmark)).join("");
	}

	applyHelperState(els.bookmarkFeedback, state.bookmarkFeedbackMessage, state.bookmarkFeedbackTone);
}

function renderSession() {
	if (!state.activeSession) {
		els.activeSessionCard.innerHTML = "<strong>No active session</strong><p>Start playback on this device or join another browser when one is already live.</p>";
		return;
	}

	if (state.playing && state.activeSession.tag === state.currentTag) {
		els.activeSessionCard.innerHTML = `<strong>This browser is live on ${escapeHtml(formatFrequency(state.activeSession.freq))} FM</strong><p>Other devices can join the current stream without retuning the SDR.</p>`;
		return;
	}

	els.activeSessionCard.innerHTML = `<strong>${escapeHtml(formatFrequency(state.activeSession.freq))} FM is live on the network</strong><p>Use the join action to attach to the current session without restarting the backend stream.</p>`;
}

function renderUtility() {
	els.connectionCodec.textContent = state.streamingFormat.toUpperCase();
	els.connectionTimeout.textContent = `${Math.round(state.playerTimeout / 1000)}s`;
	els.connectionSource.textContent = state.rtlTCP === "none" ? "Local SDR" : state.rtlTCP;
	els.errorLog.textContent = state.lastErrorLog;
	els.serverVersion.textContent = state.serverVersion || "Checking…";
}

function renderSettingsDialog() {
	Array.from(els.streamingFormatGroup.querySelectorAll("[data-format]")).forEach((button) => {
		const format = button.dataset.format;
		const unavailableMp3 = format === "mp3" && !state.hasLame;
		const unavailableWav = format === "wav" && state.isIOSDevice;
		button.classList.toggle("is-active", format === state.streamingFormat);
		button.disabled = unavailableMp3 || unavailableWav;
	});

	if (state.isIOSDevice) {
		els.formatHint.textContent = state.hasLame
			? "iOS playback runs through MP3 streams generated on the server."
			: "This iOS browser needs the server-side MP3 encoder before playback can start.";
	} else if (!state.hasLame) {
		els.formatHint.textContent = "No MP3 encoder detected. WAV is the only available streaming format right now.";
	} else {
		els.formatHint.textContent = "WAV gives the cleanest audio. MP3 is useful on lower bandwidth links and iOS clients.";
	}

	els.rtlInput.value = state.rtlTCP;
	els.timeoutInput.value = String(state.playerTimeout);
	els.settingsServerVersion.textContent = state.serverVersion || "Checking…";
	els.settingsEncoderState.textContent = state.hasLame ? "MP3 ready" : "WAV only";
	applyHelperState(els.settingsFeedback, state.settingsFeedbackMessage, state.settingsFeedbackTone);
}

function renderStickyPlayer() {
	const hasSource = Boolean(els.audio.getAttribute("src"));
	els.stickyPlayer.classList.toggle("is-hidden", !hasSource);
	if (!hasSource) {
		return;
	}

	els.stickyTitle.textContent =
		state.currentInfo?.Title ||
		state.currentInfo?.["Station name"] ||
		`${formatFrequency(currentPlayableFrequency())} FM`;
	els.stickyMeta.textContent = state.pendingPlayback
		? "Waiting for playback to start."
		: state.currentInfo?.Artist ||
			state.currentInfo?.Genre ||
			(state.currentInfo?.["Station name"] || "Live HD FM stream");
}

function openBookmarksDialog() {
	state.bookmarkFeedbackMessage = "";
	state.bookmarkFeedbackTone = "";
	renderBookmarksDialog();
	openDialog(els.bookmarksDialog);
}

function openSettingsDialog() {
	state.settingsFeedbackMessage = "";
	state.settingsFeedbackTone = "";
	renderSettingsDialog();
	openDialog(els.settingsDialog);
}

function openDialog(dialog) {
	if (!dialog || dialog.open) {
		return;
	}
	if (typeof dialog.showModal === "function") {
		dialog.showModal();
		return;
	}
	dialog.setAttribute("open", "open");
}

function closeDialog(dialog) {
	if (!dialog || !dialog.open) {
		return;
	}
	if (typeof dialog.close === "function") {
		dialog.close();
		return;
	}
	dialog.removeAttribute("open");
}

async function togglePrimaryPlayback() {
	if (state.pendingPlayback || state.playing) {
		await stopPlayback(true, true);
		showStatus("Playback stopped.", "neutral");
		return;
	}

	await startStreamPlayback(state.chosenFrequency, state.currentProgram);
}

async function startStreamPlayback(frequency, program) {
	if (state.blockPlayback) {
		showStatus("Playback is blocked on this device until the MP3 encoder is available on the server.", "error");
		return;
	}

	const requestId = ++state.requestSerial;
	const tunedFrequency = formatFrequency(frequency);
	const tunedProgram = String(program || "0");

	clearPlaybackState(true);
	await safeStopRequest();

	if (requestId !== state.requestSerial) {
		return;
	}

	state.pendingPlayback = true;
	state.currentProgram = tunedProgram;
	state.chosenFrequency = Number.parseFloat(tunedFrequency);
	showStatus(`Connecting to ${tunedFrequency} FM.`, "neutral");
	render();

	const streamUrl = `./getStream?freq=${encodeURIComponent(tunedFrequency)}&rtl_tcp=${encodeURIComponent(state.rtlTCP)}&ran=${encodeURIComponent(randomToken())}&program=${encodeURIComponent(tunedProgram)}&format=${encodeURIComponent(state.streamingFormat)}`;

	try {
		const tag = (await fetchText(streamUrl)).trim();
		if (requestId !== state.requestSerial) {
			return;
		}

		if (!tag || tag.startsWith("Error:")) {
			throw new Error(tag || `Playback failed on ${tunedFrequency} FM.`);
		}

		state.currentTag = tag;
		armPlaybackWatchdog(tunedFrequency);
		await attachAudioSource(tag);
		await pollMetadata(true);
		void refreshActiveSession();
	} catch (error) {
		await handlePlaybackFailure(error.message || `Playback failed on ${tunedFrequency} FM.`);
	}
}

async function joinActiveSession() {
	if (!state.activeSession) {
		showStatus("No active session is available right now.", "neutral");
		return;
	}

	if (state.blockPlayback) {
		showStatus("Playback is blocked on this iOS device until MP3 encoding is available on the server.", "error");
		return;
	}

	const requestId = ++state.requestSerial;
	clearPlaybackState(true);
	state.pendingPlayback = true;
	state.currentTag = state.activeSession.tag;
	state.chosenFrequency = Number.parseFloat(formatFrequency(state.activeSession.freq));
	showStatus(`Joining ${formatFrequency(state.activeSession.freq)} FM.`, "neutral");
	render();

	try {
		armPlaybackWatchdog(state.activeSession.freq);
		await attachAudioSource(state.activeSession.tag);
		if (requestId === state.requestSerial) {
			await pollMetadata(true);
		}
	} catch (error) {
		await handlePlaybackFailure(error.message || "Unable to join the active session.");
	}
}

async function playBookmark(key) {
	const bookmark = parseBookmarkKey(key);
	if (!bookmark) {
		return;
	}
	await startStreamPlayback(bookmark.freq, bookmark.program);
}

async function attachAudioSource(tag) {
	els.audio.src = `./getAudio?tag=${encodeURIComponent(tag)}&r=${encodeURIComponent(randomToken())}`;
	els.audio.load();
	try {
		await els.audio.play();
	} catch (error) {
		showStatus("Autoplay is blocked. Use the transport controls below to start the live stream.", "neutral");
	}
	render();
}

function handleAudioPlaying() {
	clearTimeout(state.playbackTimeoutId);
	state.pendingPlayback = false;
	state.playing = true;
	startMetadataPolling();
	showStatus(`Playing ${formatFrequency(currentPlayableFrequency())} FM.`, "success");
	render();
	void refreshActiveSession();
}

function handleAudioEnded() {
	if (!state.currentTag && !state.playing && !state.pendingPlayback) {
		return;
	}
	clearPlaybackState(false);
	showStatus("The live stream ended.", "neutral");
	render();
	void refreshActiveSession();
}

function handleAudioError() {
	if (!state.currentTag && !state.pendingPlayback && !state.playing) {
		return;
	}
	void handlePlaybackFailure("The audio stream could not be played.");
}

function armPlaybackWatchdog(frequency) {
	clearTimeout(state.playbackTimeoutId);
	state.playbackTimeoutId = window.setTimeout(() => {
		void handlePlaybackFailure(`Playback failed on ${frequency} FM.`);
	}, state.playerTimeout);
}

function startMetadataPolling() {
	clearInterval(state.metadataIntervalId);
	state.metadataIntervalId = window.setInterval(() => {
		void pollMetadata(false);
	}, state.blastIntervalMs);
}

async function pollMetadata(isInitialPass) {
	if (!state.currentTag) {
		return;
	}

	const activeTag = state.currentTag;
	try {
		const info = await fetchJSON(`./getInfo?tag=${encodeURIComponent(activeTag)}&rando=${encodeURIComponent(randomToken())}`);
		if (!info || activeTag !== state.currentTag) {
			return;
		}

		state.currentInfo = info;
		if (info.freq !== undefined) {
			state.chosenFrequency = Number.parseFloat(formatFrequency(info.freq));
		}
		if (info.programIndex !== undefined) {
			state.currentProgram = String(info.programIndex);
		}
		render();
	} catch (error) {
		if (isInitialPass) {
			showStatus("Playback started. Live metadata is still loading.", "neutral");
		}
	}
}

async function stopPlayback(sendStop, clearInfo) {
	clearPlaybackState(clearInfo);
	if (sendStop) {
		await safeStopRequest();
	}
	render();
	void refreshActiveSession();
}

function clearPlaybackState(clearInfo) {
	clearTimeout(state.playbackTimeoutId);
	clearInterval(state.metadataIntervalId);
	state.playing = false;
	state.pendingPlayback = false;
	state.currentTag = "";
	if (clearInfo) {
		state.currentInfo = null;
	}
	try {
		els.audio.pause();
	} catch (error) {
		// no-op
	}
	els.audio.removeAttribute("src");
	els.audio.load();
}

async function handlePlaybackFailure(message) {
	clearPlaybackState(false);
	await safeStopRequest();
	const errLog = await fetchText(`./getErrMsg?r=${encodeURIComponent(randomToken())}`).catch(() => "");
	state.lastErrorLog = errLog || message;
	showStatus(message, "error");
	render();
	await refreshActiveSession();
}

async function refreshActiveSession(announce) {
	try {
		const payload = (await fetchText(`./whatsGoinOn?rand=${encodeURIComponent(randomToken())}`)).trim();
		if (!payload || payload === "No_Active_Tags") {
			state.activeSession = null;
		} else {
			state.activeSession = JSON.parse(payload);
		}
		renderSession();
		renderHero();
		if (announce) {
			showStatus(state.activeSession ? `Active session found on ${formatFrequency(state.activeSession.freq)} FM.` : "No active session found.", "neutral");
		}
	} catch (error) {
		state.activeSession = null;
		if (announce) {
			showStatus("Unable to refresh the active session state.", "error");
		}
		renderSession();
	}
}

async function checkLameSupport() {
	const response = await fetchText(`./lameCheck?rand=${encodeURIComponent(randomToken())}`);
	state.hasLame = response.includes("OK");
	return state.hasLame;
}

async function fetchServerVersion() {
	state.serverVersion = (await fetchText(`./getVersion?ran=${encodeURIComponent(randomToken())}`)).trim();
	return state.serverVersion;
}

function enforceDeviceRules() {
	if (state.isIOSDevice) {
		state.streamingFormat = "mp3";
		state.blockPlayback = !state.hasLame;
	} else {
		state.blockPlayback = false;
		if (!state.hasLame && state.streamingFormat === "mp3") {
			state.streamingFormat = "wav";
		}
	}
	persistCoreSettings();
}

function handleStreamingFormatClick(event) {
	const target = event.target.closest("[data-format]");
	if (!target || target.disabled) {
		return;
	}

	state.streamingFormat = target.dataset.format || state.streamingFormat;
	persistCoreSettings();
	state.settingsFeedbackMessage = `Streaming format set to ${state.streamingFormat.toUpperCase()} for future sessions.`;
	state.settingsFeedbackTone = "success";
	render();
	renderSettingsDialog();
}

function saveConnectionSettings() {
	const timeoutValue = Number.parseInt(els.timeoutInput.value, 10);
	const rtlValue = (els.rtlInput.value || "none").trim() || "none";

	if (!Number.isFinite(timeoutValue) || timeoutValue < state.minTimeOut) {
		state.settingsFeedbackMessage = `Player timeout must be at least ${state.minTimeOut} milliseconds.`;
		state.settingsFeedbackTone = "error";
		renderSettingsDialog();
		return;
	}

	state.playerTimeout = timeoutValue;
	state.rtlTCP = rtlValue;
	persistCoreSettings();
	state.settingsFeedbackMessage = "Playback settings saved locally in this browser.";
	state.settingsFeedbackTone = "success";
	render();
	renderSettingsDialog();
}

async function exportSettings() {
	const payload = buildSettingsPayload();
	state.settingsFeedbackMessage = "Preparing Lace key…";
	state.settingsFeedbackTone = "";
	renderSettingsDialog();

	try {
		const response = await fetchJSON(`./checkSettings?token=${encodeURIComponent(randomToken())}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		if (response.status) {
			state.settingsFeedbackMessage = `Import artifacts on another device with Lace key ${response.lace}.`;
			state.settingsFeedbackTone = "success";
		} else {
			state.settingsFeedbackMessage = response.err || "Unable to export settings.";
			state.settingsFeedbackTone = "error";
		}
	} catch (error) {
		state.settingsFeedbackMessage = error.message || "Unable to export settings.";
		state.settingsFeedbackTone = "error";
	}

	renderSettingsDialog();
}

async function importSettings() {
	const laceKey = (els.importKeyInput.value || "").trim();
	if (!laceKey) {
		state.settingsFeedbackMessage = "Enter a Lace key before importing.";
		state.settingsFeedbackTone = "error";
		renderSettingsDialog();
		return;
	}

	state.settingsFeedbackMessage = "Importing settings…";
	state.settingsFeedbackTone = "";
	renderSettingsDialog();

	try {
		const formData = new FormData();
		formData.append("laceKey", laceKey);
		const response = await fetchJSON(`./import?token=${encodeURIComponent(randomToken())}`, {
			method: "POST",
			body: formData,
		});

		if (!response.status) {
			state.settingsFeedbackMessage = "Import failed. Check the Lace key and try again.";
			state.settingsFeedbackTone = "error";
			renderSettingsDialog();
			return;
		}

		let importedCount = 0;
		Object.keys(response).forEach((key) => {
			if (key === "status") {
				return;
			}
			localStorage.setItem(key, response[key]);
			importedCount += 1;
		});

		hydrateSettings();
		enforceDeviceRules();
		state.settingsFeedbackMessage = importedCount > 0 ? `Imported ${importedCount} artifacts into this browser.` : "Nothing was imported.";
		state.settingsFeedbackTone = importedCount > 0 ? "success" : "error";
		render();
		renderSettingsDialog();
	} catch (error) {
		state.settingsFeedbackMessage = error.message || "Import failed.";
		state.settingsFeedbackTone = "error";
		renderSettingsDialog();
	}
}

async function addBookmarkFromForm() {
	const formData = new FormData(els.addBookmarkForm);
	state.bookmarkFeedbackMessage = "Validating bookmark…";
	state.bookmarkFeedbackTone = "";
	renderBookmarksDialog();

	try {
		const response = await fetchJSON(`./valBookMark?token=${encodeURIComponent(randomToken())}`, {
			method: "POST",
			body: formData,
		});

		if (!response.status) {
			state.bookmarkFeedbackMessage = "Bookmark validation failed.";
			state.bookmarkFeedbackTone = "error";
			renderBookmarksDialog();
			return;
		}

		const key = `freq=${response.bFreq}&program=${response.Prog}`;
		if (localStorage.getItem(key)) {
			state.bookmarkFeedbackMessage = "Bookmark already exists.";
			state.bookmarkFeedbackTone = "error";
			renderBookmarksDialog();
			return;
		}

		localStorage.setItem(key, response.bukName);
		els.addBookmarkForm.reset();
		state.bookmarkFeedbackMessage = `Added ${response.bukName}.`;
		state.bookmarkFeedbackTone = "success";
		render();
	} catch (error) {
		state.bookmarkFeedbackMessage = error.message || "Unable to save bookmark.";
		state.bookmarkFeedbackTone = "error";
		renderBookmarksDialog();
	}
}

function saveCurrentBookmark() {
	const key = buildCurrentBookmarkKey();
	const label = buildCurrentBookmarkLabel();
	if (localStorage.getItem(key)) {
		state.bookmarkFeedbackMessage = `${localStorage.getItem(key)} is already saved.`;
		state.bookmarkFeedbackTone = "error";
		renderBookmarksDialog();
		return;
	}

	localStorage.setItem(key, label);
	state.bookmarkFeedbackMessage = `Saved ${label}.`;
	state.bookmarkFeedbackTone = "success";
	render();
}

function handleBookmarkListClick(event) {
	const actionTarget = event.target.closest("[data-action]");
	if (!actionTarget) {
		return;
	}

	const action = actionTarget.dataset.action;
	const key = actionTarget.dataset.key;
	if (!key) {
		return;
	}

	if (action === "play") {
		void playBookmark(key);
		closeDialog(els.bookmarksDialog);
		return;
	}

	if (action === "edit") {
		state.bookmarkEditKey = key;
		state.bookmarkDraftName = localStorage.getItem(key) || "";
		renderBookmarksDialog();
		return;
	}

	if (action === "cancel-edit") {
		state.bookmarkEditKey = "";
		state.bookmarkDraftName = "";
		renderBookmarksDialog();
		return;
	}

	if (action === "save-edit") {
		const nextName = state.bookmarkDraftName.trim();
		if (!nextName) {
			state.bookmarkFeedbackMessage = "Bookmark descriptions cannot be empty.";
			state.bookmarkFeedbackTone = "error";
			renderBookmarksDialog();
			return;
		}
		localStorage.setItem(key, nextName);
		state.bookmarkEditKey = "";
		state.bookmarkDraftName = "";
		state.bookmarkFeedbackMessage = "Bookmark updated.";
		state.bookmarkFeedbackTone = "success";
		render();
		return;
	}

	if (action === "delete") {
		if (!window.confirm(`Delete ${localStorage.getItem(key)}?`)) {
			return;
		}
		localStorage.removeItem(key);
		if (state.bookmarkEditKey === key) {
			state.bookmarkEditKey = "";
			state.bookmarkDraftName = "";
		}
		state.bookmarkFeedbackMessage = "Bookmark deleted.";
		state.bookmarkFeedbackTone = "success";
		render();
	}
}

function handleBookmarkListInput(event) {
	const input = event.target.closest("[data-bookmark-edit-input]");
	if (!input) {
		return;
	}
	state.bookmarkDraftName = input.value;
}

function setChosenFrequency(value) {
	state.chosenFrequency = Number.parseFloat(formatFrequency(value));
	if (!state.playing) {
		state.currentProgram = "0";
	}
	renderHero();
}

function buildTrackLine() {
	if (state.blockPlayback) {
		return "This iOS device needs server-side MP3 encoding before it can play the live radio stream.";
	}

	if (state.pendingPlayback) {
		return "Waiting for the SDR stream to lock and start emitting audio.";
	}

	if (state.currentInfo?.Artist || state.currentInfo?.Title) {
		const artist = state.currentInfo?.Artist || state.currentInfo?.["Station name"] || "";
		const title = state.currentInfo?.Title || state.currentInfo?.Genre || "HD Radio";
		return artist ? `${artist} • ${title}` : title;
	}

	if (state.currentInfo?.["Station name"]) {
		return `${state.currentInfo["Station name"]} • ${state.currentInfo.Genre || "Live HD FM stream"}`;
	}

	if (state.activeSession) {
		return `Another browser is already live on ${formatFrequency(state.activeSession.freq)} FM.`;
	}

	return "Use the live tuner, jump between HD subchannels, and keep your presets close.";
}

function buildSessionSnapshot() {
	if (state.playing && state.currentInfo) {
		return "Metadata refreshes automatically, and you can pin the active HD channel as a bookmark without leaving playback.";
	}

	if (state.pendingPlayback) {
		return "The player is waiting for the receiver to lock the station and expose the live audio stream.";
	}

	if (state.activeSession) {
		return `A session is already live on ${formatFrequency(state.activeSession.freq)} FM. Join it instantly or retune this browser.`;
	}

	return "Local playback keeps the same yellowShoes backend contract while the new client stays framework-free.";
}

function renderChip(chip) {
	const toneClass = chip.tone ? ` is-${chip.tone}` : "";
	return `<span class="chip${toneClass}">${escapeHtml(chip.label)}</span>`;
}

function renderBookmarkRow(bookmark) {
	if (bookmark.key === state.bookmarkEditKey) {
		return `
			<div class="bookmark-edit-card">
				<div class="bookmark-row-copy">
					<strong>${escapeHtml(bookmark.name)}</strong>
					<span class="bookmark-meta">${escapeHtml(formatFrequency(bookmark.freq))} FM · HD${Number.parseInt(bookmark.program, 10) + 1}</span>
					<label class="field-group">
						<span>Description</span>
						<input class="text-input" type="text" value="${escapeHtml(state.bookmarkDraftName)}" data-bookmark-edit-input="true">
					</label>
				</div>
				<div class="bookmark-row-actions">
					<button class="bookmark-action" type="button" data-action="save-edit" data-key="${escapeHtml(bookmark.key)}">Save</button>
					<button class="bookmark-action" type="button" data-action="cancel-edit" data-key="${escapeHtml(bookmark.key)}">Cancel</button>
				</div>
			</div>
		`;
	}

	return `
		<div class="bookmark-row">
			<div class="bookmark-row-copy">
				<strong>${escapeHtml(bookmark.name)}</strong>
				<span class="bookmark-meta">${escapeHtml(formatFrequency(bookmark.freq))} FM · HD${Number.parseInt(bookmark.program, 10) + 1}</span>
			</div>
			<div class="bookmark-row-actions">
				<button class="bookmark-action" type="button" data-action="play" data-key="${escapeHtml(bookmark.key)}">Play</button>
				<button class="bookmark-action" type="button" data-action="edit" data-key="${escapeHtml(bookmark.key)}">Edit</button>
				<button class="bookmark-action is-danger" type="button" data-action="delete" data-key="${escapeHtml(bookmark.key)}">Delete</button>
			</div>
		</div>
	`;
}

function buildCurrentBookmarkKey() {
	return `freq=${formatFrequency(currentPlayableFrequency())}&program=${state.currentInfo?.programIndex ?? state.currentProgram}`;
}

function buildCurrentBookmarkLabel() {
	const frequency = formatFrequency(currentPlayableFrequency());
	const program = state.currentInfo?.programIndex ?? state.currentProgram;
	const station = state.currentInfo?.["Station name"] || `yellowShoes ${frequency}`;
	const title = state.currentInfo?.Title;
	return title ? `${station} ${frequency} ${title} ${program}` : `${station} ${frequency} ${program}`;
}

function currentPlayableFrequency() {
	return state.currentInfo?.freq || state.chosenFrequency;
}

function getBookmarks() {
	return Object.keys(localStorage)
		.filter((key) => key.startsWith("freq=") && key.includes("&program="))
		.map((key) => {
			const parsed = parseBookmarkKey(key);
			return {
				key,
				freq: parsed ? parsed.freq : "88.5",
				program: parsed ? parsed.program : "0",
				name: localStorage.getItem(key) || key,
			};
		})
		.sort((left, right) => {
			const freqDelta = Number.parseFloat(left.freq) - Number.parseFloat(right.freq);
			if (freqDelta !== 0) {
				return freqDelta;
			}
			return Number.parseInt(left.program, 10) - Number.parseInt(right.program, 10);
		});
}

function parseBookmarkKey(key) {
	const [freqPart, programPart] = key.split("&");
	if (!freqPart || !programPart) {
		return null;
	}
	return {
		freq: freqPart.replace("freq=", ""),
		program: programPart.replace("program=", ""),
	};
}

function buildSettingsPayload() {
	const payload = {
		rtlTCP: state.rtlTCP,
		playerTimeout: String(state.playerTimeout),
		streamingFormat: state.streamingFormat,
	};

	getBookmarks().forEach((bookmark) => {
		payload[bookmark.key] = bookmark.name;
	});

	return payload;
}

function persistCoreSettings() {
	localStorage.setItem("rtlTCP", state.rtlTCP);
	localStorage.setItem("playerTimeout", String(state.playerTimeout));
	localStorage.setItem("streamingFormat", state.streamingFormat);
}

function applyHelperState(element, message, tone) {
	element.textContent = message || "";
	element.className = "helper-copy";
	if (tone) {
		element.classList.add(`is-${tone}`);
	}
}

function showStatus(message, tone) {
	state.statusMessage = message;
	state.statusTone = tone || "neutral";
	announce(message);
	renderStatus();
}

function announce(message) {
	els.liveRegion.textContent = message;
}

function updatePageTitle() {
	if (!state.playing || !state.currentInfo) {
		document.title = "yellowShoes";
		return;
	}

	const segments = [];
	if (state.currentInfo.Artist) {
		segments.push(state.currentInfo.Artist);
	}
	if (state.currentInfo.Title) {
		segments.push(state.currentInfo.Title);
	}
	if (state.currentInfo["Station name"]) {
		segments.push(`(${state.currentInfo["Station name"]})`);
	}
	const title = segments.join(" ").trim();
	document.title = title || "yellowShoes";
}

function registerMediaSession() {
	if (!("mediaSession" in navigator)) {
		return;
	}

	const handlers = {
		play: async () => {
			if (els.audio.getAttribute("src")) {
				try {
					await els.audio.play();
				} catch (error) {
					// no-op
				}
				return;
			}
			await togglePrimaryPlayback();
		},
		pause: async () => {
			await stopPlayback(true, false);
			showStatus("Playback stopped.", "neutral");
		},
		stop: async () => {
			await stopPlayback(true, false);
			showStatus("Playback stopped.", "neutral");
		},
	};

	Object.entries(handlers).forEach(([action, handler]) => {
		try {
			navigator.mediaSession.setActionHandler(action, handler);
		} catch (error) {
			// no-op
		}
	});
}

function updateMediaSession() {
	if (!("mediaSession" in navigator)) {
		return;
	}

	if (!state.playing && !state.pendingPlayback) {
		navigator.mediaSession.playbackState = "none";
		navigator.mediaSession.metadata = null;
		return;
	}

	const title = state.currentInfo?.Title || `${formatFrequency(currentPlayableFrequency())} FM`;
	const artist = state.currentInfo?.Artist || state.currentInfo?.["Station name"] || "yellowShoes";
	const album = state.currentInfo?.["Station name"] || "HD FM Radio";

	if ("MediaMetadata" in window) {
		navigator.mediaSession.metadata = new MediaMetadata({
			title,
			artist,
			album,
			artwork: [
				{
					src: "./assets/yellowShoes.jpg",
					sizes: "512x512",
					type: "image/jpeg",
				},
			],
		});
	}

	navigator.mediaSession.playbackState = state.playing ? "playing" : "paused";
}

async function safeStopRequest() {
	await fetchText(`./stop?ra=${encodeURIComponent(randomToken())}`).catch(() => "");
}

async function fetchText(url, options = {}) {
	const response = await fetch(url, {
		cache: "no-store",
		...options,
	});
	const text = await response.text();
	if (!response.ok && !text) {
		throw new Error(`Request failed with status ${response.status}`);
	}
	return text;
}

async function fetchJSON(url, options = {}) {
	const response = await fetch(url, {
		cache: "no-store",
		...options,
	});
	const text = await response.text();
	if (!response.ok && !text) {
		throw new Error(`Request failed with status ${response.status}`);
	}
	if (!text) {
		return {};
	}
	return JSON.parse(text);
}

function formatFrequency(value) {
	const numeric = Number.parseFloat(value);
	if (!Number.isFinite(numeric)) {
		return "88.5";
	}
	return clampFrequency(numeric).toFixed(1);
}

function clampFrequency(value) {
	return Math.min(108.0, Math.max(88.0, Math.round(value * 10) / 10));
}

function randomToken() {
	return `${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function escapeHtml(value) {
	return String(value ?? "").replace(/[&<>"']/g, (character) => {
		return {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;",
		}[character];
	});
}