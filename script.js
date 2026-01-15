const teamDisplayDelay = isLocalView() ? 0 : 400;
const maxTimer = isLocalView() ? 0 : 3000;
const blindDelay = isLocalView() ? null : 5000;
try { window.blindDelay = blindDelay; } catch (_) { /* no-op */ }

const state = {
	people: [],
	requiredGroups: [],
	forbiddenPairs: [], // array of [idA, idB]
	forbiddenMap: {},   // built from forbiddenPairs for fast lookup
	pendingConstraints: [], // array of {left: normalized, right: normalized}
	genderBalanceEnabled: false,
	weightBalanceEnabled: false,
	maxTeamSizeEnabled: false,
	membersPerTeam: 4,
	nextId: 1,
	teamDisplayDelay,
	ungroupedColor: '#94a3b8',
	groupColors: [
		// Bright, high-contrast palette (kept colorblind-friendly spread)
		'#FF6B6B', // bright coral
		'#4ECDC4', // aqua teal
		'#DDDD00', // vivid yellow
		'#1E90FF', // dodger blue
		'#8AC926', // lime green
		'#FF1FCD', // hot pink
		'#E71D36', // crimson red
		'#7C3AED', // vibrant violet
		'#F3722C', // persimmon
		'#B5179E', // magenta
		'#FFCA00'  // golden yellow
	]
};

const elements = {
	genderBalanceCheckbox: document.getElementById('genderBalanceCheckbox'),
	weightBalanceCheckbox: document.getElementById('weightBalanceCheckbox'),
	maxTeamSizeCheckbox: document.getElementById('maxTeamSizeCheckbox'),
	teamSizeInput: document.getElementById('teamSizeInput'),
	nameInput: document.getElementById('nameInput'),
	addPersonBtn: document.getElementById('addPersonBtn'),
	resetBtn: document.getElementById('resetBtn'),
	shuffleOrderBtn: document.getElementById('shuffleOrderBtn'),
	peopleList: document.getElementById('peopleList'),
	shuffleBtn: document.getElementById('shuffleBtn'),
	resultsSection: document.getElementById('resultsSection'),
	teamsDisplay: document.getElementById('teamsDisplay'),
	participantCount: document.querySelector('.participantCount'),
	captureBtn: document.getElementById('captureBtn'),
	captureButtonContainer: document.querySelector('.capture-button-container')
};

// Warning popup auto-hide timer id
let warningHideTimer = null;
let warningHovering = false;
let captureSuccessTimer = null;

function init() {
	elements.genderBalanceCheckbox.addEventListener('change', handleGenderBalanceToggle);
	elements.weightBalanceCheckbox.addEventListener('change', handleWeightBalanceToggle);
	elements.maxTeamSizeCheckbox.addEventListener('change', handleMaxTeamSizeToggle);
	elements.teamSizeInput.addEventListener('change', handleTeamSizeChange);
	elements.addPersonBtn.addEventListener('click', addPerson);
	elements.resetBtn.addEventListener('click', resetAll);
	elements.shuffleOrderBtn.addEventListener('click', shuffleOrder);
	elements.nameInput.addEventListener('keypress', (e) => {
		if (e.key === 'Enter') {
			addPerson();
		}
	});
	elements.shuffleBtn.addEventListener('click', shuffleTeams);
	if (elements.captureBtn) {
		elements.captureBtn.addEventListener('click', captureResultsSection);
		// 호버 시 캡처 영역 하이라이트
		elements.captureBtn.addEventListener('mouseenter', () => {
			if (elements.resultsSection.classList.contains('visible')) {
				elements.resultsSection.classList.add('capture-highlight');
			}
		});
		elements.captureBtn.addEventListener('mouseleave', () => {
			elements.resultsSection.classList.remove('capture-highlight');
		});
	}
	// Wire warning popup close
	const warnClose = document.querySelector('#warningPopup .warning-popup__close');
	if (warnClose) {
		warnClose.addEventListener('click', () => {
			const panel = document.getElementById('warningPopup');
			if (panel) { panel.classList.remove('is-visible'); panel.setAttribute('aria-hidden','true'); }
			applyDuplicateHighlights([]);
		});
	}
	// Hide warning popup on Enter or Escape
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' || e.key === 'Esc' || e.key === 'Enter') {
			hideWarnings();
		}
	});
	// Track pointer hover over warning popup to pause auto-hide
	document.addEventListener('mousemove', handleWarningHover);

	// 그룹 색상 팔레트는 세션당 한 번 랜덤 셔플
	shuffleGroupColorsOnce();

	// 팀 표시 애니메이션 시간: teamDisplayDelay의 50%로 설정
	setTeamAnimDurationFromDelay();

	// localStorage에서 데이터 복원
	loadFromLocalStorage();

	renderPeople();
	// prepare forbidden pairs map
	buildForbiddenMap();
	// try to resolve any pending textual constraints (if users were added earlier)
	tryResolvePendingConstraints();
	
	// 제약이 있으면 확인 레이어 띄우기 (모든 초기화 완료 후)
	if (state.forbiddenPairs.length > 0 || state.pendingConstraints.length > 0) {
		setTimeout(() => {
			showConstraintNotification();
		}, 100);
	}
	
	// 제약 목록 확인 레이어 이벤트 리스너
	const constraintNotificationConfirm = document.getElementById('constraintNotificationConfirm');
	const constraintNotificationCancel = document.getElementById('constraintNotificationCancel');
	
	if (constraintNotificationConfirm) {
		constraintNotificationConfirm.addEventListener('click', () => {
			hideConstraintNotification();
			safeOpenForbiddenWindow();
		});
	}
	
	if (constraintNotificationCancel) {
		constraintNotificationCancel.addEventListener('click', () => {
			// 제약 초기화
			state.forbiddenPairs = [];
			state.pendingConstraints = [];
			state.forbiddenMap = {};
			saveToLocalStorage();
			console.log('제약 목록이 모두 초기화되었습니다.');
			hideConstraintNotification();
		});
	}
}

// 제약 목록 확인 레이어 표시
function showConstraintNotification() {
	const layer = document.getElementById('constraintNotificationLayer');
	if (layer) {
		layer.style.display = 'block';
		// 브라우저 리플로우를 위한 지연
		setTimeout(() => {
			layer.classList.add('visible');
			layer.classList.remove('hiding');
		}, 10);
	}
}

// 제약 목록 확인 레이어 숨김
function hideConstraintNotification() {
	const layer = document.getElementById('constraintNotificationLayer');
	if (layer) {
		layer.classList.remove('visible');
		layer.classList.add('hiding');
		// 애니메이션 완료 후 display: none
		setTimeout(() => {
			if (layer.classList.contains('hiding')) {
				layer.style.display = 'none';
				layer.classList.remove('hiding');
			}
		}, 300);
	}
}

// localStorage에 저장
function saveToLocalStorage() {
	try {
		const data = {
			people: state.people,
			requiredGroups: state.requiredGroups,
			nextId: state.nextId,
			forbiddenPairs: state.forbiddenPairs,
			pendingConstraints: state.pendingConstraints,
			// 설정 값 저장
			maxTeamSizeEnabled: state.maxTeamSizeEnabled,
			genderBalanceEnabled: state.genderBalanceEnabled,
			weightBalanceEnabled: state.weightBalanceEnabled,
			membersPerTeam: state.membersPerTeam
		};
		localStorage.setItem('teamMakerData', JSON.stringify(data));
		
		// 이름별 성별/가중치 기본값 저장
		const personDefaults = {};
		state.people.forEach(p => {
			const normalized = normalizeName(p.name);
			personDefaults[normalized] = {
				gender: p.gender,
				weight: p.weight
			};
		});
		localStorage.setItem('teamMakerDefaults', JSON.stringify(personDefaults));
	} catch (e) {
		console.error('localStorage 저장 실패:', e);
	}
}

// localStorage에서 복원
function loadFromLocalStorage() {
	try {
		const saved = localStorage.getItem('teamMakerData');
		if (saved) {
			const data = JSON.parse(saved);
			state.people = data.people || [];
			// 참가자 목록을 이름순으로 정렬
			state.people.sort((a, b) => a.name.localeCompare(b.name));
			state.requiredGroups = data.requiredGroups || [];
			state.nextId = data.nextId || 1;
			state.forbiddenPairs = data.forbiddenPairs || [];
			state.pendingConstraints = data.pendingConstraints || [];
			
			// 설정 값 복원
			if (typeof data.maxTeamSizeEnabled !== 'undefined') {
				state.maxTeamSizeEnabled = data.maxTeamSizeEnabled;
				elements.maxTeamSizeCheckbox.checked = data.maxTeamSizeEnabled;
			}
			if (typeof data.genderBalanceEnabled !== 'undefined') {
				state.genderBalanceEnabled = data.genderBalanceEnabled;
				elements.genderBalanceCheckbox.checked = data.genderBalanceEnabled;
			}
			if (typeof data.weightBalanceEnabled !== 'undefined') {
				state.weightBalanceEnabled = data.weightBalanceEnabled;
				elements.weightBalanceCheckbox.checked = data.weightBalanceEnabled;
			}
			if (typeof data.membersPerTeam !== 'undefined') {
				state.membersPerTeam = data.membersPerTeam;
				elements.teamSizeInput.value = data.membersPerTeam;
			}
			
			// 콘솔에 복원된 데이터 출력
			console.group('📦 저장된 데이터 복원');
			
			if (state.people.length > 0) {
				console.log('%c👥 참가자 목록', 'color: #667eea; font-weight: bold; font-size: 14px;');
				const sortedPeople = [...state.people].sort((a, b) => a.name.localeCompare(b.name));
				const peopleTable = sortedPeople.map(p => ({
					'이름': p.name,
					'성별': p.gender === 'male' ? '♂️' : '♀️',
					'가중치': p.weight || '-'
				}));
				console.table(peopleTable);
			} else {
				console.log('%c👥 참가자: 없음', 'color: #999; font-style: italic;');
			}
			
			if (state.forbiddenPairs.length > 0) {
				console.log('%c🚫 적용된 제약', 'color: #ef4444; font-weight: bold; font-size: 14px;');
				state.forbiddenPairs.forEach((pair, idx) => {
					const person1 = state.people.find(p => p.id === pair[0]);
					const person2 = state.people.find(p => p.id === pair[1]);
					if (person1 && person2) {
						console.log(`  ${idx + 1}. ${person1.name} ↔ ${person2.name}`);
					}
				});
			} else {
				console.log('%c🚫 적용된 제약: 없음', 'color: #999; font-style: italic;');
			}
			
			if (state.pendingConstraints.length > 0) {
				console.log('%c⏳ 대기 중인 제약', 'color: #f59e0b; font-weight: bold; font-size: 14px;');
				state.pendingConstraints.forEach((constraint, idx) => {
					console.log(`  ${idx + 1}. ${constraint.left} ↔ ${constraint.right}`);
				});
			} else {
				console.log('%c⏳ 대기 중인 제약: 없음', 'color: #999; font-style: italic;');
			}
			
			console.groupEnd();
		}
	} catch (e) {
		console.error('localStorage 복원 실패:', e);
	}
}

// 이름별 기본값 가져오기
function getPersonDefaults(name) {
	try {
		const saved = localStorage.getItem('teamMakerDefaults');
		if (saved) {
			const defaults = JSON.parse(saved);
			const normalized = normalizeName(name);
			return defaults[normalized] || null;
		}
	} catch (e) {
		console.error('기본값 가져오기 실패:', e);
	}
	return null;
}

// 결과 섹션 캐처 기능
function captureResultsSection() {
	const section = elements.resultsSection;
	if (!section || !section.classList.contains('visible')) {
		alert('팀 생성 결과가 없습니다.');
		return;
	}
	
	// html2canvas가 로드되었는지 확인
	if (typeof html2canvas === 'undefined') {
		alert('html2canvas 라이브러리를 찾을 수 없습니다.');
		return;
	}
	
	// 캡처할 실제 영역 (::after 효과 제외)
	const captureArea = section.querySelector('.results-capture-area');
	if (!captureArea) {
		alert('캡처 영역을 찾을 수 없습니다.');
		return;
	}
	
	// 기존 타이머 클리어 및 버튼 상태 초기화
	if (captureSuccessTimer) {
		clearTimeout(captureSuccessTimer);
		captureSuccessTimer = null;
	}
	
	// 플래시 효과 추가 (::after 가상요소)
	section.classList.add('capture-flash');
	
	// 찰칵 사운드 재생
	playCameraShutterSound();
	
	// 애니메이션 종료 후 클래스 제거
	setTimeout(() => {
		section.classList.remove('capture-flash');
	}, 600);
	
	// 캐처 버튼 임시 비활성화
	const btn = elements.captureBtn;
	btn.innerHTML = '화면 캡처 <span class="camera-emoji">📸</span>';
	const originalHTML = btn.innerHTML;
	btn.textContent = '캡처 중...';
	btn.disabled = true;
	
	// 플래시 효과 후 약간 대기
	setTimeout(() => {
		html2canvas(captureArea, {
		backgroundColor: '#f8f9fa',
		scale: 2,
		logging: false,
		allowTaint: true,
		useCORS: true
	}).then(canvas => {
		// 캔버스를 이미지로 변환하여 클립보드에 복사
		canvas.toBlob(blob => {
			if (!blob) {
				alert('이미지 생성에 실패했습니다.');
				btn.innerHTML = originalHTML;
				btn.disabled = false;
				return;
			}
			
			// 클립보드 API 확인
			if (!navigator.clipboard || !navigator.clipboard.write) {
				alert('클립보드 기능을 사용할 수 없습니다. HTTPS 환경이 필요합니다.');
				btn.innerHTML = originalHTML;
				btn.disabled = false;
				return;
			}
			
			// 클립보드에 이미지 복사
			const item = new ClipboardItem({ 'image/png': blob });
			navigator.clipboard.write([item]).then(() => {
				// 성공 메시지
				btn.textContent = '복사 완료!';
				captureSuccessTimer = setTimeout(() => {
					btn.innerHTML = originalHTML;
					captureSuccessTimer = null;
				}, 2000);
				btn.disabled = false;
			}).catch(err => {
				console.error('클립보드 복사 실패:', err);
				alert('클립보드 복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
				btn.innerHTML = originalHTML;
				btn.disabled = false;
			});
		}, 'image/png');
	}).catch(err => {
		console.error('캐처 실패:', err);
		alert('화면 캐처에 실패했습니다.');
		btn.innerHTML = originalHTML;
		btn.disabled = false;
	});
	}, 100);
}

// 카메라 셔터 사운드 재생
function playCameraShutterSound() {
	try {
		const audioContext = new (window.AudioContext || window.webkitAudioContext)();
		const oscillator = audioContext.createOscillator();
		const gainNode = audioContext.createGain();
		
		oscillator.connect(gainNode);
		gainNode.connect(audioContext.destination);
		
		// 찰칵 소리 효과
		oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
		oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.1);
		
		gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
		gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
		
		oscillator.start(audioContext.currentTime);
		oscillator.stop(audioContext.currentTime + 0.1);
	} catch (e) {
		console.log('사운드 재생 실패:', e);
	}
}

function resetAll() {
	if (!confirm('모든 데이터를 초기화하시겠습니까?\n참고: 제약 설정(금지 제약)은 초기화되지 않습니다.')) {
		return;
	}
	// Hide any visible warning popup when resetting lists/state
	hideWarnings();
	// Convert any applied (id-based) forbidden pairs into pending name-based constraints so they persist
	let converted = 0;
	state.forbiddenPairs.forEach(([a, b]) => {
		const pa = state.people.find(p => p.id === a);
		const pb = state.people.find(p => p.id === b);
		if (pa && pb) {
			if (addPendingConstraint(pa.name, pb.name).ok) converted++;
		}
	});
	if (converted > 0) {
		console.log(`초기화: 기존 제약 ${converted}개가 보류 제약으로 변환되어 유지됩니다.`);
			safeOpenForbiddenWindow();
	}
	// Clear people and groups, keep pendingConstraints intact so constraints persist
	state.people = [];
	state.requiredGroups = [];
	state.nextId = 1;
	state.forbiddenPairs = []; // clear id-based pairs (they become pending)
	state.forbiddenMap = {};
	elements.resultsSection.classList.remove('visible');
	// 캡처 버튼 컨테이너 숨기기
	if (elements.captureButtonContainer) {
		elements.captureButtonContainer.style.display = 'none';
	}
	// show FAQ again when resetting
	const faqSection = document.querySelector('.faq-section');
	if (faqSection) faqSection.style.display = '';
	saveToLocalStorage();
	renderPeople();
}

function handleGenderBalanceToggle(e) {
	state.genderBalanceEnabled = e.target.checked;
	saveToLocalStorage();
	renderPeople();
}

function handleWeightBalanceToggle(e) {
	state.weightBalanceEnabled = e.target.checked;
	saveToLocalStorage();
	renderPeople();
}

function handleMaxTeamSizeToggle(e) {
	state.maxTeamSizeEnabled = e.target.checked;
	saveToLocalStorage();
}

function handleTeamSizeChange(e) {
	state.membersPerTeam = parseInt(e.target.value) || 4;
	saveToLocalStorage();
}

function shuffleOrder() {
	if (state.people.length === 0) {
		alert('참가자가 없습니다.');
		return;
	}
	
	// Fisher-Yates shuffle algorithm
	for (let i = state.people.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[state.people[i], state.people[j]] = [state.people[j], state.people[i]];
	}
	
	saveToLocalStorage();
	renderPeople();
}

function addPerson() {
	const input = elements.nameInput.value.trim();
	const duplicateHits = [];
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
	const warnings = [];
	let constraintsTouched = false;

	tokens.forEach(token => {
		if (token.includes('!')) {
			// Handle multiple constraints in one input: "A!B!C!D" or "A!B,C!E"
			// First, split by comma to handle "A!B,C!E" -> ["A!B", "C!E"]
			const constraintParts = token.split(',').map(p => p.trim()).filter(p => p !== '');
			
			constraintParts.forEach(constraint => {
				// Handle removal: A!!B
					if (constraint.includes('!!')) {
					const [left, right] = constraint.split('!!').map(s => s.trim());
					if (left && right) {
						const rres = removeForbiddenPairByNames(left, right);
						if (!rres.ok) console.log('보류/적용 제약 제거 실패:', rres.message);
							else { safeOpenForbiddenWindow(); constraintsTouched = true; }
					}
				}
				// Handle pairwise constraints: A!B!C!D -> all pairs
				else if (constraint.includes('!')) {
					const names = constraint.split('!').map(s => s.trim()).filter(s => s !== '');
					
					// Create pairwise constraints for all combinations
					for (let i = 0; i < names.length; i++) {
						for (let j = i + 1; j < names.length; j++) {
							const ln = names[i];
							const rn = names[j];
							if (!ln || !rn) continue;
							
							const pa = findPersonByName(ln);
							const pb = findPersonByName(rn);
							if (pa && pb) {
								const res = addForbiddenPairByNames(ln, rn);
								if (!res.ok) console.log('금지 제약 추가 실패:', res.message);
								else {
									if (res.added) console.log(`금지 제약 추가됨: ${ln} ! ${rn}`);
									else console.log(`금지 제약이 이미 존재함: ${ln} ! ${rn}`);
									constraintsTouched = true;
								}
								// 성공/실패 모두 자식창 표시
								safeOpenForbiddenWindow();
							} else {
								const pres = addPendingConstraint(ln, rn);
								if (!pres.ok) console.log('보류 제약 추가 실패:', pres.message);
								else constraintsTouched = true;
							}
						}
					}
				}
			});
		} else {
			// Normal group / name token
			const names = token.split(',').map(n => n.trim()).filter(n => n !== '');
			if (names.length === 0) return;
			const newIds = [];

			names.forEach(name => {
				const normalized = normalizeName(name);
				const exists = state.people.some(p => normalizeName(p.name) === normalized);
				if (exists) { warnings.push(`[${name}]은(는) 이미 등록된 이름입니다.`); duplicateHits.push(name); return; }
				
				// 이전에 사용했던 성별/가중치 기본값 가져오기
				const defaults = getPersonDefaults(name);
				
				const person = {
					id: state.nextId++,
					name: name,
					gender: defaults ? defaults.gender : 'male',
					weight: defaults ? defaults.weight : 100
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
	if (warnings.length) showWarnings(warnings, duplicateHits);
	if (addedAny) {
		saveToLocalStorage();
		renderPeople();
	}
	// Hide previous warnings only if we didn't just show new ones
	if (!warnings.length && (addedAny || constraintsTouched)) hideWarnings();
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
				safeOpenForbiddenWindow();
	}
	buildForbiddenMap();
	saveToLocalStorage();
	renderPeople();
}

function updatePersonGender(id, gender) {
	const person = state.people.find(p => p.id === id);
	if (person) {
		person.gender = gender;
		saveToLocalStorage();
	}
}

function updatePersonWeight(id, weight) {
	const person = state.people.find(p => p.id === id);
	if (person) {
		person.weight = parseInt(weight) || 0;
		saveToLocalStorage();
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
		saveToLocalStorage();
		console.log(`금지 제약 추가됨: ${pa.name} (id:${pa.id}) ! ${pb.name} (id:${pb.id})`);
		safeOpenForbiddenWindow();
		hideWarnings();
	} else {
		console.log(`금지 제약이 이미 존재함: ${pa.name} ! ${pb.name}`);
		// Even if the constraint already exists, open/focus the popup so users can view/manage it
		safeOpenForbiddenWindow();
		hideWarnings();
	}
	return { ok: true, added: !exists };
} 

// Add a pending constraint by name (allows adding before people exist)
function addPendingConstraint(leftName, rightName) {
	const l = normalizeName(leftName);
	const r = normalizeName(rightName);
	if (l === r) return { ok: false, message: '동일인 제약은 불가능합니다.' };
	// Avoid duplicates in pending
	const existsPending = state.pendingConstraints.some(pc => pc.left === l && pc.right === r);
	if (existsPending) { safeOpenForbiddenWindow(); hideWarnings(); return { ok: true }; }
	state.pendingConstraints.push({ left: l, right: r });
	saveToLocalStorage();
	console.log(`보류 제약 추가됨(사람 미등록): ${leftName} ! ${rightName}`);
	// Update popup view if open (or open it)
		safeOpenForbiddenWindow();
		hideWarnings();
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
	if (changed) {
		buildForbiddenMap();
		saveToLocalStorage();
		safeOpenForbiddenWindow();
	} 
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

// 그룹 색상 팔레트를 한 번만 랜덤 셔플
function shuffleGroupColorsOnce() {
	if (state._groupColorsShuffled) return;
	state._groupColorsShuffled = true;
	const arr = state.groupColors;
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
}

// CSS 변수로 팀원 표시 애니메이션 시간 설정 (teamDisplayDelay의 50%)
function setTeamAnimDurationFromDelay() {
	try {
		const dur = Math.max(50, Math.round((state.teamDisplayDelay || 400) * 0.75));
		document.documentElement.style.setProperty('--team-anim-duration', dur + 'ms');
	} catch (_) { /* no-op */ }
}

function getTeamAnimDurationMs() {
	try {
		const css = getComputedStyle(document.documentElement).getPropertyValue('--team-anim-duration');
		const parsed = parseFloat(css);
		if (Number.isFinite(parsed)) return parsed;
	} catch (_) { /* ignore */ }
	return Math.max(50, Math.round((state.teamDisplayDelay || 400) * 0.75));
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
			saveToLocalStorage();
			console.log(`금지 제약 제거됨: ${pa.name} ! ${pb.name}`);
			safeOpenForbiddenWindow();
			hideWarnings();
			return { ok: true };
		}
	}
	// If no applied pair found (or persons not present), remove matching pending textual constraints (either order)
	const beforePending = state.pendingConstraints.length;
	state.pendingConstraints = state.pendingConstraints.filter(pc => !( (pc.left === na && pc.right === nb) || (pc.left === nb && pc.right === na) ));
	if (state.pendingConstraints.length !== beforePending) {
		saveToLocalStorage();
		console.log(`보류 제약 제거됨: ${nameA} ! ${nameB}`);
		safeOpenForbiddenWindow();
		hideWarnings();
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

// --- Forbidden connections popup window helpers ---
let forbiddenPopup = null;

function openForbiddenWindow() {
	const features = 'width=600,height=700,toolbar=0,location=0,status=0,menubar=0,scrollbars=1,resizable=1';
	try {
		// If popup exists but became cross-origin, close and recreate
		if (forbiddenPopup && !forbiddenPopup.closed) {
			try {
				void forbiddenPopup.document;
			} catch (e) {
				forbiddenPopup.close();
				forbiddenPopup = null;
			}
		}
		if (!forbiddenPopup || forbiddenPopup.closed) {
			forbiddenPopup = window.open('', 'forbiddenPopup', features);
			if (!forbiddenPopup) {
				console.log('팝업 차단: 제약 연결 창을 열 수 없습니다. 브라우저의 팝업 차단을 확인하세요.');
				return;
			}
			const doc = forbiddenPopup.document;
			doc.open();
			doc.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>제약 관리</title><style>
				:root{--accent:#667eea;--bg:#ffffff;--muted:#666}
				body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;padding:18px;background:var(--bg);color:#111}
				header{background:linear-gradient(135deg,var(--accent) 0%, #764ba2 100%);color:#fff;padding:14px;border-radius:8px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center}
				h1{margin:0;font-size:18px}
				.reset-all-btn{background:#ef4444;border:none;color:#fff;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;transition:all 0.2s}
				.reset-all-btn:hover{background:#dc2626;transform:scale(1.05)}
				.add-form{display:flex;gap:8px;margin:12px 0}
				.add-form input{flex:1;padding:8px;border:1px solid #ddd;border-radius:8px}
				.add-form button{padding:8px 12px;border-radius:8px;border:none;background:var(--accent);color:#fff;cursor:pointer}
				section{margin-bottom:12px}
				h2{font-size:14px;margin:8px 0}
				ul{list-style:none;padding-left:0}
				li{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px;border:1px solid #eef2ff;background:#fbfcff;margin-bottom:8px}
				li .label{font-weight:600}
				.remove-btn{background:#ef4444;border:none;color:#fff;border-radius:50%;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;cursor:pointer}
				.empty{color:#999;padding:8px}
				.initial-modal{position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:999;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
				.initial-modal .modal-content{background:#fff;padding:24px;border-radius:12px;text-align:center;max-width:90%;box-shadow:0 10px 30px rgba(0,0,0,0.2);transform-origin:top;transform:scaleY(1);transition:transform 320ms ease, opacity 220ms ease}
				.initial-modal:not(.visible) .modal-content{transform:scaleY(0);opacity:0}
				.initial-modal.visible .modal-content{transform:scaleY(1);opacity:1}
				.modal-show-btn{background:var(--accent);color:#fff;border:none;padding:12px 28px;border-radius:8px;font-size:1.1rem;cursor:pointer}
				.initial-modal .warn{margin-top:8px;color:#ef4444;font-size:12px;font-weight:400;line-height:1.2}
			</style></head><body>
			<header><h1>제약 연결</h1><button id="resetAllBtn" class="reset-all-btn">초기화</button></header>
			<div id="initialModal" class="initial-modal visible">
				<div class="modal-content">
					<button id="showBtn" class="modal-show-btn">보기</button>
					<div id="showWarn" class="warn"> 보기 버튼을 누르면 제약셋팅의 목록이 노출됩니다</div>
				</div>
			</div>
			<section class="add-form"><input id="addConstraintInput" placeholder="예: A!B 또는 해지: A!!B (쉼표로 여러 항목 가능)"><button id="addConstraintBtn">+</button></section>
			<section id="appliedSection" style="display:none"><h2>적용된 제약</h2><div id="appliedList"></div></section>
			<section id="pendingSection" style="display:none"><h2>대기중인 제약</h2><div id="pendingList"></div></section>
			<script>
				(function(){
					const parentWindow = window.opener;
					if (!parentWindow) {
						alert('부모 창 참조를 찾을 수 없습니다. 팝업을 닫고 다시 열어주세요.');
						return;
					}
					const addBtn = document.getElementById('addConstraintBtn');
					const input = document.getElementById('addConstraintInput');
					const showBtn = document.getElementById('showBtn');
					const modal = document.getElementById('initialModal');
					const showWarn = document.getElementById('showWarn');
					const resetAllBtn = document.getElementById('resetAllBtn');
					let reShowTimeout = null;
					let modalDisabled = false;
					let blindTime = 1000;
					try {
						if (parentWindow && typeof parentWindow.blindDelay !== 'undefined') {
							if (parentWindow.blindDelay === null) {
								modalDisabled = true;
							} else if (Number.isFinite(parentWindow.blindDelay)) {
								blindTime = parentWindow.blindDelay;
							}
						}
					} catch (_) { /* fallback to defaults */ }
					// 로컬 구분 없이 부모의 blindDelay만 사용
					function refresh(){ try { if (parentWindow && parentWindow.renderForbiddenWindowContent) parentWindow.renderForbiddenWindowContent(); } catch(e){ console.log(e); } }
					addBtn.addEventListener('click', ()=>{
						const v = input.value.trim(); if (!v) return; input.value='';
						try {
							const parts = v.split(',').map(s=>s.trim()).filter(Boolean);
							parts.forEach(part=>{
								if (part.includes('!!')) {
									const [L,R] = part.split('!!').map(s=>s.trim());
									if (L && R) { try { parentWindow.removeForbiddenPairByNames(L,R); } catch(e){ console.log(e);} }
								} else if (part.includes('!')) {
									const names = part.split('!').map(s=>s.trim()).filter(Boolean);
									for (let i=0;i<names.length;i++) {
										for (let j=i+1;j<names.length;j++) {
											const ln = names[i];
											const rn = names[j];
											if (!ln || !rn) continue;
											try {
												const res = parentWindow.addForbiddenPairByNames(ln,rn);
												if (!res.ok) parentWindow.addPendingConstraint(ln,rn);
											} catch(e){ console.log(e); }
										}
									}
								}
							});
							refresh();
						} catch(e){ console.log('추가 실패', e); }
					});
					input.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') addBtn.click(); });
					
					// 초기화 버튼 이벤트
					if (resetAllBtn) {
						resetAllBtn.addEventListener('click', ()=>{
							if (confirm('모든 제약을 초기화하시겠습니까?')) {
								try {
									if (parentWindow && parentWindow.clearAllConstraints) {
										parentWindow.clearAllConstraints();
									} else {
										alert('부모 창 참조를 찾을 수 없습니다.');
									}
								} catch(e){ console.log('초기화 실패:', e); alert('초기화 실패: ' + e.message); }
							}
						});
					}
					
					function hideModal(){
						if (reShowTimeout){ clearTimeout(reShowTimeout); reShowTimeout = null; }
						modal.classList.remove('visible');
						setTimeout(()=>{ if (!modal.classList.contains('visible')) modal.style.display = 'none'; }, 340);
						document.getElementById('appliedSection').style.display = '';
						document.getElementById('pendingSection').style.display = '';
						showWarn.style.display = 'none';
						refresh();
					}
					showBtn.addEventListener('click', hideModal);
					// blindDelay가 null이면 모달/보기 버튼 비활성화
					if (modalDisabled) {
						showBtn.style.display = 'none';
						showWarn.style.display = 'none';
						modal.classList.remove('visible');
						modal.style.display = 'none';
						document.getElementById('appliedSection').style.display = '';
						document.getElementById('pendingSection').style.display = '';
					}
					function scheduleModalShow(){
						if (modalDisabled) return;
						if (reShowTimeout) clearTimeout(reShowTimeout);
						reShowTimeout = setTimeout(()=>{
							modal.style.display = '';
							modal.classList.add('visible');
							document.getElementById('appliedSection').style.display = 'none';
							document.getElementById('pendingSection').style.display = 'none';
							showWarn.style.display = '';
						}, blindTime);
					}
					function cancelModalShow(){ if (reShowTimeout){ clearTimeout(reShowTimeout); reShowTimeout = null; } }
					// 모달 비활성화 시 재노출 이벤트 비활성화
					if (!modalDisabled) {
						window.addEventListener('mouseout', (e)=>{ if (!e.relatedTarget && !e.toElement) scheduleModalShow(); });
						window.addEventListener('blur', scheduleModalShow);
						window.addEventListener('mousemove', ()=>{ cancelModalShow(); });
					}
				})();
			</script>
			</body></html>`);
			doc.close();
		}
		renderForbiddenWindowContent();
		if (forbiddenPopup && !forbiddenPopup.closed) forbiddenPopup.focus();
	} catch (e) {
		console.log('팝업 열기 중 오류:', e);
	}
}

function renderForbiddenWindowContent() {
	if (!forbiddenPopup || forbiddenPopup.closed) return;
	const doc = forbiddenPopup.document;
	const appliedList = doc.getElementById('appliedList');
	const pendingList = doc.getElementById('pendingList');
	if (!appliedList || !pendingList) return;
	// Clear
	appliedList.innerHTML = '';
	pendingList.innerHTML = '';
	// Applied
	if (state.forbiddenPairs.length) {
		const ul = doc.createElement('ul');
		state.forbiddenPairs.forEach(([a,b]) => {
			const pa = state.people.find(p => p.id === a);
			const pb = state.people.find(p => p.id === b);
			const left = pa ? pa.name : `id:${a}`;
			const right = pb ? pb.name : `id:${b}`;
			const li = doc.createElement('li');
			const label = doc.createElement('span'); label.className='label'; label.textContent = `${left} ! ${right}`;
			li.appendChild(label);
			const btn = doc.createElement('button'); btn.className='remove-btn'; btn.textContent='×';
			btn.addEventListener('click', ()=>{
				try { removeForbiddenPairByNames(left, right); renderForbiddenWindowContent(); } catch(e){ console.log(e); }
			});
			li.appendChild(btn);
			ul.appendChild(li);
		});
		appliedList.appendChild(ul);
	} else {
		const p = doc.createElement('div'); p.className='empty'; p.textContent='없음'; appliedList.appendChild(p);
	}
	// Pending
	if (state.pendingConstraints.length) {
		const ul2 = doc.createElement('ul');
		state.pendingConstraints.forEach(pc => {
			const li = doc.createElement('li');
			const label = doc.createElement('span'); label.className='label'; label.textContent = `${pc.left} ! ${pc.right}`;
			li.appendChild(label);
			const btn = doc.createElement('button'); btn.className='remove-btn'; btn.textContent='×';
			btn.addEventListener('click', ()=>{
				try { removeForbiddenPairByNames(pc.left, pc.right); renderForbiddenWindowContent(); } catch(e){ console.log(e); }
			});
			li.appendChild(btn);
			ul2.appendChild(li);
		});
		pendingList.appendChild(ul2);
	} else {
		const p = doc.createElement('div'); p.className='empty'; p.textContent='없음'; pendingList.appendChild(p);
	}
}

// Safe wrapper to avoid ReferenceError if popup helper isn't available in current scope
function safeOpenForbiddenWindow() {
	if (typeof openForbiddenWindow === 'function') {
		try { openForbiddenWindow(); } catch (e) { console.log('팝업 열기 중 오류:', e); }
	} else {
		console.warn('openForbiddenWindow 함수가 정의되지 않았습니다.');
	}
}

// 모든 제약 초기화 함수 (자식창에서 호출용)
function clearAllConstraints() {
	state.forbiddenPairs = [];
	state.pendingConstraints = [];
	state.forbiddenMap = {};
	saveToLocalStorage();
	console.log('제약 목록이 모두 초기화되었습니다.');
	renderForbiddenWindowContent();
}

function escapeHtml(s) {
	return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
	const groupMap = new Map(); // personId -> groupIndex
	
	// 그룹 정보를 맵으로 저장
	state.requiredGroups.forEach((group, groupIndex) => {
		group.forEach(personId => {
			grouped.add(personId);
			groupMap.set(personId, groupIndex);
		});
	});
	
	// people 배열 순서대로 표시하되, 그룹 시작 시점에 그룹 전체를 한 번에 표시
	const processedGroups = new Set();
	
	state.people.forEach(person => {
		const groupIndex = groupMap.get(person.id);
		
		if (groupIndex !== undefined && !processedGroups.has(groupIndex)) {
			// 이 그룹을 처음 만났을 때, 그룹 전체를 표시
			processedGroups.add(groupIndex);
			const group = state.requiredGroups[groupIndex];
			const groupContainer = document.createElement('div');
			groupContainer.className = 'group-container';
			groupContainer.style.borderColor = getGroupColor(groupIndex);
			
			group.forEach(personId => {
				const groupPerson = state.people.find(p => p.id === personId);
				if (groupPerson) {
					const personTag = createPersonTag(groupPerson);
					groupContainer.appendChild(personTag);
				}
			});
			
			elements.peopleList.appendChild(groupContainer);
		} else if (groupIndex === undefined) {
			// 그룹에 속하지 않은 개별 항목
			const personTag = createPersonTag(person);
			elements.peopleList.appendChild(personTag);
		}
		// 이미 처리된 그룹의 멤버는 스킵
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

	const teams = generateTeams(preShufflePeopleForGeneration(validPeople));
	if (!teams) return; // generateTeams shows error when impossible
	
	// 팀 생성시 제약 레이어가 열려있으면 내리기
	hideConstraintNotification();
	
	// 캡처 버튼 상태 초기화
	if (captureSuccessTimer) {
		clearTimeout(captureSuccessTimer);
		captureSuccessTimer = null;
	}
	if (elements.captureBtn) {
		elements.captureBtn.innerHTML = '화면 캡처 <span class="camera-emoji">📸</span>';
		elements.captureBtn.disabled = false;
	}
	
	// teamDisplayDelay가 바뀔 수 있으므로 표시 전 최신값으로 반영
	setTeamAnimDurationFromDelay();
	displayTeams(teams);
}
// 팀 생성 전에 내부적으로 한 번 셔플: 그룹 내 인원은 제외(비그룹 인원만 무작위화)
function preShufflePeopleForGeneration(people) {
	try {
		const groupedIdSet = new Set();
		for (const g of state.requiredGroups) {
			for (const id of g) groupedIdSet.add(id);
		}
		const groupedPeople = people.filter(p => groupedIdSet.has(p.id));
		const ungroupedPeople = people.filter(p => !groupedIdSet.has(p.id));
		// Fisher-Yates shuffle for ungrouped only
		for (let i = ungroupedPeople.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[ungroupedPeople[i], ungroupedPeople[j]] = [ungroupedPeople[j], ungroupedPeople[i]];
		}
		// 그룹 인원은 원래 순서 유지, 비그룹 인원만 셔플된 순서로 뒤에 배치
		return [...groupedPeople, ...ungroupedPeople];
	} catch (_) {
		// 문제가 있으면 원본 people 사용
		return people;
	}
}

function generateTeams(people) {
	buildForbiddenMap();

	// Validation: a required group cannot contain a forbidden pair
	for (const group of state.requiredGroups) {
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				if (isForbidden(group[i], group[j])) {
					showError('같은 그룹에 금지 제약이 있습니다.');
					return null;
				}
			}
		}
	}

	// 최대인원으로 팀 생성 모드: 팀수는 (총인원 / 팀당인원)의 올림
	// 일반 모드: 기존과 동일
	let teamCount;
	if (state.maxTeamSizeEnabled) {
		teamCount = Math.max(1, Math.ceil(people.length / state.membersPerTeam));
	} else {
		teamCount = Math.max(1, Math.ceil(people.length / state.membersPerTeam));
	}
	const maxAttempts = 500;

	// Calculate minimum gender count across all people
	const maleCount = people.filter(p => p.gender === 'male').length;
	const femaleCount = people.filter(p => p.gender === 'female').length;
	const isFemaleLess = femaleCount < maleCount;
	const minGenderCount = Math.min(maleCount, femaleCount);
	const minGenderPerTeam = Math.floor(minGenderCount / teamCount);

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const teams = Array.from({ length: teamCount }, () => []);
		const assigned = new Set();

		const validGroups = state.requiredGroups.filter(group => 
			group.every(id => people.some(p => p.id === id))
		);

		// 가중치 균등이 활성화된 경우 그룹을 가중치 순으로 정렬 (높은 순)
		let processGroups;
		if (state.weightBalanceEnabled) {
			// 각 그룹의 평균 가중치 계산
			const groupsWithWeight = validGroups.map(group => {
				const groupMembers = group.map(id => people.find(p => p.id === id)).filter(Boolean);
				const totalWeight = groupMembers.reduce((sum, p) => sum + (p.weight || 0), 0);
				const avgWeight = groupMembers.length > 0 ? totalWeight / groupMembers.length : 0;
				return { group, avgWeight };
			});
			// 가중치 내림차순 정렬
			groupsWithWeight.sort((a, b) => b.avgWeight - a.avgWeight);
			processGroups = groupsWithWeight.map(g => g.group);
		} else {
			// 가중치 균등이 없으면 셔플
			processGroups = [...validGroups].sort(() => Math.random() - 0.5);
		}
		
		let groupFailed = false;

		for (const group of processGroups) {
			const groupMembers = group.map(id => people.find(p => p.id === id)).filter(Boolean);
			
			// Count minimum gender in this group
			const groupMinGender = isFemaleLess ? 
				groupMembers.filter(p => p.gender === 'female').length :
				groupMembers.filter(p => p.gender === 'male').length;
			
			// 가중치 균등이 활성화된 경우: 팀을 가중치 낮은 순으로 정렬하여 순차 확인
			let teamOrder;
			if (state.weightBalanceEnabled) {
				// 팀을 현재 가중치 기준 오름차순 정렬 (낮은 가중치 팀부터)
				teamOrder = teams.map((team, idx) => ({
					idx,
					weight: team.reduce((sum, p) => sum + (p.weight || 0), 0)
				})).sort((a, b) => {
					if (a.weight !== b.weight) return a.weight - b.weight;
					// 가중치가 같으면 최대인원 모드에서는 인덱스 작은 팀 우선
					if (state.maxTeamSizeEnabled) return a.idx - b.idx;
					return 0;
				}).map(t => t.idx);
			} else {
				// 가중치 균등이 없으면 랜덤 순서
				teamOrder = teams.map((_, idx) => idx).sort(() => Math.random() - 0.5);
			}
			
			let selectedTeam = -1;
			
			// 가중치 낮은 팀부터 조건 확인
			for (const i of teamOrder) {
				// Check 1: Size constraint
				if (state.maxTeamSizeEnabled) {
					if (i < teams.length - 1 && teams[i].length + groupMembers.length > state.membersPerTeam) continue;
				} else {
					if (teams[i].length + groupMembers.length > state.membersPerTeam) continue;
				}
				
				// Check 2: No conflicts
				let hasConflict = false;
				for (const gm of groupMembers) {
					if (teams[i].some(tm => isForbidden(gm.id, tm.id))) {
						hasConflict = true;
						break;
					}
				}
				if (hasConflict) continue;
				
				// Check 3: Gender balance - only if enabled
				if (state.genderBalanceEnabled) {
					const currentMinGender = isFemaleLess ? 
						teams[i].filter(p => p.gender === 'female').length :
						teams[i].filter(p => p.gender === 'male').length;
					
					const allTeamMinGenders = teams.map(t => 
						isFemaleLess ? 
							t.filter(p => p.gender === 'female').length :
							t.filter(p => p.gender === 'male').length
					);
					const globalMinGender = Math.min(...allTeamMinGenders);
					
					if (currentMinGender > globalMinGender) continue;
				}
				
				// 모든 조건을 만족하면 이 팀 선택
				selectedTeam = i;
				break;
			}
			
			if (selectedTeam === -1) {
				groupFailed = true;
				break;
			}
			
			teams[selectedTeam].push(...groupMembers);
			groupMembers.forEach(m => assigned.add(m.id));
		}

		if (groupFailed) continue;

		// Assign individual people
		const unassignedPeople = people.filter(p => !assigned.has(p.id));
		
		// 가중치 균등이 활성화된 경우 가중치 순으로 정렬 (높은 순)
		if (state.weightBalanceEnabled) {
			unassignedPeople.sort((a, b) => (b.weight || 0) - (a.weight || 0));
		}
		
		let personFailed = false;

		for (const person of unassignedPeople) {
			const personMinGender = (isFemaleLess && person.gender === 'female') || 
			                        (!isFemaleLess && person.gender === 'male') ? 1 : 0;
			
			// 가중치 균등이 활성화된 경우: 팀을 가중치 낮은 순으로 정렬하여 순차 확인
			let teamOrder;
			if (state.weightBalanceEnabled) {
				// 팀을 현재 가중치 기준 오름차순 정렬 (낮은 가중치 팀부터)
				teamOrder = teams.map((team, idx) => ({
					idx,
					weight: team.reduce((sum, p) => sum + (p.weight || 0), 0)
				})).sort((a, b) => {
					if (a.weight !== b.weight) return a.weight - b.weight;
					// 가중치가 같으면 최대인원 모드에서는 인덱스 작은 팀 우선
					if (state.maxTeamSizeEnabled) return a.idx - b.idx;
					return 0;
				}).map(t => t.idx);
			} else if (state.maxTeamSizeEnabled) {
				// 최대인원 모드 + 가중치 균등 없음: 인덱스 순서
				teamOrder = teams.map((_, idx) => idx);
			} else {
				// 일반 모드 + 가중치 균등 없음: 2 units 우선 로직
				const teamUnits = teams.map((team, idx) => {
					const groupSet = new Set();
					let ungroupedCount = 0;
					for (const member of team) {
						const gi = getPersonGroupIndex(member.id);
						if (gi === -1) ungroupedCount++;
						else groupSet.add(gi);
					}
					return { idx, units: groupSet.size + ungroupedCount, size: team.length };
				});
				
				const needUnit = teamUnits.filter(t => t.units < 2);
				let candidateTeams = needUnit.length > 0 ? needUnit : teamUnits;
				
				// 작은 팀 우선
				const minSize = Math.min(...candidateTeams.map(t => t.size));
				candidateTeams = candidateTeams.filter(t => t.size === minSize);
				
				// 랜덤 순서
				teamOrder = candidateTeams.map(t => t.idx).sort(() => Math.random() - 0.5);
			}
			
			let selectedTeam = -1;
			
			// 가중치 낮은 팀부터 조건 확인
			for (const i of teamOrder) {
				// Check 1: Size constraint
				if (state.maxTeamSizeEnabled) {
					if (i < teams.length - 1 && teams[i].length >= state.membersPerTeam) continue;
				} else {
					if (teams[i].length >= state.membersPerTeam) continue;
				}
				
				// Check 2: No conflicts
				if (teams[i].some(tm => isForbidden(tm.id, person.id))) continue;
				
				// Check 3: Gender balance - only if enabled
				if (state.genderBalanceEnabled && personMinGender === 1) {
					const currentMinGender = isFemaleLess ? 
						teams[i].filter(p => p.gender === 'female').length :
						teams[i].filter(p => p.gender === 'male').length;
					
					const allTeamMinGenders = teams.map(t => 
						isFemaleLess ? 
							t.filter(p => p.gender === 'female').length :
							t.filter(p => p.gender === 'male').length
					);
					const globalMinGender = Math.min(...allTeamMinGenders);
					
					if (currentMinGender > globalMinGender) continue;
				}
				
				// 모든 조건을 만족하면 이 팀 선택
				selectedTeam = i;
				break;
			}
			
			if (selectedTeam === -1) {
				personFailed = true;
				break;
			}
			
			teams[selectedTeam].push(person);
		}

		if (personFailed) continue;

		// Validate: no conflicts and minimum 2 units per team
		if (conflictExists(teams)) continue;
		
		// Check each team has at least 2 units
		let allValid = true;
		for (const team of teams) {
			const groupSet = new Set();
			let ungroupedCount = 0;
			for (const member of team) {
				const gi = getPersonGroupIndex(member.id);
				if (gi === -1) ungroupedCount++;
				else groupSet.add(gi);
			}
			if (groupSet.size + ungroupedCount < 2) {
				allValid = false;
				break;
			}
		}
		
		if (!allValid) continue;
		
		// 최대인원 모드: 마지막 팀이 아닌 팀이 최대인원보다 적으면 재정렬
		if (state.maxTeamSizeEnabled) {
			// 인원이 부족한 팀(마지막 팀 제외)이 있는지 확인
			let needsReorder = false;
			for (let i = 0; i < teams.length - 1; i++) {
				if (teams[i].length < state.membersPerTeam) {
					needsReorder = true;
					break;
				}
			}
			
			if (needsReorder) {
				// 팀을 인원수 기준으로 내림차순 정렬 (많은 팀이 앞으로)
				teams.sort((a, b) => b.length - a.length);
			}
		}
		
		return teams;
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
		// 초기에는 팀 번호만 표시 (0명이므로 인원 수 숨김)
		let titleText = `팀 ${index + 1}`;
		teamTitle.textContent = titleText;
		teamCard.appendChild(teamTitle);
		
		const membersList = document.createElement('ul');
		membersList.className = 'team-members-list';
		teamCard.appendChild(membersList);
		
		elements.teamsDisplay.appendChild(teamCard);
		teamCards.push({ card: teamCard, title: teamTitle, list: membersList, team: team, currentWeight: 0, currentCount: 0 });
	});
	
	elements.resultsSection.classList.add('visible');
	
	// 캡처 기능 사용 가능 여부 확인 후 버튼 컨테이너 표시
	if (elements.captureButtonContainer) {
		const canUseCapture = typeof html2canvas !== 'undefined' && 
							  navigator.clipboard && 
							  navigator.clipboard.write;
		if (canUseCapture) {
			elements.captureButtonContainer.style.display = 'block';
		} else {
			elements.captureButtonContainer.style.display = 'none';
		}
	}
	
	// 2단계: 모든 팀에 돌아가면서 인원을 추가 (라운드 로빈)
	const maxMembers = Math.max(...teams.map(t => t.length));

	// 팀원 추가 애니메이션 동안 카드 높이 흔들림 방지를 위해
	// 각 팀 카드의 리스트 영역(ul)에 maxMembers 기준의 min-height를 설정
	try {
		const uls = Array.from(elements.teamsDisplay.querySelectorAll('.team-card ul'));
		if (uls.length) {
			// 샘플 li를 하나 붙여 실제 렌더 높이를 측정 (마진 포함)
			const sampleLi = document.createElement('li');
			sampleLi.style.visibility = 'hidden';
			sampleLi.style.pointerEvents = 'none';
			sampleLi.innerHTML = '<span class="result-group-dot"></span><span>샘플</span>';
			uls[0].appendChild(sampleLi);
			// offsetHeight(패딩/보더 포함) + 상하 마진을 더해 한 항목의 총 세로 점유치 계산
			const liHeight = sampleLi.offsetHeight || 40; // 폴백 높이
			const cs = window.getComputedStyle(sampleLi);
			const mt = parseFloat(cs.marginTop) || 0;
			const mb = parseFloat(cs.marginBottom) || 0;
			const between = Math.max(mt, mb); // 인접 블록 간 마진 겹침 고려
			uls[0].removeChild(sampleLi);
			const minListHeight = maxMembers > 0
				? (liHeight * maxMembers + mt + mb + (maxMembers - 1) * between)
				: 0;
			uls.forEach(ul => { ul.style.minHeight = minListHeight + 'px'; });
		}
	} catch (_) { /* 측정 실패 시 무시하고 진행 */ }
	
	// 팀 배열을 그룹 단위(연속된 동일 그룹 인원)와 단일 인원으로 분할하여 블록 단위로 애니메이션
	const teamChunks = teamCards.map(({ team }) => {
		const chunks = [];
		let i = 0;
		while (i < team.length) {
			const person = team[i];
			const gIdx = getPersonGroupIndex(person.id);
			if (gIdx === -1) {
				chunks.push([person]);
				i += 1;
				continue;
			}
			const chunk = [];
			let j = i;
			while (j < team.length && getPersonGroupIndex(team[j].id) === gIdx) {
				chunk.push(team[j]);
				j++;
			}
			chunks.push(chunk);
			i = j;
		}
		return chunks;
	});

	// 총 딜레이 횟수 계산 및 조정된 딜레이 시간 계산
	let totalDelays = 0;
	if (state.maxTeamSizeEnabled) {
		// 최대인원 모드: 각 팀의 청크 수 합계 - 1 (마지막 팀의 마지막 청크는 딜레이 없음)
		totalDelays = teamChunks.reduce((sum, chunks) => sum + chunks.length, 0) - 1;
	} else {
		// 일반 모드: 총 청크 수 - 1 (마지막 처리는 딜레이 없음)
		totalDelays = teamChunks.reduce((sum, chunks) => sum + chunks.length, 0) - 1;
	}
	
	// 총 소요 시간이 maxTimer를 초과하면 딜레이를 조정
	let adjustedDelay = state.teamDisplayDelay;
	if (totalDelays > 0 && maxTimer > 0) {
		const totalTime = totalDelays * state.teamDisplayDelay;
		if (totalTime > maxTimer) {
			adjustedDelay = Math.floor(maxTimer / totalDelays);
			console.log(`⏱️ 총 소요 시간 ${totalTime}ms가 최대 시간 ${maxTimer}ms를 초과하여 딜레이를 ${state.teamDisplayDelay}ms → ${adjustedDelay}ms로 조정합니다.`);
		}
	}

	// 최대인원 모드: 순차적으로 팀을 완성 (1팀 전체 -> 2팀 전체 -> ...)
	// 일반 모드: 최소 인원 팀 우선으로 균등하게 분배
	if (state.maxTeamSizeEnabled) {
		// 최대인원 모드: 팀을 순서대로 완전히 완성
		for (let teamIdx = 0; teamIdx < teamCards.length; teamIdx++) {
			const teamCardData = teamCards[teamIdx];
			const { list, title } = teamCardData;
			const chunks = teamChunks[teamIdx];
			
			// 이 팀의 모든 청크를 순서대로 표시
			for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
				const chunk = chunks[chunkIdx];
				let addedWeight = 0;
				
				for (const person of chunk) {
					const li = document.createElement('li');
					let displayText = person.name;
					if (state.weightBalanceEnabled) displayText += ` (${person.weight})`;
					li.textContent = displayText;
					li.classList.add('jelly-in');
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
					li.addEventListener('animationend', () => li.classList.remove('jelly-in'), { once: true });
					teamCardData.currentCount += 1;
					if (state.weightBalanceEnabled) addedWeight += person.weight || 0;
				}
				
				if (chunk.length) pulseTeamCard(teamCardData.card);
				if (state.weightBalanceEnabled) {
					teamCardData.currentWeight += addedWeight;
					// 0명이 아니면 인원 수 표시
					title.textContent = `팀 ${teamIdx + 1} (${teamCardData.currentCount}명) - 가중치: ${teamCardData.currentWeight}`;
				} else {
					// 0명이 아니면 인원 수 표시
					title.textContent = `팀 ${teamIdx + 1} (${teamCardData.currentCount}명)`;
				}
				
				// 마지막 팀의 마지막 청크가 아니면 딜레이
				const isLastTeam = teamIdx === teamCards.length - 1;
				const isLastChunk = chunkIdx === chunks.length - 1;
				if (!isLastTeam || !isLastChunk) {
					await new Promise(r => setTimeout(r, adjustedDelay));
				}
			}
		}
	} else {
		// 일반 모드: 균등 분배 방식
		const nextIdx = teamChunks.map(() => 0);
		const totalChunks = teamChunks.reduce((sum, ch) => sum + ch.length, 0);
		for (let processed = 0; processed < totalChunks; processed++) {
			// 현재 인원이 가장 적은 팀 선택
			let pick = -1;
			let minCount = Infinity;
			for (let i = 0; i < teamCards.length; i++) {
				if (nextIdx[i] >= teamChunks[i].length) continue;
				const cnt = teamCards[i].currentCount;
				if (cnt < minCount) {
					minCount = cnt;
					pick = i;
				}
			}
			
			if (pick === -1) break; // 방어적
			const teamCardData = teamCards[pick];
			const { list, title } = teamCardData;
			const chunk = teamChunks[pick][nextIdx[pick]++];
			let addedWeight = 0;
			for (const person of chunk) {
				const li = document.createElement('li');
				let displayText = person.name;
				if (state.weightBalanceEnabled) displayText += ` (${person.weight})`;
				li.textContent = displayText;
				li.classList.add('jelly-in');
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
				li.addEventListener('animationend', () => li.classList.remove('jelly-in'), { once: true });
				teamCardData.currentCount += 1;
				if (state.weightBalanceEnabled) addedWeight += person.weight || 0;
			}
			if (chunk.length) pulseTeamCard(teamCardData.card);
			if (state.weightBalanceEnabled) {
				teamCardData.currentWeight += addedWeight;
				// 0명이 아니면 인원 수 표시
				title.textContent = `팀 ${pick + 1} (${teamCardData.currentCount}명) - 가중치: ${teamCardData.currentWeight}`;
			} else {
				// 0명이 아니면 인원 수 표시
				title.textContent = `팀 ${pick + 1} (${teamCardData.currentCount}명)`;
			}
			const isLastStep = processed === totalChunks - 1;
			if (!isLastStep) await new Promise(r => setTimeout(r, adjustedDelay));
		}
	}
}

function showError(message) {
	elements.teamsDisplay.innerHTML = `<div class="error-message">${message}</div>`;
	elements.resultsSection.classList.add('visible');
}

// Highlight any existing participant tags that match duplicate names
function applyDuplicateHighlights(names) {
	const targets = new Set((names || []).map(normalizeName));
	const tags = document.querySelectorAll('.person-tag');
	tags.forEach(tag => {
		tag.classList.remove('is-duplicate');
		if (!targets.size) return;
		const nameEl = tag.querySelector('.name');
		if (!nameEl) return;
		const label = normalizeName(nameEl.textContent || '');
		if (targets.has(label)) tag.classList.add('is-duplicate');
	});
}

// Briefly pulse a team card border when members are added
function pulseTeamCard(card) {
	if (!card) return;
	const base = getTeamAnimDurationMs();
	const dur = base * 1.7; // match CSS pulse duration multiplier
	if (card._pulseTimer) {
		clearTimeout(card._pulseTimer);
		card._pulseTimer = null;
	}
	card.classList.remove('team-card-pulse');
	// force reflow to restart animation
	void card.offsetWidth;
	card.classList.add('team-card-pulse');
	card._pulseTimer = setTimeout(() => {
		card.classList.remove('team-card-pulse');
		card._pulseTimer = null;
	}, dur + 50);
}

function hideWarnings() {
	const panel = document.getElementById('warningPopup');
	if (!panel) return;
	if (warningHideTimer) { clearTimeout(warningHideTimer); warningHideTimer = null; }
	panel.classList.remove('is-visible');
	panel.setAttribute('aria-hidden','true');
	applyDuplicateHighlights([]);
}

function showWarnings(messages, duplicateNames = []) {
	const panel = document.getElementById('warningPopup');
	if (!panel) return;
	const list = panel.querySelector('.warning-popup__list');
	if (!list) return;
	list.innerHTML = '';
	messages.forEach(msg => {
		const li = document.createElement('li');
		li.textContent = msg;
		list.appendChild(li);
	});
	if (!messages.length) return;
	panel.classList.add('is-visible');
	panel.setAttribute('aria-hidden','false');
	applyDuplicateHighlights(duplicateNames);
	// Restart auto-dismiss timer (3s) unless hovering
	scheduleWarningHide();
}

// --- Warning popup hover-aware auto-hide helpers ---
function pauseWarningHide() {
	if (warningHideTimer) { clearTimeout(warningHideTimer); warningHideTimer = null; }
}

function scheduleWarningHide(delay = 3000) {
	if (warningHovering) return; // do not schedule while hovering
	pauseWarningHide();
	warningHideTimer = setTimeout(() => {
		warningHideTimer = null;
		hideWarnings();
	}, delay);
}

function handleWarningHover(e) {
	const panel = document.getElementById('warningPopup');
	if (!panel || panel.getAttribute('aria-hidden') === 'true') return;
	const rect = panel.getBoundingClientRect();
	const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
	if (inside) {
		if (!warningHovering) {
			warningHovering = true;
			pauseWarningHide();
		}
	} else {
		if (warningHovering) {
			warningHovering = false;
			scheduleWarningHide();
		}
	}
}

init();
