const teamDisplayDelay = isLocalView() ? 0 : 400;
const maxTimer = isLocalView() ? 0 : 3000;
const blindDelay = isLocalView() ? null : 5000;
try { window.blindDelay = blindDelay; } catch (_) { /* no-op */ }

// Animated Favicon
(function() {
	const moonPhases = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌝', '🌝', '🌝', '🌕', '🌖', '🌗', '🌘', '🌑', '🌚', '🌚', '🌚'];
	let currentPhase = 0;
	
	function updateFavicon() {
		const emoji = moonPhases[currentPhase];
		const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='-0.1em' y='1em' font-size='90'>${emoji}</text></svg>`;
		const favicon = document.querySelector("link[rel*='icon']") || document.createElement('link');
		favicon.type = 'image/svg+xml';
		favicon.rel = 'icon';
		favicon.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
		if (!document.querySelector("link[rel*='icon']")) {
			document.head.appendChild(favicon);
		}
		currentPhase = (currentPhase + 1) % moonPhases.length;
	}
	
	setInterval(updateFavicon, 350); // 350ms마다 변경
	updateFavicon(); // 즉시 실행
})();

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
		'#6FE5DD', // bright aqua teal
		'#FFB3BA', // pastel coral
		'#FFD93D', // bright yellow
		'#6BCB77', // fresh green
		'#A78BFA', // soft purple
		'#FD9843', // warm orange
		'#FF1493', // hot pink
		'#38BDF8', // light blue
		'#34D399', // mint green
		'#9900FF', // pure purple
		'#5B7FBF', // bright navy
		'#0066ff'  // cobalt blue
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
	// 실시간 중복 체크를 위한 input 이벤트 리스너
	elements.nameInput.addEventListener('input', () => {
		renderPeople();
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

	// 중복 확인 모달 이벤트 리스너
	const duplicateConfirmBtn = document.getElementById('duplicateConfirmBtn');
	const duplicateCancelBtn = document.getElementById('duplicateCancelBtn');
	
	if (duplicateConfirmBtn) {
		duplicateConfirmBtn.addEventListener('click', handleDuplicateConfirm);
	}
	
	if (duplicateCancelBtn) {
		duplicateCancelBtn.addEventListener('click', handleDuplicateCancel);
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

// 중복 확인 모달 표시
function showDuplicateConfirmModal(duplicateNames) {
	const modal = document.getElementById('duplicateConfirmModal');
	const messageEl = document.getElementById('duplicateModalMessage');
	const existingListEl = document.getElementById('duplicateModalExisting');
	const newListEl = document.getElementById('duplicateModalNew');
	const confirmBtn = document.getElementById('duplicateConfirmBtn');
	const warningEl = document.getElementById('duplicateWarning');
	
	if (!modal) return;
	
	// 입력 데이터 내에서 중복된 이름 검사
	const allNewNames = [];
	if (pendingAddData && pendingAddData.pendingNamesData) {
		pendingAddData.pendingNamesData.forEach(({ names }) => {
			names.forEach(name => {
				allNewNames.push(normalizeName(name));
			});
		});
	}
	
	// 중복 검사
	const nameCount = {};
	const duplicatesInInput = [];
	allNewNames.forEach(name => {
		nameCount[name] = (nameCount[name] || 0) + 1;
		if (nameCount[name] === 2) {
			duplicatesInInput.push(name);
		}
	});
	
	const hasInputDuplicates = duplicatesInInput.length > 0;
	
	// 기존 참가자 목록 표시
	existingListEl.innerHTML = '';
	const duplicateNormalized = duplicateNames.map(name => normalizeName(name));
	const duplicatePeople = state.people.filter(p => duplicateNormalized.includes(normalizeName(p.name)));
	
	// 그룹 정보 맵 생성
	const groupMap = new Map();
	state.requiredGroups.forEach((group, groupIndex) => {
		group.forEach(personId => {
			groupMap.set(personId, groupIndex);
		});
	});
	
	// 이미 처리된 그룹 추적
	const processedGroups = new Set();
	
	// 기존 참가자 렌더링 (중복으로 영향받는 전체 그룹 표시)
	duplicatePeople.forEach(person => {
		const groupIndex = groupMap.get(person.id);
		
		if (groupIndex !== undefined && !processedGroups.has(groupIndex)) {
			// 그룹에 속한 경우 - 전체 그룹을 표시
			processedGroups.add(groupIndex);
			const group = state.requiredGroups[groupIndex];
			
			const groupContainer = document.createElement('div');
			groupContainer.className = 'group-container';
			const color = getGroupColor(groupIndex);
			groupContainer.style.border = `2px solid ${color}`;
			
			// 그룹의 모든 멤버를 표시 (중복된 사람은 진하게, 남을 사람은 연하게)
			group.forEach(personId => {
				const groupPerson = state.people.find(p => p.id === personId);
				if (groupPerson) {
					const personTag = createDuplicatePersonTag(groupPerson);
					const isDuplicate = duplicateNormalized.includes(normalizeName(groupPerson.name));
					if (isDuplicate) {
						// 중복된 사람 (바뀔 요소) - 진하게, 두꺼운 글씨
						personTag.style.opacity = '1';
						const nameSpan = personTag.querySelector('.name');
						if (nameSpan) nameSpan.style.fontWeight = 'bold';
					} else {
						// 남을 사람 - 연하게
						personTag.style.opacity = '0.5';
					}
					groupContainer.appendChild(personTag);
				}
			});
			
			existingListEl.appendChild(groupContainer);
		} else if (groupIndex === undefined) {
			// 그룹에 속하지 않은 개별 참가자
			const personTag = createDuplicatePersonTag(person);
			personTag.style.opacity = '1';
			const nameSpan = personTag.querySelector('.name');
			if (nameSpan) nameSpan.style.fontWeight = 'bold';
			existingListEl.appendChild(personTag);
		}
	});
	
	// 변경 필드: 영향받는 그룹들의 변화 + 새 그룹만 표시
	newListEl.innerHTML = '';
	if (pendingAddData && pendingAddData.pendingNamesData) {
		// 중복으로 영향받는 그룹 인덱스 찾기
		const affectedGroupIndices = new Set();
		duplicatePeople.forEach(person => {
			const groupIndex = groupMap.get(person.id);
			if (groupIndex !== undefined) {
				affectedGroupIndices.add(groupIndex);
			}
		});
		
		// 영향받는 그룹들이 어떻게 변하는지 보여주기 (연한 색상으로)
		affectedGroupIndices.forEach(groupIndex => {
			const group = state.requiredGroups[groupIndex];
			const remainingMembers = group.filter(personId => {
				const person = state.people.find(p => p.id === personId);
				return person && !duplicateNormalized.includes(normalizeName(person.name));
			});
			
			if (remainingMembers.length === 1) {
				// 1명만 남으면 개별 참가자로 표시
				const person = state.people.find(p => p.id === remainingMembers[0]);
				if (person) {
					const personTag = createDuplicatePersonTag(person);
					personTag.style.opacity = '0.5';
					newListEl.appendChild(personTag);
				}
			} else if (remainingMembers.length > 1) {
				// 2명 이상 남으면 그룹으로 표시
				const groupContainer = document.createElement('div');
				groupContainer.className = 'group-container';
				const color = getGroupColor(groupIndex);
				groupContainer.style.border = `2px solid ${color}`;
				groupContainer.style.opacity = '0.5';
				
				remainingMembers.forEach(personId => {
					const person = state.people.find(p => p.id === personId);
					if (person) {
						const personTag = createDuplicatePersonTag(person);
						groupContainer.appendChild(personTag);
					}
				});
				
				newListEl.appendChild(groupContainer);
			}
		});
		
		// 새로 추가될 그룹들 렌더링
		const usedColors = [];
		state.requiredGroups.forEach((group, idx) => {
			const color = getGroupColor(idx);
			if (color && color !== state.ungroupedColor) {
				usedColors.push(color);
			}
		});
		
		const previewColors = [];
		let previewColorIndex = 0;
		pendingAddData.pendingNamesData.forEach(({ names }, index) => {
			const colorIndex = pendingAddData.newGroupColorIndices ? pendingAddData.newGroupColorIndices[index] : -1;
			
			if (names.length > 1 && colorIndex >= 0) {
				// 그룹으로 등록될 경우 - 새로 추가되는 그룹은 진하게
				const groupContainer = document.createElement('div');
				groupContainer.className = 'group-container';
				const color = getGroupColor(colorIndex);
				groupContainer.style.border = `2px solid ${color}`; // border 전체를 설정
				previewColors.push(color);
				previewColorIndex++;
				
				names.forEach(name => {
					const personTag = document.createElement('div');
					personTag.className = 'person-tag';
					const nameSpan = document.createElement('span');
					nameSpan.className = 'name';
					nameSpan.textContent = name;
					nameSpan.style.fontWeight = 'bold'; // 새 그룹은 두꺼운 글씨
					
					// 입력 데이터 내 중복된 이름이면 빨간 테두리와 pulse 애니메이션
					if (duplicatesInInput.includes(name)) {
						personTag.classList.add('is-duplicate');
					}
					
					personTag.appendChild(nameSpan);
					groupContainer.appendChild(personTag);
				});
				
				newListEl.appendChild(groupContainer);
			} else {
				// 개별 참가자로 등록될 경우
				names.forEach(name => {
					const personTag = document.createElement('div');
					personTag.className = 'person-tag';
					const nameSpan = document.createElement('span');
					nameSpan.className = 'name';
					nameSpan.textContent = name;
					nameSpan.style.fontWeight = 'bold'; // 새 참가자는 두꺼운 글씨
					
					// 입력 데이터 내 중복된 이름이면 빨간 테두리와 pulse 애니메이션
					if (duplicatesInInput.includes(name)) {
						personTag.classList.add('is-duplicate');
					}
					personTag.appendChild(nameSpan);
					newListEl.appendChild(personTag);
				});
			}
		});
		// 미리보기에서 사용한 색상 배열 저장
		pendingAddData.previewColors = previewColors;
	}
	
	// 메시지 업데이트 및 확인 버튼 상태 설정
	if (hasInputDuplicates) {
		// 입력 내 중복이 있는 경우
		// 기존 질문 메시지 숨김
		messageEl.style.display = 'none';
		
		// 경고 메시지를 버튼 위에 표시
		if (warningEl) {
			warningEl.innerHTML = `<strong>⚠️ 입력된 데이터에 중복된 이름이 있습니다!</strong>`;
			warningEl.style.display = 'block';
		}
		
		if (confirmBtn) {
			confirmBtn.disabled = true;
			confirmBtn.style.opacity = '0.5';
			confirmBtn.style.cursor = 'not-allowed';
		}
	} else {
		// 정상적인 경우
		// 질문 메시지 표시
		if (duplicateNames.length === 1) {
			messageEl.textContent = '기존 참가자를 제거하고 새로 등록하시겠습니까?';
		} else {
			messageEl.textContent = '기존 참가자들을 제거하고 새로 등록하시겠습니까?';
		}
		messageEl.style.display = 'block';
		
		// 경고 메시지 숨김
		if (warningEl) {
			warningEl.style.display = 'none';
		}
		
		if (confirmBtn) {
			confirmBtn.disabled = false;
			confirmBtn.style.opacity = '1';
			confirmBtn.style.cursor = 'pointer';
		}
	}
	
	// 모달 표시
	modal.style.display = 'flex';
	setTimeout(() => {
		modal.classList.add('visible');
	}, 10);
}

// 중복 모달용 person-tag 생성 (제거 버튼 없는 버전)
function createDuplicatePersonTag(person) {
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
		const genderDisplay = document.createElement('span');
		genderDisplay.className = 'gender-display';
		genderDisplay.textContent = person.gender === 'male' ? '♂️' : '♀️';
		personTag.appendChild(genderDisplay);
	}
	
	if (state.weightBalanceEnabled) {
		const weightDisplay = document.createElement('span');
		weightDisplay.className = 'weight-display';
		weightDisplay.textContent = `${person.weight}`;
		personTag.appendChild(weightDisplay);
	}
	
	return personTag;
}

// 중복 확인 모달 숨김
function hideDuplicateConfirmModal() {
	const modal = document.getElementById('duplicateConfirmModal');
	if (!modal) return;
	
	modal.classList.remove('visible');
	setTimeout(() => {
		modal.style.display = 'none';
	}, 300);
}

// 중복 확인 - 확인 버튼 처리
function handleDuplicateConfirm() {
	if (!pendingAddData) return;
	
	// 입력창 먼저 초기화 (실시간 하이라이트 제거를 위해)
	elements.nameInput.value = '';
	
	// 중복된 이름들을 제거하고 새로 등록 (미리 계산된 색상 인덱스 전달)
	processAddPerson(pendingAddData.pendingNamesData, pendingAddData.newGroupColorIndices);
	
	// 포커스
	elements.nameInput.focus();
	
	// 모달 숨김
	hideDuplicateConfirmModal();
	
	// 대기 데이터 초기화
	pendingAddData = null;
}

// 중복 확인 - 취소 버튼 처리
function handleDuplicateCancel() {
	// 폼 내용은 유지하고 모달만 닫음
	hideDuplicateConfirmModal();
	
	// 대기 데이터 초기화
	pendingAddData = null;
	
	// 포커스는 입력창에 유지
	elements.nameInput.focus();
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
        const audioContext = new (window.AudioContext || window.webkitContext || window.AudioContext)();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        const now = audioContext.currentTime;
        const freq = 2500; // 동일한 음 높이 (2500Hz)

        // 비프음을 생성하는 내부 함수
        const playBeep = (startTime, duration) => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();

            osc.type = 'square'; 
            osc.frequency.setValueAtTime(freq, startTime);

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.1, startTime + 0.002); // 삑!
            gain.gain.linearRampToValueAtTime(0, startTime + duration); // 끝

            osc.connect(gain);
            gain.connect(audioContext.destination);

            osc.start(startTime);
            osc.stop(startTime + duration);
        };

        // 1. 첫 번째 "삐" (0.05초 동안)
        playBeep(now, 0.05);

        // 2. 두 번째 "빅" (0.06초 뒤에 시작, 0.05초 동안)
        // 시작 시간을 now + 0.06으로 설정해 아주 짧은 간격을 둡니다.
        playBeep(now + 0.06, 0.05);

    } catch (e) {
        console.log('사운드 재생 실패:', e);
    }
}

function resetAll() {
	if (!confirm('모든 데이터를 초기화하시겠습니까?\n참고: 제약 설정(금지 제약)은 초기화되지 않습니다.')) {
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

// 중복 확인 모달을 위한 전역 변수
let pendingAddData = null;

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

	let constraintsTouched = false;
	const duplicateHits = [];
	const pendingNamesData = []; // 등록 대기중인 이름 그룹들

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

			// 중복 체크
			const groupDuplicates = [];
			names.forEach(name => {
				const normalized = normalizeName(name);
				const exists = state.people.some(p => normalizeName(p.name) === normalized);
				if (exists) {
					groupDuplicates.push(name);
				}
			});

			// 중복된 이름이 있으면 기록
			if (groupDuplicates.length > 0) {
				duplicateHits.push(...groupDuplicates);
			}

			// 등록 대기 데이터에 추가
			pendingNamesData.push({ names, hasDuplicates: groupDuplicates.length > 0 });
		}
	});

	// 제약 처리만 있었다면 입력창 초기화
	if (constraintsTouched && pendingNamesData.length === 0) {
		elements.nameInput.value = '';
		elements.nameInput.focus();
		return;
	}

	// 중복이 하나라도 있으면 모달 표시
	if (duplicateHits.length > 0) {
		// 중복 확인 모달 표시
		// 중복 제거 후 남을 그룹 개수를 예측하여 색상 인덱스 계산
		
		// 제거될 참가자들이 속한 그룹 찾기
		const groupsToRemove = new Set();
		duplicateHits.forEach(name => {
			const normalized = normalizeName(name);
			const person = state.people.find(p => normalizeName(p.name) === normalized);
			if (person) {
				state.requiredGroups.forEach((group, groupIndex) => {
					if (group.includes(person.id)) {
						groupsToRemove.add(groupIndex);
					}
				});
			}
		});
		
		// 중복 제거 후 남을 그룹 개수
		const remainingGroupCount = state.requiredGroups.length - groupsToRemove.size;
		
		// 새 그룹들에 할당할 색상 인덱스 계산
		const newGroupColorIndices = [];
		let nextColorIndex = remainingGroupCount;
		
		pendingNamesData.forEach(({ names }) => {
			if (names.length > 1) {
				// 그룹인 경우에만 색상 인덱스 할당
				newGroupColorIndices.push(nextColorIndex);
				nextColorIndex++;
			} else {
				newGroupColorIndices.push(-1); // 개별 참가자는 -1
			}
		});
		
		pendingAddData = {
			input: input,
			pendingNamesData: pendingNamesData,
			duplicateHits: duplicateHits,
			newGroupColorIndices: newGroupColorIndices
		};
		showDuplicateConfirmModal(duplicateHits);
		return;
	}

	// 중복이 없으면 바로 등록
	processAddPerson(pendingNamesData, null);
	elements.nameInput.value = '';
	elements.nameInput.focus();
}

// 실제 등록 처리 함수
function processAddPerson(pendingNamesData, groupColorIndices) {
	let addedAny = false;

	// 0단계: 중복된 이름을 가진 사람들 찾기
	const duplicateIds = [];
	pendingNamesData.forEach(({ names }) => {
		names.forEach(name => {
			const normalized = normalizeName(name);
			const existing = state.people.find(p => normalizeName(p.name) === normalized);
			if (existing) {
				duplicateIds.push(existing.id);
			}
		});
	});
	
	// 1단계: 중복된 사람들을 state.people에서 제거
	state.people = state.people.filter(p => !duplicateIds.includes(p.id));
	
	// 2단계: 각 그룹에서 중복된 사람들 제거 (그룹은 유지, 1명 이하가 되면 그룹 해체)
	state.requiredGroups = state.requiredGroups.map(group => {
		return group.filter(pid => !duplicateIds.includes(pid));
	}).filter(group => group.length > 1);
	
	// 3단계: 제약 조건에서도 중복된 사람들 제거
	duplicateIds.forEach(id => {
		const before = state.forbiddenPairs.length;
		state.forbiddenPairs = state.forbiddenPairs.filter(([a, b]) => a !== id && b !== id);
		const after = state.forbiddenPairs.length;
		if (before !== after) {
			console.log(`제약 제거: 삭제된 사람(id:${id})과 관련된 제약 ${before - after}개가 제거되었습니다.`);
		}
	});
	buildForbiddenMap();

	// 4단계: 새 참가자 추가
	const newGroupsToAdd = [];
	
	pendingNamesData.forEach(({ names }, index) => {
		const newIds = [];
		names.forEach(name => {
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
			newGroupsToAdd.push(newIds);
		}
	});

	// 5단계: 새 그룹들을 마지막에 추가하면서 미리보기 색상 적용
	newGroupsToAdd.forEach((group, idx) => {
		const newGroupIndex = state.requiredGroups.length;
		state.requiredGroups.push(group);
		
		// 미리보기 색상이 있으면 해당 위치에 색상 설정
		if (groupColorIndices && pendingAddData && pendingAddData.previewColors && pendingAddData.previewColors[idx]) {
			// state.groupColors 배열을 확장하여 해당 인덱스에 색상 저장
			while (state.groupColors.length <= newGroupIndex) {
				state.groupColors.push(state.groupColors[state.groupColors.length % 11] || '#94a3b8');
			}
			state.groupColors[newGroupIndex] = pendingAddData.previewColors[idx];
		}
	});

	if (addedAny) {
		saveToLocalStorage();
		renderPeople();
		// After possibly adding people, try to resolve pending textual constraints
		tryResolvePendingConstraints();
	}
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
	} else {
		console.log(`금지 제약이 이미 존재함: ${pa.name} ! ${pb.name}`);
		// Even if the constraint already exists, open/focus the popup so users can view/manage it
		safeOpenForbiddenWindow();
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
	if (existsPending) { safeOpenForbiddenWindow(); return { ok: true }; }
	state.pendingConstraints.push({ left: l, right: r });
	saveToLocalStorage();
	console.log(`보류 제약 추가됨(사람 미등록): ${leftName} ! ${rightName}`);
	// Update popup view if open (or open it)
		safeOpenForbiddenWindow();
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

function createPersonTag(person, potentialDuplicates = []) {
	const personTag = document.createElement('div');
	personTag.className = 'person-tag';
	
	// 중복 체크: potentialDuplicates 배열에 이 사람의 normalized 이름이 있으면 강조
	const normalized = normalizeName(person.name);
	if (potentialDuplicates.includes(normalized)) {
		personTag.classList.add('is-duplicate');
	}
	
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
	
	// 입력창에서 중복 체크를 위한 이름 목록 가져오기
	const potentialDuplicates = getPotentialDuplicatesFromInput();
	
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
					const personTag = createPersonTag(groupPerson, potentialDuplicates);
					groupContainer.appendChild(personTag);
				}
			});
			
			elements.peopleList.appendChild(groupContainer);
		} else if (groupIndex === undefined) {
			// 그룹에 속하지 않은 개별 항목
			const personTag = createPersonTag(person, potentialDuplicates);
			elements.peopleList.appendChild(personTag);
		}
		// 이미 처리된 그룹의 멤버는 스킵
	});
}

// 입력창의 텍스트에서 중복될 가능성이 있는 이름들 추출
function getPotentialDuplicatesFromInput() {
	const input = elements.nameInput.value.trim();
	if (!input) return [];
	
	const duplicateNames = [];
	const tokens = input.split('/').map(t => t.trim()).filter(t => t !== '');
	
	tokens.forEach(token => {
		// 제약 조건(!로 시작하는 것)은 무시
		if (token.includes('!')) return;
		
		// 쉼표로 구분된 이름들 추출
		const names = token.split(',').map(n => n.trim()).filter(n => n !== '');
		names.forEach(name => {
			const normalized = normalizeName(name);
			// 현재 참가자 중 이 이름이 있는지 확인
			const exists = state.people.some(p => normalizeName(p.name) === normalized);
			if (exists) {
				duplicateNames.push(normalized);
			}
		});
	});
	
	return duplicateNames;
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

init();
