const firebaseConfig = {
	apiKey: "AIzaSyAdUEAHg08-FheJjawYwIPRov4105qdG0o",
	authDomain: "createteamprogram.firebaseapp.com",
	databaseURL: "https://createteamprogram-default-rtdb.asia-southeast1.firebasedatabase.app",
	projectId: "createteamprogram",
	storageBucket: "createteamprogram.firebasestorage.app",
	messagingSenderId: "108758586522",
	appId: "1:108758586522:web:75386ff04fa79121a0bb23",
	measurementId: "G-N7D10Q7MNF"
};

let database = null;
let selected = { type: null, key: null };
let toastTimer = null;
let memberDraft = { people: [], inactivePeople: [] };
let constraintDraft = [];
let ruleDraft = [];
let reservationDraft = [];
let historyDraft = [];

const fieldIds = {
	key: 'fieldKey',
	membersPerTeam: 'fieldMembersPerTeam',
	genderBalanceEnabled: 'fieldGenderBalanceEnabled',
	maxTeamSizeEnabled: 'fieldMaxTeamSizeEnabled',
	weightBalanceEnabled: 'fieldWeightBalanceEnabled',
	createdAt: 'fieldCreatedAt',
	lastAccess: 'fieldLastAccess',
	password: 'fieldPassword',
	timestamp: 'fieldTimestamp'
};

const fieldEnabledByType = {
	profiles: {
		createdAt: false,
		lastAccess: false
	},
	users: {
		timestamp: false
	}
};

function getDbTimestamp() {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	const hh = String(now.getHours()).padStart(2, '0');
	const mm = String(now.getMinutes()).padStart(2, '0');
	const ss = String(now.getSeconds()).padStart(2, '0');
	return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function buildSyncTriggerPayload(type = 'all') {
	return {
		timestamp: getDbTimestamp(),
		tick: Date.now(),
		type
	};
}

function getSyncTriggerPath(type, key) {
	if (!key) {
		return '';
	}
	if (type === 'users') {
		return `users/${key}/syncTrigger`;
	}
	if (type === 'profiles') {
		return `profiles/${key}/syncTrigger`;
	}
	if (type === 'profile') {
		return `profile/${key}/syncTrigger`;
	}
	return '';
}

async function broadcastSyncTrigger(type, key, syncType = 'all') {
	if (!type || !key) {
		return;
	}
	const path = getSyncTriggerPath(type, key);
	if (!path) {
		return;
	}
	const payload = buildSyncTriggerPayload(syncType);
	await database.ref(path).set(payload);
}

function getSelectedTypePath(type, key) {
	if (!key) {
		return '';
	}
	if (type === 'users') {
		return `users/${key}`;
	}
	if (type === 'profiles') {
		return `profiles/${key}`;
	}
	return `${type}/${key}`;
}

async function savePayloadByType(type, key, payload) {
	if (!type || !key || !payload) {
		return;
	}
	const path = getSelectedTypePath(type, key);
	if (!path) {
		return;
	}
	await database.ref(path).update(payload);
}

function getEl(id) {
	return document.getElementById(id);
}

function showToast(message) {
	const toast = getEl('toast');
	toast.textContent = message;
	toast.classList.add('show');
	if (toastTimer) {
		clearTimeout(toastTimer);
	}
	toastTimer = setTimeout(() => {
		toast.classList.remove('show');
	}, 1800);
}

function initFirebase() {
	const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
	database = app.database();
}

function setButtonsEnabled(enabled) {
	getEl('saveBtn').disabled = !enabled;
	getEl('syncBtn').disabled = !enabled;
}

function normalizeMember(item, index) {
	return {
		id: typeof item?.id === 'number' ? item.id : index + 1,
		name: item?.name || '',
		gender: item?.gender === 'female' ? 'female' : 'male',
		weight: Number.isFinite(Number(item?.weight)) ? Number(item.weight) : 0
	};
}

function cloneMembers(data) {
	const people = Array.isArray(data?.people) ? data.people.map((item, index) => normalizeMember(item, index)) : [];
	const inactivePeople = Array.isArray(data?.inactivePeople) ? data.inactivePeople.map((item, index) => normalizeMember(item, index)) : [];
	memberDraft = { people, inactivePeople };
}

function normalizeConstraint(item) {
	if (Array.isArray(item)) {
		return {
			member1: String(item[0] ?? ''),
			member2: String(item[1] ?? '')
		};
	}
	if (item && typeof item === 'object') {
		return {
			member1: String(item.member1 ?? item.left ?? item.a ?? ''),
			member2: String(item.member2 ?? item.right ?? item.b ?? '')
		};
	}
	return { member1: '', member2: '' };
}

function normalizeName(name) {
	return String(name ?? '').trim().toLowerCase();
}

function normalizeProbability(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return 100;
	}
	return Math.min(100, Math.max(0, Math.round(parsed)));
}

function toList(value) {
	if (Array.isArray(value)) {
		return value;
	}
	if (value && typeof value === 'object') {
		return Object.values(value);
	}
	return [];
}

function buildMemberMaps(data) {
	const idToName = new Map();
	const nameToId = new Map();
	const allMembers = [
		...toList(data?.people),
		...toList(data?.inactivePeople)
	];
	allMembers.forEach((person) => {
		if (!person || typeof person !== 'object') {
			return;
		}
		const id = Number(person.id);
		const name = String(person.name ?? '').trim();
		if (Number.isInteger(id) && name) {
			idToName.set(id, name);
			nameToId.set(normalizeName(name), id);
		}
	});
	return { idToName, nameToId };
}

function mapConstraintValueToName(value, idToName) {
	const numberValue = Number(value);
	if (Number.isInteger(numberValue) && idToName.has(numberValue)) {
		return idToName.get(numberValue) || '';
	}
	return String(value ?? '');
}

function cloneConstraints(data) {
	const { idToName } = buildMemberMaps(data || {});
	const forbiddenPairs = toList(data?.forbiddenPairs);
	const pendingConstraints = toList(data?.pendingConstraints);
	const appliedRows = forbiddenPairs.map((item) => {
		const normalized = normalizeConstraint(item);
		return {
			member1: mapConstraintValueToName(normalized.member1, idToName),
			member2: mapConstraintValueToName(normalized.member2, idToName)
		};
	});
	const pendingRows = pendingConstraints.map((item) => normalizeConstraint(item));
	constraintDraft = [...appliedRows, ...pendingRows];
}

function cloneRules(data) {
	const hiddenGroupChains = toList(data?.hiddenGroupChains);
	const rows = [];
	hiddenGroupChains.forEach((chain) => {
		if (!chain || typeof chain !== 'object') {
			return;
		}
		const primary = String(chain.primary ?? '').trim();
		const candidates = toList(chain.candidates);
		candidates.forEach((candidate) => {
			const isObjectCandidate = candidate && typeof candidate === 'object';
			const member2 = String(isObjectCandidate ? candidate.name : candidate ?? '').trim();
			const probability = normalizeProbability(isObjectCandidate ? candidate.probability : 100);
			if (!member2) {
				return;
			}
			rows.push({ member1: primary, member2, probability });
		});
	});
	ruleDraft = rows.sort((a, b) => {
		const byMember1 = normalizeName(a.member1).localeCompare(normalizeName(b.member1), 'ko');
		if (byMember1 !== 0) {
			return byMember1;
		}
		return normalizeName(a.member2).localeCompare(normalizeName(b.member2), 'ko');
	});
}

function normalizeReservation(item) {
	if (Array.isArray(item)) {
		return item.map((name) => String(name ?? '').trim()).filter((name) => name.length > 0);
	}
	if (typeof item === 'string') {
		const text = item.trim();
		if (!text) {
			return [];
		}
		return text.split(',').map((name) => name.trim()).filter((name) => name.length > 0);
	}
	if (item && typeof item === 'object') {
		const names = toList(item.names ?? item.members ?? item.people);
		return names.map((name) => String(name ?? '').trim()).filter((name) => name.length > 0);
	}
	return [];
}

function cloneReservations(data) {
	const source = toList(data?.reservations);
	reservationDraft = source
		.map((item) => normalizeReservation(item))
		.filter((row) => row.length > 0);
}

function parseReservationText(text) {
	return String(text ?? '')
		.split(',')
		.map((name) => name.trim())
		.filter((name) => name.length > 0);
}

function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function getHistoryCreatedAt(entryKey, entry) {
	const createdAt = String(entry?.createdAt ?? '').trim();
	if (createdAt) {
		return createdAt;
	}
	const keyText = String(entryKey ?? '').trim();
	const match = keyText.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
	if (match) {
		return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
	}
	return keyText;
}

function normalizeHistoryTeams(value) {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.map((team) => {
		if (Array.isArray(team)) {
			return team.map((item) => String(item ?? '').trim()).filter((item) => item.length > 0);
		}
		const text = String(team ?? '').trim();
		return text ? [text] : [];
	}).filter((team) => team.length > 0);
}

function normalizeHistoryStrings(value, splitter = null) {
	if (Array.isArray(value)) {
		return value.map((item) => String(item ?? '').trim()).filter((item) => item.length > 0);
	}
	const text = String(value ?? '').trim();
	if (!text) {
		return [];
	}
	if (!splitter) {
		return [text];
	}
	return text.split(splitter).map((item) => item.trim()).filter((item) => item.length > 0);
}

function buildHistoryDetailLines(historyItem) {
	const lines = [];
	lines.push('[생성된 팀]');
	if (historyItem.teams.length) {
		historyItem.teams.forEach((team, index) => {
			lines.push(`${index + 1}팀: ${team.join(', ')}`);
		});
	} else {
		lines.push('없음');
	}

	if (historyItem.appliedReservation.length) {
		lines.push('');
		lines.push('[적용된 예약]');
		historyItem.appliedReservation.forEach((item) => {
			lines.push(`- ${item}`);
		});
	}

	if (historyItem.appliedRules.length) {
		lines.push('');
		lines.push('[적용된 규칙]');
		historyItem.appliedRules.forEach((item) => {
			lines.push(`- ${item}`);
		});
	}

	if (historyItem.appliedConstraints.length) {
		lines.push('');
		lines.push('[적용된 제약]');
		historyItem.appliedConstraints.forEach((item) => {
			lines.push(`- ${item}`);
		});
	}

	return lines.join('\n');
}

function cloneGenerateHistory(data) {
	const source = data?.generateHistory;
	if (!source || typeof source !== 'object') {
		historyDraft = [];
		return;
	}

	historyDraft = Object.entries(source).map(([entryKey, entry]) => {
		const createdAt = getHistoryCreatedAt(entryKey, entry || {});
		const teams = normalizeHistoryTeams(entry?.teams);
		const appliedReservation = normalizeHistoryStrings(entry?.appliedReservation, null);
		const appliedRules = normalizeHistoryStrings(entry?.appliedRules, '/');
		const appliedConstraints = normalizeHistoryStrings(entry?.appliedConstraints, '/');
		const detailText = buildHistoryDetailLines({
			teams,
			appliedReservation,
			appliedRules,
			appliedConstraints
		});
		const sortTime = Date.parse(createdAt.includes('T') ? createdAt : createdAt.replace(' ', 'T'));
		return {
			entryKey,
			createdAt,
			detailText,
			sortTime: Number.isFinite(sortTime) ? sortTime : Number.NEGATIVE_INFINITY
		};
	});

	historyDraft.sort((a, b) => {
		if (a.sortTime !== b.sortTime) {
			return a.sortTime - b.sortTime;
		}
		return String(a.entryKey).localeCompare(String(b.entryKey), 'ko');
	});
}

function renderGenerateHistoryTableRows() {
	const container = getEl('historyTableBody');
	if (!container) {
		return;
	}
	if (!historyDraft.length) {
		container.innerHTML = `<tr><td class="member-empty" colspan="1">데이터가 없습니다.</td></tr>`;
		return;
	}

	container.innerHTML = historyDraft.map((item, index) => {
		const detailHtml = escapeHtml(item.detailText).replace(/\n/g, '<br>');
		return `<tr class="history-summary-row" data-index="${index}">
			<td>
				<button class="history-toggle-btn" type="button" data-role="toggle-history" data-index="${index}" aria-expanded="false">
					<span class="history-chevron">▸</span>
					<span>${escapeHtml(item.createdAt)}</span>
				</button>
			</td>
		</tr>
		<tr class="history-detail-row" data-index="${index}" hidden>
			<td><div class="history-detail-content">${detailHtml}</div></td>
		</tr>`;
	}).join('');
}

function renderGenerateHistoryTable() {
	renderGenerateHistoryTableRows();
	refreshHistoryExpandButton();
	applyHistoryExpandedState();
}

function getGenderLabel(gender) {
	return gender === 'female' ? '♀️' : '♂️';
}

function updateMemberSummary() {
	const participantsCount = getEl('participantsCountText');
	const inactiveCount = getEl('inactiveCountText');
	if (participantsCount) {
		participantsCount.textContent = `${memberDraft.people.length}명`;
	}
	if (inactiveCount) {
		inactiveCount.textContent = `${memberDraft.inactivePeople.length}명`;
	}
}

function renderMemberTableRows(containerId, listKey) {
	const container = getEl(containerId);
	if (!container) {
		return;
	}
	const rows = memberDraft[listKey];
	if (!rows.length) {
		container.innerHTML = `<tr><td class="member-empty" colspan="5">데이터가 없습니다.</td></tr>`;
		return;
	}
	container.innerHTML = rows.map((person, index) => {
		return `<tr data-list="${listKey}" data-index="${index}">
			<td class="drag-cell" draggable="true" data-role="drag-handle" title="순서 변경"></td>
			<td><input class="member-input" type="text" data-role="name" value="${person.name.replace(/"/g, '&quot;')}"></td>
			<td><button class="gender-toggle-btn" type="button" data-role="gender">${getGenderLabel(person.gender)}</button></td>
			<td><input class="member-input" type="number" data-role="weight" min="0" step="1" value="${person.weight}"></td>
			<td><button class="member-delete-btn" type="button" data-role="delete" aria-label="삭제">×</button></td>
		</tr>`;
	}).join('');
}

function renderMemberTables() {
	renderMemberTableRows('participantsTableBody', 'people');
	renderMemberTableRows('inactiveTableBody', 'inactivePeople');
	updateMemberSummary();
	refreshMemberExpandButton();
	applyMemberExpandedState();
}

function renderConstraintTableRows() {
	const container = getEl('constraintTableBody');
	if (!container) {
		return;
	}
	if (!constraintDraft.length) {
		container.innerHTML = `<tr><td class="member-empty" colspan="4">데이터가 없습니다.</td></tr>`;
		return;
	}
	container.innerHTML = constraintDraft.map((item, index) => {
		const member1 = (item.member1 || '').replace(/"/g, '&quot;');
		const member2 = (item.member2 || '').replace(/"/g, '&quot;');
		return `<tr data-index="${index}">
			<td class="drag-cell" draggable="true" data-role="drag-handle" title="순서 변경"></td>
			<td><input class="member-input" type="text" data-role="member1" value="${member1}"></td>
			<td><input class="member-input" type="text" data-role="member2" value="${member2}"></td>
			<td><button class="member-delete-btn" type="button" data-role="delete" aria-label="삭제">×</button></td>
		</tr>`;
	}).join('');
}

function renderConstraintTable() {
	renderConstraintTableRows();
	refreshConstraintExpandButton();
	applyConstraintExpandedState();
}

function escapeAttr(value) {
	return String(value ?? '').replace(/"/g, '&quot;');
}

function renderRuleTableRows() {
	const container = getEl('ruleTableBody');
	if (!container) {
		return;
	}
	if (!ruleDraft.length) {
		container.innerHTML = `<tr><td class="member-empty" colspan="5">데이터가 없습니다.</td></tr>`;
		return;
	}

	let html = '';
	let index = 0;
	while (index < ruleDraft.length) {
		const current = ruleDraft[index];
		const member1 = String(current.member1 ?? '').trim();

		if (!member1) {
			const probability = normalizeProbability(ruleDraft[index].probability);
			html += `<tr data-index="${index}">
				<td class="drag-cell" draggable="true" data-role="drag-handle" title="순서 변경"></td>
				<td class="rule-member1-cell"><input class="member-input" type="text" data-role="member1-single" value="${escapeAttr(ruleDraft[index].member1)}"></td>
				<td class="rule-member2-cell"><input class="member-input" type="text" data-role="member2" value="${escapeAttr(ruleDraft[index].member2)}"></td>
				<td class="rule-probability-cell"><input class="member-input" type="number" min="0" max="100" step="1" data-role="probability" value="${probability}"></td>
				<td class="rule-delete-cell"><button class="member-delete-btn" type="button" data-role="delete" aria-label="삭제">×</button></td>
			</tr>`;
			index += 1;
			continue;
		}

		let span = 1;
		while (index + span < ruleDraft.length) {
			const nextMember1 = String(ruleDraft[index + span].member1 ?? '').trim();
			if (nextMember1 !== member1) {
				break;
			}
			span += 1;
		}

		for (let offset = 0; offset < span; offset += 1) {
			const rowIndex = index + offset;
			const row = ruleDraft[rowIndex];
			const probability = normalizeProbability(row.probability);
			html += `<tr data-index="${rowIndex}">`;
			html += `<td class="drag-cell" draggable="true" data-role="drag-handle" title="순서 변경"></td>`;
			if (offset === 0) {
				html += `<td class="rule-member1-cell" rowspan="${span}"><input class="member-input" type="text" data-role="member1-group" data-group-start="${index}" data-group-size="${span}" value="${escapeAttr(member1)}"></td>`;
			}
			html += `<td class="rule-member2-cell"><input class="member-input" type="text" data-role="member2" value="${escapeAttr(row.member2)}"></td>
			<td class="rule-probability-cell"><input class="member-input" type="number" min="0" max="100" step="1" data-role="probability" value="${probability}"></td>
			<td class="rule-delete-cell"><button class="member-delete-btn" type="button" data-role="delete" aria-label="삭제">×</button></td>
			</tr>`;
		}

		index += span;
	}

	container.innerHTML = html;
}

function renderRuleTable() {
	renderRuleTableRows();
}

function renderReservationTableRows() {
	const container = getEl('reservationTableBody');
	if (!container) {
		return;
	}
	if (!reservationDraft.length) {
		container.innerHTML = `<tr><td class="member-empty" colspan="3">데이터가 없습니다.</td></tr>`;
		return;
	}

	container.innerHTML = reservationDraft.map((names, index) => {
		const text = names.join(', ');
		return `<tr data-index="${index}">
			<td class="drag-cell" draggable="true" data-role="drag-handle" title="순서 변경"></td>
			<td><input class="member-input" type="text" data-role="reservationText" value="${escapeAttr(text)}"></td>
			<td><button class="member-delete-btn" type="button" data-role="delete" aria-label="삭제">×</button></td>
		</tr>`;
	}).join('');
}

function renderReservationTable() {
	renderReservationTableRows();
}

function moveArrayItem(list, fromIndex, toIndex) {
	if (!Array.isArray(list)) {
		return;
	}
	if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
		return;
	}
	if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex > list.length) {
		return;
	}
	if (fromIndex === toIndex || fromIndex + 1 === toIndex) {
		return;
	}
	const [moved] = list.splice(fromIndex, 1);
	const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
	list.splice(insertIndex, 0, moved);
}

function clearDragIndicators(tbody) {
	if (!(tbody instanceof HTMLElement)) {
		return;
	}
	tbody.querySelectorAll('tr.drag-over-before, tr.drag-over-after, tr.dragging-row').forEach((row) => {
		row.classList.remove('drag-over-before', 'drag-over-after', 'dragging-row');
	});
}

function bindReorderDnD(tbody, handlers) {
	if (!(tbody instanceof HTMLElement) || !handlers) {
		return;
	}
	const dragState = {
		fromIndex: -1,
		fromGroup: null,
		overIndex: -1,
		insertAfter: false
	};

	tbody.addEventListener('dragstart', (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement) || !target.matches('[data-role="drag-handle"]')) {
			event.preventDefault();
			return;
		}
		const row = target.closest('tr[data-index]');
		if (!(row instanceof HTMLElement)) {
			event.preventDefault();
			return;
		}
		dragState.fromIndex = Number(row.getAttribute('data-index'));
		dragState.fromGroup = handlers.getGroupKey ? handlers.getGroupKey(row) : null;
		dragState.overIndex = dragState.fromIndex;
		dragState.insertAfter = false;
		row.classList.add('dragging-row');
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', String(dragState.fromIndex));
		}
	});

	tbody.addEventListener('dragover', (event) => {
		if (dragState.fromIndex < 0) {
			return;
		}
		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			return;
		}
		const row = target.closest('tr[data-index]');
		if (!(row instanceof HTMLElement)) {
			return;
		}
		if (handlers.getGroupKey) {
			const currentGroup = handlers.getGroupKey(row);
			if (currentGroup !== dragState.fromGroup) {
				return;
			}
		}
		event.preventDefault();
		const rowRect = row.getBoundingClientRect();
		const insertAfter = (event.clientY - rowRect.top) > (rowRect.height / 2);
		dragState.overIndex = Number(row.getAttribute('data-index'));
		dragState.insertAfter = insertAfter;
		clearDragIndicators(tbody);
		row.classList.add(insertAfter ? 'drag-over-after' : 'drag-over-before');
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	});

	tbody.addEventListener('drop', (event) => {
		if (dragState.fromIndex < 0 || dragState.overIndex < 0) {
			return;
		}
		event.preventDefault();
		const targetIndex = dragState.overIndex + (dragState.insertAfter ? 1 : 0);
		handlers.reorder(dragState.fromIndex, targetIndex, dragState.fromGroup);
		handlers.render();
		dragState.fromIndex = -1;
		dragState.overIndex = -1;
		dragState.fromGroup = null;
		dragState.insertAfter = false;
		clearDragIndicators(tbody);
	});

	tbody.addEventListener('dragend', () => {
		dragState.fromIndex = -1;
		dragState.overIndex = -1;
		dragState.fromGroup = null;
		dragState.insertAfter = false;
		clearDragIndicators(tbody);
	});
}

function scrollReservationTableToBottom() {
	const tbody = getEl('reservationTableBody');
	if (!(tbody instanceof HTMLElement)) {
		return;
	}
	requestAnimationFrame(() => {
		tbody.scrollTop = tbody.scrollHeight;
	});
}

function focusLastReservationInput() {
	const tbody = getEl('reservationTableBody');
	if (!(tbody instanceof HTMLElement)) {
		return;
	}
	requestAnimationFrame(() => {
		const inputs = tbody.querySelectorAll('input[data-role="reservationText"]');
		const targetInput = inputs.length ? inputs[inputs.length - 1] : null;
		if (targetInput instanceof HTMLInputElement) {
			targetInput.focus();
			targetInput.select();
		}
	});
}

function createEmptyConstraint() {
	return { member1: '', member2: '' };
}

function scrollConstraintTableToBottom() {
	const tbody = getEl('constraintTableBody');
	if (!(tbody instanceof HTMLElement)) {
		return;
	}
	requestAnimationFrame(() => {
		tbody.scrollTop = tbody.scrollHeight;
	});
}

function focusLastConstraintInput() {
	const tbody = getEl('constraintTableBody');
	if (!(tbody instanceof HTMLElement)) {
		return;
	}
	requestAnimationFrame(() => {
		const inputs = tbody.querySelectorAll('input[data-role="member1"]');
		const targetInput = inputs.length ? inputs[inputs.length - 1] : null;
		if (targetInput instanceof HTMLInputElement) {
			targetInput.focus();
			targetInput.select();
		}
	});
}

function scrollRuleTableToBottom() {
	const tbody = getEl('ruleTableBody');
	if (!(tbody instanceof HTMLElement)) {
		return;
	}
	requestAnimationFrame(() => {
		tbody.scrollTop = tbody.scrollHeight;
	});
}

function focusLastRuleMember1Input() {
	const tbody = getEl('ruleTableBody');
	if (!(tbody instanceof HTMLElement)) {
		return;
	}
	requestAnimationFrame(() => {
		const inputs = tbody.querySelectorAll('input[data-role="member1-single"], input[data-role="member1-group"]');
		const targetInput = inputs.length ? inputs[inputs.length - 1] : null;
		if (targetInput instanceof HTMLInputElement) {
			targetInput.focus();
			targetInput.select();
		}
	});
}

function createEmptyMember() {
	const allMembers = [...memberDraft.people, ...memberDraft.inactivePeople];
	const nextId = allMembers.reduce((maxId, item) => {
		const idValue = Number(item?.id || 0);
		return Math.max(maxId, idValue);
	}, 0) + 1;
	return {
		id: nextId,
		name: '',
		gender: 'male',
		weight: 0
	};
}

function scrollMemberTableToBottom(listKey) {
	const tbodyId = listKey === 'people' ? 'participantsTableBody' : 'inactiveTableBody';
	const tbody = getEl(tbodyId);
	if (!(tbody instanceof HTMLElement)) {
		return;
	}
	requestAnimationFrame(() => {
		tbody.scrollTop = tbody.scrollHeight;
	});
}

function focusLastMemberNameInput(listKey) {
	const tbodyId = listKey === 'people' ? 'participantsTableBody' : 'inactiveTableBody';
	const tbody = getEl(tbodyId);
	if (!(tbody instanceof HTMLElement)) {
		return;
	}
	requestAnimationFrame(() => {
		const inputs = tbody.querySelectorAll('input[data-role="name"]');
		const targetInput = inputs.length ? inputs[inputs.length - 1] : null;
		if (targetInput instanceof HTMLInputElement) {
			targetInput.focus();
			targetInput.select();
		}
	});
}

function getMemberTbodyMaxHeightPx() {
	const rootStyles = getComputedStyle(document.documentElement);
	const value = rootStyles.getPropertyValue('--member-tbody-max-h').trim();
	const parsed = Number.parseFloat(value.replace('px', ''));
	return Number.isFinite(parsed) ? parsed : 400;
}

function isOverflowingForCollapsedView(tbody) {
	if (!(tbody instanceof HTMLElement)) {
		return false;
	}
	const maxHeightPx = getMemberTbodyMaxHeightPx();
	return tbody.scrollHeight > maxHeightPx + 1;
}

function shouldShowMemberExpandButton(row) {
	if (!(row instanceof HTMLElement)) {
		return false;
	}
	const tbodies = Array.from(row.querySelectorAll('.member-table tbody'));
	return tbodies.some((tbody) => isOverflowingForCollapsedView(tbody));
}

function shouldShowConstraintExpandButton() {
	const tbody = getEl('constraintTableBody');
	return isOverflowingForCollapsedView(tbody);
}

function shouldShowHistoryExpandButton() {
	const tbody = getEl('historyTableBody');
	return isOverflowingForCollapsedView(tbody);
}

function refreshMemberExpandButton() {
	const button = getEl('memberExpandBtn');
	const row = getEl('memberTableRow');
	if (!(button instanceof HTMLButtonElement) || !row) {
		return;
	}
	const shouldShow = shouldShowMemberExpandButton(row);
	if (!shouldShow) {
		row.classList.remove('expanded');
		button.style.display = 'none';
		return;
	}
	button.style.display = '';
	button.textContent = row.classList.contains('expanded') ? '숨기기' : '모두 보기';
}

function refreshConstraintExpandButton() {
	const button = getEl('constraintExpandBtn');
	const row = getEl('constraintTableRow');
	if (!(button instanceof HTMLButtonElement) || !row) {
		return;
	}
	const shouldShow = shouldShowConstraintExpandButton();
	if (!shouldShow) {
		row.classList.remove('expanded');
		button.style.display = 'none';
		return;
	}
	button.style.display = '';
	button.textContent = row.classList.contains('expanded') ? '숨기기' : '모두 보기';
}

function refreshHistoryExpandButton() {
	const button = getEl('historyExpandBtn');
	const row = getEl('historyTableRow');
	if (!(button instanceof HTMLButtonElement) || !row) {
		return;
	}
	const shouldShow = shouldShowHistoryExpandButton();
	if (!shouldShow) {
		row.classList.remove('expanded');
		button.style.display = 'none';
		return;
	}
	button.style.display = '';
	button.textContent = row.classList.contains('expanded') ? '숨기기' : '모두 보기';
}

function applyMemberExpandedState() {
	const row = getEl('memberTableRow');
	if (!row) {
		return;
	}
	const isExpanded = row.classList.contains('expanded');
	row.querySelectorAll('.member-table tbody').forEach((tbody) => {
		if (!(tbody instanceof HTMLElement)) {
			return;
		}
		if (isExpanded) {
			tbody.style.maxHeight = 'none';
			tbody.style.overflowY = 'visible';
			tbody.style.overflowX = 'visible';
			tbody.style.height = 'auto';
		} else {
			tbody.style.maxHeight = 'var(--member-tbody-max-h)';
			tbody.style.overflowY = 'auto';
			tbody.style.overflowX = 'hidden';
			tbody.style.height = '';
		}
	});
}

function applyConstraintExpandedState() {
	const row = getEl('constraintTableRow');
	if (!row) {
		return;
	}
	const tbody = getEl('constraintTableBody');
	if (!(tbody instanceof HTMLElement)) {
		return;
	}
	const isExpanded = row.classList.contains('expanded');
	if (isExpanded) {
		tbody.style.maxHeight = 'none';
		tbody.style.overflowY = 'visible';
		tbody.style.overflowX = 'visible';
		tbody.style.height = 'auto';
	} else {
		tbody.style.maxHeight = 'var(--member-tbody-max-h)';
		tbody.style.overflowY = 'auto';
		tbody.style.overflowX = 'hidden';
		tbody.style.height = '';
	}
}

function applyHistoryExpandedState() {
	const row = getEl('historyTableRow');
	if (!row) {
		return;
	}
	const tbody = getEl('historyTableBody');
	if (!(tbody instanceof HTMLElement)) {
		return;
	}
	const isExpanded = row.classList.contains('expanded');
	if (isExpanded) {
		tbody.style.maxHeight = 'none';
		tbody.style.overflowY = 'visible';
		tbody.style.overflowX = 'visible';
		tbody.style.height = 'auto';
	} else {
		tbody.style.maxHeight = 'var(--member-tbody-max-h)';
		tbody.style.overflowY = 'auto';
		tbody.style.overflowX = 'hidden';
		tbody.style.height = '';
	}
}

function setFieldAvailability(type) {
	const disabledMap = fieldEnabledByType[type] || {};
	Object.values(fieldIds).forEach((id) => {
		if (id === fieldIds.key) {
			return;
		}
		const element = getEl(id);
		if (!element) {
			return;
		}
		const fieldName = Object.keys(fieldIds).find((key) => fieldIds[key] === id);
		if (!fieldName) {
			return;
		}
		element.disabled = disabledMap[fieldName] === false;
	});
}

function updateConditionalRows(type) {
	const passwordRow = getEl('passwordRow');
	const historyRow = getEl('historyTableRow');
	if (!passwordRow) {
		return;
	}
	passwordRow.style.display = type === 'users' ? 'none' : 'flex';
	if (historyRow) {
		historyRow.style.display = type === 'users' ? 'flex' : 'none';
	}
}

function readFormData() {
	return {
		membersPerTeam: Number(getEl(fieldIds.membersPerTeam).value || 0),
		genderBalanceEnabled: getEl(fieldIds.genderBalanceEnabled).checked,
		maxTeamSizeEnabled: getEl(fieldIds.maxTeamSizeEnabled).checked,
		weightBalanceEnabled: getEl(fieldIds.weightBalanceEnabled).checked,
		createdAt: getEl(fieldIds.createdAt).value.trim(),
		lastAccess: getEl(fieldIds.lastAccess).value.trim(),
		password: getEl(fieldIds.password).value,
		timestamp: getEl(fieldIds.timestamp).value.trim()
	};
}

function writeFormData(key, type, data) {
	getEl(fieldIds.key).value = key || '';
	getEl(fieldIds.membersPerTeam).value = Number.isFinite(data.membersPerTeam) ? data.membersPerTeam : '';
	getEl(fieldIds.genderBalanceEnabled).checked = Boolean(data.genderBalanceEnabled);
	getEl(fieldIds.maxTeamSizeEnabled).checked = Boolean(data.maxTeamSizeEnabled);
	getEl(fieldIds.weightBalanceEnabled).checked = Boolean(data.weightBalanceEnabled);
	getEl(fieldIds.createdAt).value = data.createdAt || '';
	getEl(fieldIds.lastAccess).value = data.lastAccess || '';
	getEl(fieldIds.password).value = data.password || '';
	getEl(fieldIds.timestamp).value = data.timestamp || '';
	cloneMembers(data || {});
	cloneConstraints(data || {});
	cloneRules(data || {});
	cloneReservations(data || {});
	cloneGenerateHistory(data || {});
	renderMemberTables();
	renderConstraintTable();
	renderRuleTable();
	renderReservationTable();
	renderGenerateHistoryTable();
	setFieldAvailability(type);
	updateConditionalRows(type);
}

function applySelectionStyles() {
	document.querySelectorAll('.item-btn').forEach((btn) => {
		const match = btn.dataset.type === selected.type && btn.dataset.key === selected.key;
		btn.classList.toggle('active', match);
	});
}

function setEditorHeader() {
	const title = getEl('editorTitle');
	const subtitle = getEl('editorSubtitle');
	if (!selected.type || !selected.key) {
		title.textContent = '항목을 선택하세요';
		subtitle.textContent = '왼쪽 리스트에서 profiles 또는 users를 선택하면 편집할 수 있습니다.';
		updateConditionalRows(null);
		return;
	}
	title.textContent = `${selected.type}/${selected.key}`;
	subtitle.textContent = '수정 후 저장을 누르고, 동기화로 최신 상태를 맞출 수 있습니다.';
	updateConditionalRows(selected.type);
}

function buildItemButton(type, key, data) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'item-btn';
	button.dataset.type = type;
	button.dataset.key = key;
	const dateValue = data?.timestamp || data?.lastAccess || data?.createdAt || '';
	button.innerHTML = `<span class="item-title">${key}</span><span class="item-meta">${dateValue || 'no timestamp'}</span>`;
	button.addEventListener('click', async () => {
		selected = { type, key };
		setButtonsEnabled(true);
		setEditorHeader();
		applySelectionStyles();
		await loadSelectedItem();
	});
	return button;
}

function toSortableTime(value) {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	const text = String(value ?? '').trim();
	if (!text) {
		return Number.POSITIVE_INFINITY;
	}
	const normalized = text.includes('T') ? text : text.replace(' ', 'T');
	const parsed = Date.parse(normalized);
	if (Number.isFinite(parsed)) {
		return parsed;
	}
	return Number.POSITIVE_INFINITY;
}

function getCreatedAtSortValue(type, data) {
	const createdAt = data?.createdAt;
	if (createdAt) {
		return toSortableTime(createdAt);
	}
	if (type === 'profiles') {
		return toSortableTime(data?.timestamp || data?.lastAccess);
	}
	return toSortableTime(data?.timestamp || data?.lastAccess);
}

function renderList(type, values) {
	const listElement = getEl(type === 'profiles' ? 'profilesList' : 'usersList');
	const countElement = getEl(type === 'profiles' ? 'profilesCount' : 'usersCount');
	listElement.innerHTML = '';
	const entries = Object.entries(values || {});
	countElement.textContent = String(entries.length);
	if (!entries.length) {
		const empty = document.createElement('div');
		empty.className = 'empty-state';
		empty.textContent = '데이터가 없습니다.';
		listElement.appendChild(empty);
		return;
	}
	entries.sort((a, b) => {
		const timeA = getCreatedAtSortValue(type, a[1]);
		const timeB = getCreatedAtSortValue(type, b[1]);
		if (timeA !== timeB) {
			return timeA - timeB;
		}
		return a[0].localeCompare(b[0], 'ko');
	});
	entries.forEach(([key, value]) => {
		listElement.appendChild(buildItemButton(type, key, value));
	});
	applySelectionStyles();
}

async function loadLists() {
	const [profilesSnapshot, usersSnapshot] = await Promise.all([
		database.ref('profiles').once('value'),
		database.ref('users').once('value')
	]);
	renderList('profiles', profilesSnapshot.val() || {});
	renderList('users', usersSnapshot.val() || {});
}

async function loadSelectedItem() {
	if (!selected.type || !selected.key) {
		return;
	}
	const snapshot = await database.ref(`${selected.type}/${selected.key}`).once('value');
	const data = snapshot.val();
	if (!data) {
		showToast('선택 항목이 존재하지 않습니다.');
		writeFormData(selected.key, selected.type, {});
		return;
	}
	writeFormData(selected.key, selected.type, data);
}

function buildPayloadFromForm(type) {
	const form = readFormData();
	const { nameToId } = buildMemberMaps(memberDraft);
	const forbiddenPairs = [];
	const pendingConstraints = [];
	const hiddenGroupChainsMap = new Map();
	const dedupeForbidden = new Set();
	const dedupePending = new Set();

	constraintDraft.forEach((item) => {
		const member1 = String(item.member1 ?? '').trim();
		const member2 = String(item.member2 ?? '').trim();
		if (!member1 || !member2) {
			return;
		}

		const id1 = nameToId.get(normalizeName(member1));
		const id2 = nameToId.get(normalizeName(member2));
		if (Number.isInteger(id1) && Number.isInteger(id2) && id1 !== id2) {
			const a = Math.min(id1, id2);
			const b = Math.max(id1, id2);
			const key = `${a}:${b}`;
			if (!dedupeForbidden.has(key)) {
				dedupeForbidden.add(key);
				forbiddenPairs.push([a, b]);
			}
			return;
		}

		const left = normalizeName(member1);
		const right = normalizeName(member2);
		if (!left || !right || left === right) {
			return;
		}
		const leftRightKey = `${left}:${right}`;
		const rightLeftKey = `${right}:${left}`;
		if (dedupePending.has(leftRightKey) || dedupePending.has(rightLeftKey)) {
			return;
		}
		dedupePending.add(leftRightKey);
		pendingConstraints.push({ left, right });
	});

	ruleDraft.forEach((item) => {
		const member1 = String(item.member1 ?? '').trim();
		const member2 = String(item.member2 ?? '').trim();
		if (!member1 || !member2) {
			return;
		}
		let chain = hiddenGroupChainsMap.get(member1);
		if (!chain) {
			chain = {
				primary: member1,
				candidateKeys: new Set(),
				candidates: []
			};
			hiddenGroupChainsMap.set(member1, chain);
		}
		const candidateKey = normalizeName(member2);
		if (chain.candidateKeys.has(candidateKey)) {
			return;
		}
		chain.candidateKeys.add(candidateKey);
		chain.candidates.push({ name: member2, probability: normalizeProbability(item.probability) });
	});

	const hiddenGroupChains = Array.from(hiddenGroupChainsMap.values()).map((chain) => {
		return {
			primary: chain.primary,
			candidates: chain.candidates
		};
	});

	const reservations = reservationDraft
		.map((row) => row.map((name) => String(name ?? '').trim()).filter((name) => name.length > 0))
		.filter((row) => row.length > 0);

	const payload = {
		membersPerTeam: form.membersPerTeam,
		genderBalanceEnabled: form.genderBalanceEnabled,
		maxTeamSizeEnabled: form.maxTeamSizeEnabled,
		weightBalanceEnabled: form.weightBalanceEnabled,
		password: form.password,
		people: memberDraft.people,
		inactivePeople: memberDraft.inactivePeople,
		forbiddenPairs,
		pendingConstraints,
		hiddenGroupChains,
		reservations
	};

	if (type === 'profiles') {
		payload.timestamp = form.timestamp || getDbTimestamp();
	}
	if (type === 'users') {
		payload.createdAt = form.createdAt || getDbTimestamp();
		payload.lastAccess = form.lastAccess || getDbTimestamp();
	}
	return payload;
}

function removeEmptyNameRows() {
	const filterByName = (list) => {
		return list.filter((member) => {
			return typeof member?.name === 'string' && member.name.trim().length > 0;
		});
	};

	const beforeCount = memberDraft.people.length + memberDraft.inactivePeople.length;
	memberDraft.people = filterByName(memberDraft.people);
	memberDraft.inactivePeople = filterByName(memberDraft.inactivePeople);
	const afterCount = memberDraft.people.length + memberDraft.inactivePeople.length;

	if (beforeCount !== afterCount) {
		renderMemberTables();
	}
}

function removeEmptyConstraintRows() {
	const before = constraintDraft.length;
	constraintDraft = constraintDraft.filter((item) => {
		return item.member1.trim().length > 0 && item.member2.trim().length > 0;
	});
	if (before !== constraintDraft.length) {
		renderConstraintTable();
	}
}

function removeEmptyRuleRows() {
	const before = ruleDraft.length;
	ruleDraft = ruleDraft.filter((item) => {
		return item.member1.trim().length > 0 && item.member2.trim().length > 0;
	});
	if (before !== ruleDraft.length) {
		renderRuleTable();
	}
}

function removeEmptyReservationRows() {
	const before = reservationDraft.length;
	reservationDraft = reservationDraft
		.map((row) => row.map((name) => String(name ?? '').trim()).filter((name) => name.length > 0))
		.filter((row) => row.length > 0);
	if (before !== reservationDraft.length) {
		renderReservationTable();
	}
}

async function saveSelected() {
	if (!selected.type || !selected.key) {
		return;
	}
	removeEmptyNameRows();
	removeEmptyConstraintRows();
	removeEmptyRuleRows();
	removeEmptyReservationRows();
	const payload = buildPayloadFromForm(selected.type);
	await savePayloadByType(selected.type, selected.key, payload);
	await broadcastSyncTrigger(selected.type, selected.key, 'all');
	await loadSelectedItem();
	await loadLists();
	showToast('저장 완료');
}

async function syncSelected() {
	if (!selected.type || !selected.key) {
		return;
	}
	removeEmptyNameRows();
	removeEmptyConstraintRows();
	removeEmptyRuleRows();
	removeEmptyReservationRows();
	const payload = buildPayloadFromForm(selected.type);
	await savePayloadByType(selected.type, selected.key, payload);
	await broadcastSyncTrigger(selected.type, selected.key, 'all');
	await loadSelectedItem();
	showToast('동기화 완료');
}

function initAccordion() {
	document.querySelectorAll('.accordion-header').forEach((header) => {
		header.addEventListener('click', () => {
			const expanded = header.getAttribute('aria-expanded') === 'true';
			header.setAttribute('aria-expanded', String(!expanded));
		});
	});
}

function initTheme() {
	const savedTheme = localStorage.getItem('adminTheme') || 'dark';
	document.documentElement.setAttribute('data-theme', savedTheme);
	const toggleButton = getEl('themeToggleBtn');
	const updateText = () => {
		const theme = document.documentElement.getAttribute('data-theme');
		toggleButton.textContent = theme === 'dark' ? '라이트 모드' : '다크 모드';
	};
	updateText();
	toggleButton.addEventListener('click', () => {
		const current = document.documentElement.getAttribute('data-theme');
		const next = current === 'dark' ? 'light' : 'dark';
		document.documentElement.setAttribute('data-theme', next);
		localStorage.setItem('adminTheme', next);
		updateText();
	});
}

function bindEvents() {
	getEl('refreshListsBtn').addEventListener('click', async () => {
		await loadLists();
		if (selected.type && selected.key) {
			await loadSelectedItem();
			applySelectionStyles();
		}
		showToast('리스트 갱신 완료');
	});
	getEl('saveBtn').addEventListener('click', async () => {
		try {
			await saveSelected();
		} catch (error) {
			showToast(`저장 실패: ${error.message}`);
		}
	});
	getEl('syncBtn').addEventListener('click', async () => {
		try {
			await syncSelected();
		} catch (error) {
			showToast(`동기화 실패: ${error.message}`);
		}
	});
	getEl('passwordToggleBtn').addEventListener('click', () => {
		const input = getEl(fieldIds.password);
		const button = getEl('passwordToggleBtn');
		const isMasked = input.type === 'password';
		input.type = isMasked ? 'text' : 'password';
		button.textContent = isMasked ? '🙈' : '👁';
	});

	const handleMemberInput = (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			return;
		}
		const row = target.closest('tr[data-list][data-index]');
		if (!row) {
			return;
		}
		const listKey = row.getAttribute('data-list');
		const index = Number(row.getAttribute('data-index'));
		if ((listKey !== 'people' && listKey !== 'inactivePeople') || !Number.isInteger(index)) {
			return;
		}
		const person = memberDraft[listKey][index];
		if (!person) {
			return;
		}
		if (target.matches('input[data-role="name"]')) {
			person.name = target.value;
		}
		if (target.matches('input[data-role="weight"]')) {
			person.weight = Number(target.value || 0);
		}
	};

	const handleGenderToggle = (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			return;
		}
		const row = target.closest('tr[data-list][data-index]');
		if (!row) {
			return;
		}
		const listKey = row.getAttribute('data-list');
		const index = Number(row.getAttribute('data-index'));
		if ((listKey !== 'people' && listKey !== 'inactivePeople') || !Number.isInteger(index)) {
			return;
		}
		const person = memberDraft[listKey][index];
		if (!person) {
			return;
		}

		if (target.matches('button[data-role="gender"]')) {
			person.gender = person.gender === 'male' ? 'female' : 'male';
			target.textContent = getGenderLabel(person.gender);
			return;
		}

		if (target.matches('button[data-role="delete"]')) {
			memberDraft[listKey].splice(index, 1);
			renderMemberTables();
		}
	};

	const participantsBody = getEl('participantsTableBody');
	const inactiveBody = getEl('inactiveTableBody');
	if (participantsBody && inactiveBody) {
		[participantsBody, inactiveBody].forEach((tbody) => {
			tbody.addEventListener('input', handleMemberInput);
			tbody.addEventListener('click', handleGenderToggle);
		});

		bindReorderDnD(participantsBody, {
			getGroupKey: (row) => row.getAttribute('data-list') || '',
			reorder: (fromIndex, toIndex, listKey) => {
				if (listKey !== 'people') {
					return;
				}
				moveArrayItem(memberDraft.people, fromIndex, toIndex);
			},
			render: () => renderMemberTables()
		});

		bindReorderDnD(inactiveBody, {
			getGroupKey: (row) => row.getAttribute('data-list') || '',
			reorder: (fromIndex, toIndex, listKey) => {
				if (listKey !== 'inactivePeople') {
					return;
				}
				moveArrayItem(memberDraft.inactivePeople, fromIndex, toIndex);
			},
			render: () => renderMemberTables()
		});
	}

	document.querySelectorAll('.member-add-btn').forEach((button) => {
		button.addEventListener('click', () => {
			const listKey = button.getAttribute('data-list');
			if (listKey !== 'people' && listKey !== 'inactivePeople') {
				return;
			}
			memberDraft[listKey].push(createEmptyMember());
			renderMemberTables();
			scrollMemberTableToBottom(listKey);
			focusLastMemberNameInput(listKey);
		});
	});

	const constraintTableBody = getEl('constraintTableBody');
	if (constraintTableBody) {
		constraintTableBody.addEventListener('input', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) {
				return;
			}
			const row = target.closest('tr[data-index]');
			if (!row) {
				return;
			}
			const index = Number(row.getAttribute('data-index'));
			if (!Number.isInteger(index) || !constraintDraft[index]) {
				return;
			}
			if (target.matches('input[data-role="member1"]')) {
				constraintDraft[index].member1 = target.value;
			}
			if (target.matches('input[data-role="member2"]')) {
				constraintDraft[index].member2 = target.value;
			}
		});

		constraintTableBody.addEventListener('click', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement) || !target.matches('button[data-role="delete"]')) {
				return;
			}
			const row = target.closest('tr[data-index]');
			if (!row) {
				return;
			}
			const index = Number(row.getAttribute('data-index'));
			if (!Number.isInteger(index) || !constraintDraft[index]) {
				return;
			}
			constraintDraft.splice(index, 1);
			renderConstraintTable();
		});

		bindReorderDnD(constraintTableBody, {
			reorder: (fromIndex, toIndex) => {
				moveArrayItem(constraintDraft, fromIndex, toIndex);
			},
			render: () => renderConstraintTable()
		});
	}

	const constraintAddBtn = getEl('constraintAddBtn');
	if (constraintAddBtn instanceof HTMLButtonElement) {
		constraintAddBtn.addEventListener('click', () => {
			constraintDraft.push(createEmptyConstraint());
			renderConstraintTable();
			scrollConstraintTableToBottom();
			focusLastConstraintInput();
		});
	}

	const ruleTableBody = getEl('ruleTableBody');
	if (ruleTableBody) {
		ruleTableBody.addEventListener('input', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) {
				return;
			}
			const row = target.closest('tr[data-index]');
			if (!row) {
				return;
			}
			const index = Number(row.getAttribute('data-index'));
			if (!Number.isInteger(index) || !ruleDraft[index]) {
				return;
			}
			if (target.matches('input[data-role="member2"]')) {
				ruleDraft[index].member2 = target.value;
			}
			if (target.matches('input[data-role="probability"]')) {
				ruleDraft[index].probability = target.value;
			}
			if (target.matches('input[data-role="member1-single"]')) {
				ruleDraft[index].member1 = target.value;
			}
		});

		ruleTableBody.addEventListener('change', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement) || !target.matches('input[data-role="member1-group"]')) {
				return;
			}
			const start = Number(target.getAttribute('data-group-start'));
			const size = Number(target.getAttribute('data-group-size'));
			if (!Number.isInteger(start) || !Number.isInteger(size) || size <= 0) {
				return;
			}
			for (let offset = 0; offset < size; offset += 1) {
				const rowIndex = start + offset;
				if (!ruleDraft[rowIndex]) {
					continue;
				}
				ruleDraft[rowIndex].member1 = target.value;
			}
			renderRuleTable();
		});

		ruleTableBody.addEventListener('change', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement) || !target.matches('input[data-role="probability"]')) {
				return;
			}
			const row = target.closest('tr[data-index]');
			if (!row) {
				return;
			}
			const index = Number(row.getAttribute('data-index'));
			if (!Number.isInteger(index) || !ruleDraft[index]) {
				return;
			}
			ruleDraft[index].probability = normalizeProbability(target.value);
			renderRuleTable();
		});

		ruleTableBody.addEventListener('click', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement) || !target.matches('button[data-role="delete"]')) {
				return;
			}
			const row = target.closest('tr[data-index]');
			if (!row) {
				return;
			}
			const index = Number(row.getAttribute('data-index'));
			if (!Number.isInteger(index) || !ruleDraft[index]) {
				return;
			}
			ruleDraft.splice(index, 1);
			renderRuleTable();
		});

		bindReorderDnD(ruleTableBody, {
			reorder: (fromIndex, toIndex) => {
				moveArrayItem(ruleDraft, fromIndex, toIndex);
			},
			render: () => renderRuleTable()
		});
	}

	const ruleAddBtn = getEl('ruleAddBtn');
	if (ruleAddBtn instanceof HTMLButtonElement) {
		ruleAddBtn.addEventListener('click', () => {
			ruleDraft.push({ member1: '', member2: '', probability: 100 });
			renderRuleTable();
			scrollRuleTableToBottom();
			focusLastRuleMember1Input();
		});
	}

	const reservationTableBody = getEl('reservationTableBody');
	if (reservationTableBody) {
		reservationTableBody.addEventListener('input', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement) || !target.matches('input[data-role="reservationText"]')) {
				return;
			}
			const row = target.closest('tr[data-index]');
			if (!row) {
				return;
			}
			const index = Number(row.getAttribute('data-index'));
			if (!Number.isInteger(index) || !reservationDraft[index]) {
				return;
			}
			reservationDraft[index] = parseReservationText(target.value);
		});

		reservationTableBody.addEventListener('click', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement) || !target.matches('button[data-role="delete"]')) {
				return;
			}
			const row = target.closest('tr[data-index]');
			if (!row) {
				return;
			}
			const index = Number(row.getAttribute('data-index'));
			if (!Number.isInteger(index) || !reservationDraft[index]) {
				return;
			}
			reservationDraft.splice(index, 1);
			renderReservationTable();
		});

		bindReorderDnD(reservationTableBody, {
			reorder: (fromIndex, toIndex) => {
				moveArrayItem(reservationDraft, fromIndex, toIndex);
			},
			render: () => renderReservationTable()
		});
	}

	const reservationAddBtn = getEl('reservationAddBtn');
	if (reservationAddBtn instanceof HTMLButtonElement) {
		reservationAddBtn.addEventListener('click', () => {
			reservationDraft.push([]);
			renderReservationTable();
			scrollReservationTableToBottom();
			focusLastReservationInput();
		});
	}

	const historyTableBody = getEl('historyTableBody');
	if (historyTableBody) {
		historyTableBody.addEventListener('click', (event) => {
			const target = event.target;
			if (!(target instanceof HTMLElement)) {
				return;
			}
			const button = target.closest('button[data-role="toggle-history"]');
			if (!(button instanceof HTMLButtonElement)) {
				return;
			}
			const index = button.getAttribute('data-index');
			if (!index) {
				return;
			}

			const detailRows = Array.from(historyTableBody.querySelectorAll('tr.history-detail-row'));
			const toggleButtons = Array.from(historyTableBody.querySelectorAll('button[data-role="toggle-history"]'));
			const targetDetailRow = historyTableBody.querySelector(`tr.history-detail-row[data-index="${index}"]`);
			if (!(targetDetailRow instanceof HTMLElement)) {
				return;
			}

			const shouldOpen = targetDetailRow.hasAttribute('hidden');

			detailRows.forEach((row) => {
				row.setAttribute('hidden', '');
			});
			toggleButtons.forEach((item) => {
				item.setAttribute('aria-expanded', 'false');
				const chevron = item.querySelector('.history-chevron');
				if (chevron) {
					chevron.textContent = '▸';
				}
			});

			if (shouldOpen) {
				targetDetailRow.removeAttribute('hidden');
				button.setAttribute('aria-expanded', 'true');
				const chevron = button.querySelector('.history-chevron');
				if (chevron) {
					chevron.textContent = '▾';
				}
			}
		});
	}

	const historyExpandBtn = getEl('historyExpandBtn');
	const historyTableRow = getEl('historyTableRow');
	if (historyExpandBtn instanceof HTMLButtonElement && historyTableRow) {
		historyExpandBtn.addEventListener('click', () => {
			historyTableRow.classList.toggle('expanded');
			applyHistoryExpandedState();
			refreshHistoryExpandButton();
		});
	}

	const memberExpandBtn = getEl('memberExpandBtn');
	const memberTableRow = getEl('memberTableRow');
	if (memberExpandBtn instanceof HTMLButtonElement && memberTableRow) {
		memberExpandBtn.addEventListener('click', () => {
			memberTableRow.classList.toggle('expanded');
			applyMemberExpandedState();
			refreshMemberExpandButton();
		});
	}

	const constraintExpandBtn = getEl('constraintExpandBtn');
	const constraintTableRow = getEl('constraintTableRow');
	if (constraintExpandBtn instanceof HTMLButtonElement && constraintTableRow) {
		constraintExpandBtn.addEventListener('click', () => {
			constraintTableRow.classList.toggle('expanded');
			applyConstraintExpandedState();
			refreshConstraintExpandButton();
		});
	}

	applyMemberExpandedState();
	refreshMemberExpandButton();
	applyConstraintExpandedState();
	refreshConstraintExpandButton();
	applyHistoryExpandedState();
	refreshHistoryExpandButton();
}

async function bootstrap() {
	initFirebase();
	initAccordion();
	initTheme();
	bindEvents();
	setButtonsEnabled(false);
	setEditorHeader();
	await loadLists();
}

bootstrap().catch((error) => {
	showToast(`초기화 실패: ${error.message}`);
});
