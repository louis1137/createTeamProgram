const state = {
	people: [],
	requiredGroups: [],
	forbiddenPairs: [], // array of [idA, idB]
	forbiddenMap: {},   // built from forbiddenPairs for fast lookup
	pendingConstraints: [], // array of {left: normalized, right: normalized}
	genderBalanceEnabled: false,
	weightBalanceEnabled: false,
	membersPerTeam: 4,
	nextId: 1,
	teamDisplayDelay: 600,
	ungroupedColor: '#94a3b8',
	groupColors: [
		'#f59e0b', '#10b981', '#ec4899', '#667eea',
		'#8b5cf6', '#06b6d4', '#f97316', '#14b8a6',
		'#a855f7', '#84cc16', '#f43f5e', '#6366f1'
	]
};

const elements = {
	genderBalanceCheckbox: document.getElementById('genderBalanceCheckbox'),
	weightBalanceCheckbox: document.getElementById('weightBalanceCheckbox'),
	teamSizeInput: document.getElementById('teamSizeInput'),
	nameInput: document.getElementById('nameInput'),
	addPersonBtn: document.getElementById('addPersonBtn'),
	resetBtn: document.getElementById('resetBtn'),
	peopleList: document.getElementById('peopleList'),
	shuffleBtn: document.getElementById('shuffleBtn'),
	resultsSection: document.getElementById('resultsSection'),
	teamsDisplay: document.getElementById('teamsDisplay'),
	participantCount: document.querySelector('.participantCount')
};

function init() {
	elements.genderBalanceCheckbox.addEventListener('change', handleGenderBalanceToggle);
	elements.weightBalanceCheckbox.addEventListener('change', handleWeightBalanceToggle);
	elements.teamSizeInput.addEventListener('change', handleTeamSizeChange);
	elements.addPersonBtn.addEventListener('click', addPerson);
	elements.resetBtn.addEventListener('click', resetAll);
	elements.nameInput.addEventListener('keypress', (e) => {
		if (e.key === 'Enter') {
			addPerson();
		}
	});
	elements.shuffleBtn.addEventListener('click', shuffleTeams);
	
	renderPeople();
	// prepare forbidden pairs map
	buildForbiddenMap();
	// try to resolve any pending textual constraints (if users were added earlier)
	tryResolvePendingConstraints();
	// If viewing locally (file:// or localhost), reduce team display delay to 0 for instant feedback
	adjustLocalSettings();
}

function resetAll() {
	if (!confirm('모든 데이터를 초기화하시겠습니까?\n참고: 기피 설정(금지 제약)은 초기화되지 않습니다.')) {
		return;
	}
	// Convert any applied (id-based) forbidden pairs into pending name-based constraints so they persist
	let converted = 0;
	state.forbiddenPairs.forEach(([a, b]) => {
		const pa = state.people.find(p => p.id === a);
		const pb = state.people.find(p => p.id === b);
		if (pa && pb) {
			if (addPendingConstraint(pa.name, pb.name).ok) converted++;
		}
	});
	if (converted > 0) console.log(`초기화: 기존 제약 ${converted}개가 보류 제약으로 변환되어 유지됩니다.`);
	// Clear people and groups, keep pendingConstraints intact so constraints persist
	state.people = [];
	state.requiredGroups = [];
	state.nextId = 1;
	state.forbiddenPairs = []; // clear id-based pairs (they become pending)
	state.forbiddenMap = {};
	elements.resultsSection.style.display = 'none';
	// show FAQ again when resetting
	const faqSection = document.querySelector('.faq-section');
	if (faqSection) faqSection.style.display = '';
	renderPeople();
}

function handleGenderBalanceToggle(e) {
	state.genderBalanceEnabled = e.target.checked;
	renderPeople();
}

function handleWeightBalanceToggle(e) {
	state.weightBalanceEnabled = e.target.checked;
	renderPeople();
}

function handleTeamSizeChange(e) {
	state.membersPerTeam = parseInt(e.target.value) || 4;
}

function addPerson() {
	const input = elements.nameInput.value.trim();
	
	if (input === '') {
		alert('이름을 입력해주세요.');
		return;
	}

	// Split by '/' into tokens; tokens with '!' are treated as constraints, others as names/groups
	const tokens = input.split('/').map(t => t.trim()).filter(t => t !== '');

	if (tokens.length === 0) {
		alert('이름을 입력해주세요.');
		return;
	}

	let addedAny = false;

	tokens.forEach(token => {
		if (token.includes('!')) {
			// Support constraints like "A!B,C,D" and multiple constraints in one token (e.g. "A!B,C,X!Y,Z").
			const parts = token.split(',').map(p => p.trim()).filter(p => p !== '');
			let i = 0;
			while (i < parts.length) {
				const part = parts[i];
				// Removal has precedence: '!!' (e.g. A!!B removes an existing or pending constraint)
				if (part.includes('!!')) {
					const [leftRaw, rightRaw] = part.split('!!').map(s => s.trim());
					const leftNames = leftRaw.split(',').map(n => n.trim()).filter(n => n !== '');
					let rightNames = rightRaw ? rightRaw.split(',').map(n => n.trim()).filter(n => n !== '') : [];
					let j = i + 1;
					while (j < parts.length && !parts[j].includes('!')) {
						rightNames.push(parts[j]);
						j++;
					}
					leftNames.forEach(ln => {
						rightNames.forEach(rn => {
							if (!ln || !rn) return;
							removeForbiddenPairByNames(ln, rn);
						});
					});
					i = j;
				} else if (part.includes('!')) {
					const [leftRaw, rightRaw] = part.split('!').map(s => s.trim());
					const leftNames = leftRaw.split(',').map(n => n.trim()).filter(n => n !== '');
					let rightNames = rightRaw ? rightRaw.split(',').map(n => n.trim()).filter(n => n !== '') : [];
					// consume following parts that do NOT contain '!' as additional right-side names
					let j = i + 1;
					while (j < parts.length && !parts[j].includes('!')) {
						rightNames.push(parts[j]);
						j++;
					}
					leftNames.forEach(ln => {
						rightNames.forEach(rn => {
							if (!ln || !rn) return;
							const pa = findPersonByName(ln);
							const pb = findPersonByName(rn);
							if (pa && pb) {
								const res = addForbiddenPairByNames(ln, rn);
								if (!res.ok) console.log('금지 제약 추가 실패:', res.message);
								else console.log(`금지 제약 추가됨: ${ln} ! ${rn}`);
							} else {
								const pres = addPendingConstraint(ln, rn);
								if (!pres.ok) console.log('보류 제약 추가 실패:', pres.message);
							}
						});
					});
					i = j;
				} else {
					i++;
				}
			}
		} else {
			// Normal group / name token
			const names = token.split(',').map(n => n.trim()).filter(n => n !== '');
			if (names.length === 0) return;
			const newIds = [];
		
			names.forEach(name => {
				const normalized = normalizeName(name);
				const exists = state.people.some(p => normalizeName(p.name) === normalized);
				if (exists) {
					// Prevent duplicate names
					alert(`${name}은(는) 이미 등록된 이름입니다.`);
					return;
				}
				const person = {
					id: state.nextId++,
					name: name,
					gender: 'male',
					weight: 100
				};
				state.people.push(person);
				newIds.push(person.id);
				addedAny = true;
			});
			if (newIds.length > 1) {
				state.requiredGroups.push(newIds);
			}
		}
	});

	elements.nameInput.value = '';
	elements.nameInput.focus();
	if (addedAny) renderPeople();
	// After possibly adding people, try to resolve pending textual constraints
	tryResolvePendingConstraints();
}

function removePerson(id) {
	state.people = state.people.filter(p => p.id !== id);
	state.requiredGroups = state.requiredGroups.map(group => group.filter(pid => pid !== id));
	state.requiredGroups = state.requiredGroups.filter(group => group.length > 1);
	// Remove any forbidden pairs involving this person
	const before = state.forbiddenPairs.length;
	state.forbiddenPairs = state.forbiddenPairs.filter(([a, b]) => a !== id && b !== id);
	const after = state.forbiddenPairs.length;
	if (before !== after) {
		console.log(`제약 제거: 삭제된 사람(id:${id})과 관련된 제약 ${before - after}개가 제거되었습니다.`);
	}
	buildForbiddenMap();
	renderPeople();
}

function updatePersonGender(id, gender) {
	const person = state.people.find(p => p.id === id);
	if (person) {
		person.gender = gender;
	}
}

function updatePersonWeight(id, weight) {
	const person = state.people.find(p => p.id === id);
	if (person) {
		person.weight = parseInt(weight) || 0;
	}
}

// --- Helper functions for constraints and name normalization ---
function normalizeName(name) {
	return (name || '').trim().toLowerCase();
}

function findPersonByName(name) {
	return state.people.find(p => normalizeName(p.name) === normalizeName(name));
}

function addForbiddenPairByNames(nameA, nameB) {
	const pa = findPersonByName(nameA);
	const pb = findPersonByName(nameB);
	if (!pa || !pb) {
		const msg = `등록된 사용자 중에 ${!pa ? nameA : nameB}을(를) 찾을 수 없습니다.`;
		console.log('금지 제약 추가 실패:', msg);
		return { ok: false, message: msg };
	}
	if (pa.id === pb.id) {
		const msg = '동일인에 대한 제약은 불가능합니다.';
		console.log('금지 제약 추가 실패:', msg);
		return { ok: false, message: msg };
	}
	const gA = getPersonGroupIndex(pa.id);
	const gB = getPersonGroupIndex(pb.id);
	if (gA !== -1 && gA === gB) {
		const msg = `${pa.name}와 ${pb.name}는 같은 그룹에 속해 있어 제약을 추가할 수 없습니다.`;
		console.log('금지 제약 추가 실패:', msg);
		return { ok: false, message: msg };
	}
	const exists = state.forbiddenPairs.some(([a, b]) => (a === pa.id && b === pb.id) || (a === pb.id && b === pa.id));
	if (!exists) {
		state.forbiddenPairs.push([pa.id, pb.id]);
		buildForbiddenMap();
		console.log(`금지 제약 추가됨: ${pa.name} (id:${pa.id}) ! ${pb.name} (id:${pb.id})`);
	} else {
		console.log(`금지 제약이 이미 존재함: ${pa.name} ! ${pb.name}`);
	}
	return { ok: true };
}

// Add a pending constraint by name (allows adding before people exist)
function addPendingConstraint(leftName, rightName) {
	const l = normalizeName(leftName);
	const r = normalizeName(rightName);
	if (l === r) return { ok: false, message: '동일인 제약은 불가능합니다.' };
	// Avoid duplicates in pending
	const existsPending = state.pendingConstraints.some(pc => pc.left === l && pc.right === r);
	if (existsPending) return { ok: true };
	state.pendingConstraints.push({ left: l, right: r });
	console.log(`보류 제약 추가됨(사람 미등록): ${leftName} ! ${rightName}`);
	return { ok: true };
}

// Try to resolve any pending constraints when new people are added
function tryResolvePendingConstraints() {
	if (!state.pendingConstraints.length) return;
	let changed = false;
	state.pendingConstraints = state.pendingConstraints.filter(pc => {
		const pa = findPersonByName(pc.left);
		const pb = findPersonByName(pc.right);
		if (pa && pb) {
			const res = addForbiddenPairByNames(pa.name, pb.name);
			if (res.ok) console.log(`보류 제약이 해결되어 적용됨: ${pa.name} ! ${pb.name}`);
			changed = true;
			return false; // remove from pending
		}
		return true; // keep pending
	});
	if (changed) buildForbiddenMap();
}

// Detect local viewing (file:// or localhost) so we can adjust behavior for developer convenience
function isLocalView() {
	try {
		const proto = window.location.protocol || '';
		const host = window.location.hostname || '';
		return proto === 'file:' || host === 'localhost' || host === '127.0.0.1' || host === '';
	} catch (e) {
		return false;
	}
}

function adjustLocalSettings() {
	if (isLocalView()) {
		state.teamDisplayDelay = 0;
		console.log('로컬 환경 감지: 팀 표시 지연을 0ms로 설정합니다. (빠른 로컬 미리보기)');
	}
}



// Remove a forbidden pair by names (supports applied pairs or pending constraints). Accepts either order.
function removeForbiddenPairByNames(nameA, nameB) {
	const na = normalizeName(nameA);
	const nb = normalizeName(nameB);
	if (na === nb) {
		console.log('제약 제거 실패: 동일인 제약은 불가능합니다.');
		return { ok: false, message: '동일인 제약은 불가능합니다.' };
	}
	// Try removing applied (id-based) forbidden pair if both persons exist
	const pa = findPersonByName(na);
	const pb = findPersonByName(nb);
	if (pa && pb) {
		const before = state.forbiddenPairs.length;
		state.forbiddenPairs = state.forbiddenPairs.filter(([a, b]) => !((a === pa.id && b === pb.id) || (a === pb.id && b === pa.id)));
		if (state.forbiddenPairs.length !== before) {
			buildForbiddenMap();
			console.log(`금지 제약 제거됨: ${pa.name} ! ${pb.name}`);
			return { ok: true };
		}
	}
	// If no applied pair found (or persons not present), remove matching pending textual constraints (either order)
	const beforePending = state.pendingConstraints.length;
	state.pendingConstraints = state.pendingConstraints.filter(pc => !( (pc.left === na && pc.right === nb) || (pc.left === nb && pc.right === na) ));
	if (state.pendingConstraints.length !== beforePending) {
		console.log(`보류 제약 제거됨: ${nameA} ! ${nameB}`);
		return { ok: true };
	}
	console.log('제약 제거 실패: 해당 제약을 찾을 수 없습니다.');
	return { ok: false, message: '해당 제약을 찾을 수 없습니다.' };
}

function buildForbiddenMap() {
	state.forbiddenMap = {};
	state.forbiddenPairs.forEach(([a, b]) => {
		if (!state.forbiddenMap[a]) state.forbiddenMap[a] = new Set();
		if (!state.forbiddenMap[b]) state.forbiddenMap[b] = new Set();
		state.forbiddenMap[a].add(b);
		state.forbiddenMap[b].add(a);
	});
}

function isForbidden(aId, bId) {
	return state.forbiddenMap[aId] && state.forbiddenMap[aId].has(bId);
}

function teamHasForbiddenConflict(team, person) {
	return team.some(m => isForbidden(m.id, person.id));
}

function conflictExists(teams) {
	for (const team of teams) {
		for (let i = 0; i < team.length; i++) {
			for (let j = i + 1; j < team.length; j++) {
				if (isForbidden(team[i].id, team[j].id)) return true;
			}
		}
	}
	return false;
}

function getPersonGroupIndex(personId) {
	return state.requiredGroups.findIndex(group => group.includes(personId));
}

function getGroupColor(groupIndex) {
	if (groupIndex === -1) {
		return state.ungroupedColor;
	}
	return state.groupColors[groupIndex % state.groupColors.length];
}

function createPersonTag(person) {
	const personTag = document.createElement('div');
	personTag.className = 'person-tag';
	
	if (state.genderBalanceEnabled) {
		personTag.style.backgroundColor = person.gender === 'male' ? '#e0f2fe' : '#fce7f3';
	}
	
	const nameSpan = document.createElement('span');
	nameSpan.className = 'name';
	nameSpan.textContent = person.name;
	personTag.appendChild(nameSpan);
	
	if (state.genderBalanceEnabled) {
		const genderToggle = document.createElement('button');
		genderToggle.className = 'gender-toggle-circle';
		genderToggle.textContent = person.gender === 'male' ? '♂️' : '♀️';
		genderToggle.addEventListener('click', (e) => {
			e.stopPropagation();
			const newGender = person.gender === 'male' ? 'female' : 'male';
			updatePersonGender(person.id, newGender);
			renderPeople();
		});
		personTag.appendChild(genderToggle);
	}
	
	if (state.weightBalanceEnabled) {
		const weightInput = document.createElement('input');
		weightInput.type = 'number';
		weightInput.className = 'weight-input';
		weightInput.value = person.weight;
		weightInput.min = '0';
		weightInput.addEventListener('input', (e) => {
			updatePersonWeight(person.id, e.target.value);
		});
		personTag.appendChild(weightInput);
	}
	
	const removeBtn = document.createElement('button');
	removeBtn.textContent = '×';
	removeBtn.className = 'remove-btn';
	removeBtn.addEventListener('click', () => removePerson(person.id));
	
	personTag.appendChild(removeBtn);
	
	return personTag;
}

function updateParticipantCount() {
	if (!elements.participantCount) return;

	const count = state.people.length;
	elements.participantCount.textContent = count;

	const em = elements.participantCount.closest('em');
	if (em) {
		if (count === 0) {
			em.style.display = 'none';
			em.setAttribute('aria-hidden', 'true');
		} else {
			em.style.display = 'inline-flex';
			em.setAttribute('aria-hidden', 'false');
		}
	}
}

function renderPeople() {
	updateParticipantCount();
	elements.peopleList.innerHTML = '';
	
	const grouped = new Set();
	
	state.requiredGroups.forEach((group, groupIndex) => {
		const groupContainer = document.createElement('div');
		groupContainer.className = 'group-container';
		groupContainer.style.borderColor = getGroupColor(groupIndex);
		
		group.forEach(personId => {
			const person = state.people.find(p => p.id === personId);
			if (person) {
				grouped.add(personId);
				const personTag = createPersonTag(person);
				groupContainer.appendChild(personTag);
			}
		});
		
		elements.peopleList.appendChild(groupContainer);
	});
	
	state.people.forEach(person => {
		if (!grouped.has(person.id)) {
			const personTag = createPersonTag(person);
			elements.peopleList.appendChild(personTag);
		}
	});
}

function shuffleTeams() {
	if (state.people.length === 0) {
		showError('참가자를 추가해주세요.');
		return;
	}
	
	const validPeople = state.people.filter(p => p.name.trim() !== '');
	if (validPeople.length === 0) {
		showError('최소 1명 이상의 이름을 입력해주세요.');
		return;
	}
	
	if (state.membersPerTeam < 2) {
		showError('팀 인원수는 최소 2명 이상이어야 합니다.');
		return;
	}
	
	if (validPeople.length < state.membersPerTeam) {
		showError('참가자 수가 팀 인원수보다 적습니다.');
		return;
	}
	
	const teams = generateTeams(validPeople);
	if (!teams) return; // generateTeams shows error when impossible
	displayTeams(teams);
}

function generateTeams(people) {
	buildForbiddenMap();

	// Quick validation: a required group cannot contain a forbidden pair
	for (const group of state.requiredGroups) {
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				if (isForbidden(group[i], group[j])) {
					showError('같은 그룹에 금지 제약이 있으므로 팀 배치가 불가능합니다. 제약을 확인하세요.');
					return null;
				}
			}
		}
	}

	const teamCount = Math.max(1, Math.ceil(people.length / state.membersPerTeam));
	const maxAttempts = 200;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const teams = Array.from({ length: teamCount }, () => []);
		const assigned = new Set();

		const validGroups = state.requiredGroups.filter(group => 
			group.every(id => people.some(p => p.id === id))
		);

		const shuffledGroups = [...validGroups].sort(() => Math.random() - 0.5);
		shuffledGroups.forEach((group, index) => {
			const teamIndex = index % teamCount;
			const groupMembers = group.map(id => people.find(p => p.id === id)).filter(Boolean);
			teams[teamIndex].push(...groupMembers);
			groupMembers.forEach(m => assigned.add(m.id));
		});

		const unassignedPeople = [...people.filter(p => !assigned.has(p.id))].sort(() => Math.random() - 0.5);

		// assign unassigned people trying to avoid forbidden conflicts
		for (const person of unassignedPeople) {
			if (state.genderBalanceEnabled) {
				const teamStats = teams.map((team, idx) => ({
					idx,
					genderCount: team.filter(p => p.gender === person.gender).length,
					totalSize: team.length,
					totalWeight: team.reduce((sum, p) => sum + (p.weight || 0), 0)
				}));

				const minGenderCount = Math.min(...teamStats.map(t => t.genderCount));
				let candidates = teamStats.filter(t => t.genderCount === minGenderCount);

				const minSize = Math.min(...candidates.map(t => t.totalSize));
				candidates = candidates.filter(t => t.totalSize === minSize);

				// Prefer candidates with no forbidden conflict
				let eligible = candidates.filter(t => !teamHasForbiddenConflict(teams[t.idx], person));

				if (eligible.length === 0) {
					// broaden search to any team with zero conflict
					const zeroConflict = teamStats.filter(t => !teamHasForbiddenConflict(teams[t.idx], person));
					if (zeroConflict.length > 0) {
						const minZeroSize = Math.min(...zeroConflict.map(t => t.totalSize));
						eligible = zeroConflict.filter(t => t.totalSize === minZeroSize);
					}
				}

				let chosen;
				if (eligible.length > 0) {
					if (state.weightBalanceEnabled) {
						const minWeight = Math.min(...eligible.map(t => t.totalWeight));
						const lightest = eligible.filter(t => t.totalWeight === minWeight);
						chosen = lightest[Math.floor(Math.random() * lightest.length)];
					} else {
						chosen = eligible[Math.floor(Math.random() * eligible.length)];
					}
				} else {
					// No zero-conflict team found — pick team with minimal conflict count and smallest size
					let bestScore = Infinity;
					let bestTeams = [];
					for (const t of teamStats) {
						const conflictCount = teams[t.idx].reduce((c, m) => c + (isForbidden(m.id, person.id) ? 1 : 0), 0);
						const score = conflictCount * 1000 + t.totalSize; // prioritize fewer conflicts, then smaller size
						if (score < bestScore) { bestScore = score; bestTeams = [t]; }
						else if (score === bestScore) bestTeams.push(t);
					}
					chosen = bestTeams[Math.floor(Math.random() * bestTeams.length)];
				}

				teams[chosen.idx].push(person);
			} else if (state.weightBalanceEnabled) {
				const sortedTeams = teams.map((team, idx) => ({ team, idx, size: team.length, totalWeight: team.reduce((s, p) => s + (p.weight || 0), 0) }));
				const minSize = Math.min(...sortedTeams.map(t => t.size));
				let smallest = sortedTeams.filter(t => t.size === minSize);

				let eligible = smallest.filter(t => !teamHasForbiddenConflict(t.team, person));
				if (eligible.length === 0) {
					// expand to any team with zero conflict
					const zeroConflict = sortedTeams.filter(t => !teamHasForbiddenConflict(t.team, person));
					if (zeroConflict.length > 0) {
						const minZeroSize = Math.min(...zeroConflict.map(t => t.size));
						eligible = zeroConflict.filter(t => t.size === minZeroSize);
					}
				}

				if (eligible.length > 0) {
					const minWeight = Math.min(...eligible.map(t => t.totalWeight));
					const chosenTeam = eligible.filter(t => t.totalWeight === minWeight)[0];
					teams[chosenTeam.idx].push(person);
				} else {
					// fallback minimal conflict
					let bestScore = Infinity; let bestTeams = [];
					for (const t of sortedTeams) {
						const conflictCount = t.team.reduce((c, m) => c + (isForbidden(m.id, person.id) ? 1 : 0), 0);
						const score = conflictCount * 1000 + t.size;
						if (score < bestScore) { bestScore = score; bestTeams = [t]; }
						else if (score === bestScore) bestTeams.push(t);
					}
					const chosenTeam = bestTeams[Math.floor(Math.random() * bestTeams.length)];
					teams[chosenTeam.idx].push(person);
				}
			} else {
				const teamSizes = teams.map(t => t.length);
				const minSize = Math.min(...teamSizes);
				let smallestTeams = teams.map((team, idx) => ({ team, idx, size: team.length })).filter(t => t.size === minSize);
				let eligible = smallestTeams.filter(t => !teamHasForbiddenConflict(t.team, person));
				let chosenTeam;
				if (eligible.length > 0) chosenTeam = eligible[Math.floor(Math.random() * eligible.length)];
				else {
					// minimal conflict fallback
					let bestScore = Infinity; let bestTeams = [];
					for (const t of smallestTeams) {
						const conflictCount = t.team.reduce((c, m) => c + (isForbidden(m.id, person.id) ? 1 : 0), 0);
						const score = conflictCount * 1000 + t.size;
						if (score < bestScore) { bestScore = score; bestTeams = [t]; }
						else if (score === bestScore) bestTeams.push(t);
					}
					chosenTeam = bestTeams[Math.floor(Math.random() * bestTeams.length)];
				}
				teams[chosenTeam.idx].push(person);
			}
		}

		// If assignment succeeded without conflicts, return teams
		if (!conflictExists(teams)) {
			return teams;
		}
	}

	showError('제약 조건으로 팀 배치가 불가능합니다. 제약을 검토해주세요.');
	return null;
}

async function displayTeams(teams) {
	// hide FAQ when teams are shown
	const faqSection = document.querySelector('.faq-section');
	if (faqSection) faqSection.style.display = 'none';
	elements.teamsDisplay.innerHTML = '';
	
	// 1단계: 모든 팀 카드를 빈 상태로 생성
	const teamCards = [];
	teams.forEach((team, index) => {
		const teamCard = document.createElement('div');
		teamCard.className = 'team-card';
		
		const teamTitle = document.createElement('h3');
		teamTitle.dataset.teamIndex = index;
		let titleText = `팀 ${index + 1} (${team.length}명)`;
		if (state.weightBalanceEnabled) {
			titleText += ` - 가중치: 0`;
		}
		teamTitle.textContent = titleText;
		teamCard.appendChild(teamTitle);
		
		const membersList = document.createElement('ul');
		membersList.className = 'team-members-list';
		teamCard.appendChild(membersList);
		
		elements.teamsDisplay.appendChild(teamCard);
		teamCards.push({ card: teamCard, title: teamTitle, list: membersList, team: team, currentWeight: 0 });
	});
	
	elements.resultsSection.classList.add('visible');
	
	// 2단계: 모든 팀에 돌아가면서 인원을 추가 (라운드 로빈)
	const maxMembers = Math.max(...teams.map(t => t.length));
	
	for (let memberIndex = 0; memberIndex < maxMembers; memberIndex++) {
		for (let teamIndex = 0; teamIndex < teamCards.length; teamIndex++) {
			const teamCardData = teamCards[teamIndex];
			const { list, team, title } = teamCardData;
			
			if (memberIndex < team.length) {
				const person = team[memberIndex];
				const li = document.createElement('li');
				let displayText = person.name;
				if (state.weightBalanceEnabled) {
					displayText += ` (${person.weight})`;
				}
				li.textContent = displayText;
				
				if (state.genderBalanceEnabled) {
					const genderColor = person.gender === 'male' ? '#3b82f6' : '#ec4899';
					li.style.borderLeft = `4px solid ${genderColor}`;
				}
				
				const groupIndex = getPersonGroupIndex(person.id);
				if (groupIndex !== -1) {
					const color = getGroupColor(groupIndex);
					const dotSpan = document.createElement('span');
					dotSpan.className = 'result-group-dot';
					dotSpan.style.backgroundColor = color;
					li.appendChild(dotSpan);
				}
				list.appendChild(li);
				
				// 가중치 업데이트
				if (state.weightBalanceEnabled) {
					teamCardData.currentWeight += person.weight || 0;
					const titleText = `팀 ${teamIndex + 1} (${memberIndex + 1}명) - 가중치: ${teamCardData.currentWeight}`;
					title.textContent = titleText;
				}
				
				// 마지막 인원이 아닌 경우에만 지연
				const isLastMember = memberIndex === maxMembers - 1 && teamIndex === teamCards.length - 1;
				if (!isLastMember) {
					await new Promise(resolve => setTimeout(resolve, state.teamDisplayDelay));
				}
			}
		}
	}
	
	elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function showError(message) {
	elements.teamsDisplay.innerHTML = `<div class="error-message">${message}</div>`;
	elements.resultsSection.classList.add('visible');
	elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

init();
