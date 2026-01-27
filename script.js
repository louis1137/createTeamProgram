const teamDisplayDelay = isLocalView() ? 50 : 400;
const maxTimer = isLocalView() ? 0 : 3000;
const blindDelay = isLocalView() ? null : 5000;
// 검증 비교창 표시 여부 (true: 표시, false: 숨김)
const SHOW_VALIDATION_COMPARISON = isLocalView() ? true : false;
try { window.blindDelay = blindDelay; } catch (_) { /* no-op */ }

// 파비콘 애니메이션
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
		if (!document.querySelector("link[rel*='icon']")) document.head.appendChild(favicon);
		currentPhase = (currentPhase + 1) % moonPhases.length;
	}
	
	setInterval(updateFavicon, 350); // 350ms마다 변경
	updateFavicon(); // 즉시 실행
})();

const state = {
	people: [],
	inactivePeople: [], // 미참가자 목록 (성별/가중치 저장)
	requiredGroups: [],
	forbiddenPairs: [], // [idA, idB] 형식의 배열
	forbiddenMap: {},   // forbiddenPairs에서 만들어진 빠른 조회용 맵
	pendingConstraints: [], // {left: 정규화, right: 정규화} 형식의 보류 제약 배열
	genderBalanceEnabled: false,
	weightBalanceEnabled: false,
	maxTeamSizeEnabled: false,
	membersPerTeam: 4,
	nextId: 1,
	teamDisplayDelay,
	ungroupedColor: '#94a3b8',
	groupColors: [
		'#6FE5DD', // 밝은 아쿠아 틸
		'#FFB3BA', // 파스텔 코랄
		'#FFD93D', // 밝은 노랑
		'#6BCB77', // 신선한 초록
		'#A78BFA', // 부드러운 보라
		'#FD9843', // 따뜻한 오렌지
		'#FF1493', // 선명한 핑크
		'#38BDF8', // 연한 파랑
		'#34D399', // 민트 그린
		'#9900FF', // 순수한 보라
		'#5B7FBF', // 밝은 네이비
		'#0066ff'  // 코발트 블루
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
	if (elements.genderBalanceCheckbox) elements.genderBalanceCheckbox.addEventListener('change', handleGenderBalanceToggle);
	if (elements.weightBalanceCheckbox) elements.weightBalanceCheckbox.addEventListener('change', handleWeightBalanceToggle);
	if (elements.maxTeamSizeCheckbox) elements.maxTeamSizeCheckbox.addEventListener('change', handleMaxTeamSizeToggle);
	if (elements.teamSizeInput) elements.teamSizeInput.addEventListener('change', handleTeamSizeChange);
	if (elements.addPersonBtn) elements.addPersonBtn.addEventListener('click', addPerson);
	if (elements.resetBtn) elements.resetBtn.addEventListener('click', resetAll);
	if (elements.shuffleOrderBtn) elements.shuffleOrderBtn.addEventListener('click', shuffleOrder);
	if (elements.nameInput) {
		elements.nameInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') addPerson();
		});
		// 실시간 중복 체크를 위한 input 이벤트 리스너
		elements.nameInput.addEventListener('input', () => {
			renderPeople();
		});
	}
	if (elements.shuffleBtn) elements.shuffleBtn.addEventListener('click', shuffleTeams);
	if (elements.captureBtn) {
		elements.captureBtn.addEventListener('click', captureResultsSection);
		// 호버 시 캡처 영역 하이라이트
		elements.captureBtn.addEventListener('mouseenter', () => { 
			if (elements.resultsSection.classList.contains('visible')) elements.resultsSection.classList.add('capture-highlight');
		});
		elements.captureBtn.addEventListener('mouseleave', () => {
			elements.resultsSection.classList.remove('capture-highlight');
		});
	}

	// 참가자 관리 영역에서 Ctrl+C로 참가자 복사
	document.addEventListener('keydown', handleParticipantCopy);

	// 그룹 색상 팔레트는 세션당 한 번 랜덤 셔플
	shuffleGroupColorsOnce();

	// 팀 표시 애니메이션 시간: teamDisplayDelay의 50%로 설정
	setTeamAnimDurationFromDelay();

	// localStorage에서 데이터 복원
	loadFromLocalStorage();

	renderPeople();
	// 제약(금지) 쌍 맵 준비
	buildForbiddenMap();
	// 이전에 참가자가 추가되어 있다면 보류 중인 텍스트 제약을 해결 시도
	tryResolvePendingConstraints();
	
	// 제약이 있으면 확인 레이어 띄우기 (모든 초기화 완료 후)
	if (state.forbiddenPairs.length > 0 || state.pendingConstraints.length > 0) setTimeout(() => { showConstraintNotification(); }, 100);
	
	// 제약 목록 확인 레이어 이벤트 리스너
	const constraintNotificationConfirm = document.getElementById('constraintNotificationConfirm');
	const constraintNotificationCancel = document.getElementById('constraintNotificationCancel');
	
	if (constraintNotificationConfirm) constraintNotificationConfirm.addEventListener('click', () => {
		hideConstraintNotification();
		safeOpenForbiddenWindow();
	});
	
	if (constraintNotificationCancel) constraintNotificationCancel.addEventListener('click', () => {
		// 제약 초기화
		state.forbiddenPairs = [];
		state.pendingConstraints = [];
		state.forbiddenMap = {};
		saveToLocalStorage();
		console.log('제약 목록이 모두 초기화되었습니다.');
		hideConstraintNotification();
	});

	// 중복 확인 모달 이벤트 리스너
	const duplicateConfirmBtn = document.getElementById('duplicateConfirmBtn');
	const duplicateCancelBtn = document.getElementById('duplicateCancelBtn');
	if (duplicateConfirmBtn) duplicateConfirmBtn.addEventListener('click', handleDuplicateConfirm);
	if (duplicateCancelBtn) duplicateCancelBtn.addEventListener('click', handleDuplicateCancel);
}

// 입력 내용에서 성별/가중치 패턴 감지하여 자동 체크
function autoDetectAndCheckOptions() {
	const text = elements.nameInput.value;
	
	// 패턴 감지 (괄호 안에 남/여가 있는지, 숫자가 있는지)
	const hasGenderPattern = text.includes('(남)') || text.includes('(여)') || /\(.*남.*\)/.test(text) || /\(.*여.*\)/.test(text);
	const hasWeightPattern = /\(\d+\)/.test(text) || /\(.*\d+.*\)/.test(text);
	
	// 성별 패턴이 있으면 성별균등 자동 체크
	if (hasGenderPattern && !state.genderBalanceEnabled) {
		if (elements.genderBalanceCheckbox) {
			elements.genderBalanceCheckbox.checked = true;
			state.genderBalanceEnabled = true;
			saveToLocalStorage();
		}
	}
	
	// 가중치 패턴이 있으면 가중치균등 자동 체크
	if (hasWeightPattern && !state.weightBalanceEnabled) {
		if (elements.weightBalanceCheckbox) {
			elements.weightBalanceCheckbox.checked = true;
			state.weightBalanceEnabled = true;
			saveToLocalStorage();
			// 가중치 입력 필드 표시
			const weightInputContainer = document.getElementById('weightInputContainer');
			if (weightInputContainer) {
				weightInputContainer.style.display = 'block';
			}
		}
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
	const arrowEl = document.querySelector('.duplicate-arrow');
	const existingSectionEl = existingListEl?.parentElement;
	
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
		if (nameCount[name] === 2) duplicatesInInput.push(name);
	});
	
	const hasInputDuplicates = duplicatesInInput.length > 0;
	
	// 입력 내 중복인 경우 기존 필드와 화살표 숨김/표시
	if (existingSectionEl) existingSectionEl.style.display = hasInputDuplicates ? 'none' : 'block';
	if (arrowEl) arrowEl.style.display = hasInputDuplicates ? 'none' : 'flex';
	
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
			if (groupIndex !== undefined) affectedGroupIndices.add(groupIndex);
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
			if (color && color !== state.ungroupedColor) usedColors.push(color);
		});
		
		const previewColors = [];
		pendingAddData.pendingNamesData.forEach(({ names }, index) => {
			const colorIndex = pendingAddData.newGroupColorIndices ? pendingAddData.newGroupColorIndices[index] : -1;
			
			if (names.length > 1 && colorIndex >= 0) {
				// 그룹으로 등록될 경우 - 새로 추가되는 그룹은 진하게
				const groupContainer = document.createElement('div');
				groupContainer.className = 'group-container';
				const color = getGroupColor(colorIndex);
				groupContainer.style.border = `2px solid ${color}`; // border 전체를 설정
				previewColors.push(color);
				
				names.forEach(name => {
					// 이름에서 괄호 패턴 파싱
					let actualName = name;
					let parsedGender = 'male'; // 기본값: 남
					let parsedWeight = 0; // 기본값: 0
					
					// 가중치 입력 필드 값 가져오기
					if (state.weightBalanceEnabled) {
						const weightInputEl = document.getElementById('weightInput');
						if (weightInputEl) {
							const inputWeight = parseInt(weightInputEl.value);
							if (!isNaN(inputWeight)) parsedWeight = Math.max(0, inputWeight);
						}
					}
					
					const match = name.match(/^(.+?)\(([^)]+)\)$/);
					if (match) {
						actualName = match[1].trim();
						const content = match[2].trim();
						const numberMatch = content.match(/\d+/);
						const genderMatch = content.match(/[남여]/);
						if (numberMatch) parsedWeight = parseInt(numberMatch[0]);
						if (genderMatch) parsedGender = genderMatch[0] === '남' ? 'male' : 'female';
					}
					
					const personTag = document.createElement('div');
					personTag.className = 'person-tag';
					
					// 성별 배경색 (기본값 포함)
					if (state.genderBalanceEnabled) {
						personTag.style.backgroundColor = parsedGender === 'male' ? '#e0f2fe' : '#fce7f3';
					}
					
					const nameSpan = document.createElement('span');
					nameSpan.className = 'name';
					nameSpan.textContent = actualName;
					nameSpan.style.fontWeight = 'bold';
					personTag.appendChild(nameSpan);
					
					// 성별 아이콘 (기본값 포함)
					if (state.genderBalanceEnabled) {
						const genderDisplay = document.createElement('span');
						genderDisplay.className = 'gender-display';
						genderDisplay.textContent = parsedGender === 'male' ? '♂️' : '♀️';
						personTag.appendChild(genderDisplay);
					}
					
					// 가중치 표시 (기본값 포함)
					if (state.weightBalanceEnabled) {
						const weightDisplay = document.createElement('span');
						weightDisplay.className = 'weight-display';
						weightDisplay.textContent = `${parsedWeight}`;
						personTag.appendChild(weightDisplay);
					}
					
					// 입력 데이터 내 중복된 이름이면 빨간 테두리와 pulse 애니메이션
					if (duplicatesInInput.includes(normalizeName(name))) {
						personTag.classList.add('is-duplicate');
					}
					
					groupContainer.appendChild(personTag);
				});
				
				newListEl.appendChild(groupContainer);
			} else {
				// 개별 참가자로 등록될 경우
				names.forEach(name => {
					// 이름에서 괄호 패턴 파싱
					let actualName = name;
					let parsedGender = 'male'; // 기본값: 남
					let parsedWeight = 0; // 기본값: 0
					
					// 가중치 입력 필드 값 가져오기
					if (state.weightBalanceEnabled) {
						const weightInputEl = document.getElementById('weightInput');
						if (weightInputEl) {
							const inputWeight = parseInt(weightInputEl.value);
							if (!isNaN(inputWeight)) parsedWeight = Math.max(0, inputWeight);
						}
					}
					
					const match = name.match(/^(.+?)\(([^)]+)\)$/);
					if (match) {
						actualName = match[1].trim();
						const content = match[2].trim();
						const numberMatch = content.match(/\d+/);
						const genderMatch = content.match(/[남여]/);
						if (numberMatch) parsedWeight = parseInt(numberMatch[0]);
						if (genderMatch) parsedGender = genderMatch[0] === '남' ? 'male' : 'female';
					}
					
					const personTag = document.createElement('div');
					personTag.className = 'person-tag';
					
					// 성별 배경색 (기본값 포함)
					if (state.genderBalanceEnabled) {
						personTag.style.backgroundColor = parsedGender === 'male' ? '#e0f2fe' : '#fce7f3';
					}
					
					const nameSpan = document.createElement('span');
					nameSpan.className = 'name';
					nameSpan.textContent = actualName;
					nameSpan.style.fontWeight = 'bold';
					personTag.appendChild(nameSpan);
					
					// 성별 아이콘 (기본값 포함)
					if (state.genderBalanceEnabled) {
						const genderDisplay = document.createElement('span');
						genderDisplay.className = 'gender-display';
						genderDisplay.textContent = parsedGender === 'male' ? '♂️' : '♀️';
						personTag.appendChild(genderDisplay);
					}
					
					// 가중치 표시 (기본값 포함)
					if (state.weightBalanceEnabled) {
						const weightDisplay = document.createElement('span');
						weightDisplay.className = 'weight-display';
						weightDisplay.textContent = `${parsedWeight}`;
						personTag.appendChild(weightDisplay);
					}
					
					// 입력 데이터 내 중복된 이름이면 빨간 테두리와 pulse 애니메이션
					if (duplicatesInInput.includes(normalizeName(name))) {
						personTag.classList.add('is-duplicate');
					}
					
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
	} else {
		// 질문 메시지 표시
		messageEl.textContent = duplicateNames.length === 1 ? '기존 참가자를 제거하고 새로 등록하시겠습니까?' : '기존 참가자들을 제거하고 새로 등록하시겠습니까?';
		messageEl.style.display = 'block';
	}
	// 경고 메시지 및 확인 버튼 상태를 삼항으로 설정
	if (warningEl) warningEl.style.display = hasInputDuplicates ? 'block' : 'none';
	if (warningEl && hasInputDuplicates) warningEl.innerHTML = `<strong>⚠️ 입력된 데이터에 중복된 이름이 있습니다!</strong>`;
	if (confirmBtn) {
		confirmBtn.disabled = !!hasInputDuplicates;
		confirmBtn.style.opacity = hasInputDuplicates ? '0.5' : '1';
		confirmBtn.style.cursor = hasInputDuplicates ? 'not-allowed' : 'pointer';
	}
	
	// 키보드 이벤트 리스너 추가
	document.addEventListener('keydown', handleDuplicateModalKeydown);
	
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
	
	if (state.genderBalanceEnabled) personTag.style.backgroundColor = person.gender === 'male' ? '#e0f2fe' : '#fce7f3';
	
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
		weightDisplay.textContent = `${person.weight ?? 0}`;
		personTag.appendChild(weightDisplay);
	}
	
	return personTag;
}

// 중복 확인 모달 키보드 이벤트 핸들러
function handleDuplicateModalKeydown(e) {
	if (e.key === 'Enter') {
		e.preventDefault();
		handleDuplicateConfirm();
	} else if (e.key === 'Escape') {
		e.preventDefault();
		handleDuplicateCancel();
	}
}

// 중복 확인 모달 숨김
function hideDuplicateConfirmModal() {
	const modal = document.getElementById('duplicateConfirmModal');
	if (!modal) return;
	
	// 키보드 이벤트 리스너 제거
	document.removeEventListener('keydown', handleDuplicateModalKeydown);
	
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
			inactivePeople: state.inactivePeople, // 미참가자 목록 저장
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
		
		// 이름별 성별/가중치 기본값 저장 (사용하지 않음 - inactivePeople로 대체)
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
			state.inactivePeople = data.inactivePeople || []; // 미참가자 목록 복원
			// 참가자 목록을 이름순으로 정렬
			state.people.sort((a, b) => a.name.localeCompare(b.name));
			// 그룹 내부를 가나다순으로 정렬하여 복원
			state.requiredGroups = (data.requiredGroups || []).map(group => {
				return [...group].sort((a, b) => {
					const pa = state.people.find(p => p.id === a);
					const pb = state.people.find(p => p.id === b);
					if (!pa || !pb) return 0;
					return pa.name.localeCompare(pb.name, 'ko');
				});
			});
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
				// 그룹 레이블 생성: A~Z, 넘으면 A1, A2...
				const groupLabelForIndex = (i) => {
					const base = String.fromCharCode(65 + (i % 26));
					return i < 26 ? base : base + Math.floor(i / 26).toString();
				};
				const personGroupMap = new Map();
				state.requiredGroups.forEach((group, gi) => {
					const label = groupLabelForIndex(gi);
					group.forEach(pid => personGroupMap.set(pid, label));
				});

				const peopleTable = sortedPeople.map(p => {
					const row = {
						'이름': p.name,
						'성별': p.gender === 'male' ? '♂️' : '♀️',
						'가중치': p.weight ?? 0
					};
					const grp = personGroupMap.get(p.id);
					if (grp) row['그룹'] = grp;
					return row;
				});
				console.table(peopleTable);
			} else {
				console.log('%c👥 참가자: 없음', 'color: #999; font-style: italic;');
			}
			
			if (state.inactivePeople.length > 0) {
				console.log('%c💤 미참가자 목록', 'color: #999; font-weight: bold; font-size: 14px;');
				const inactiveTable = state.inactivePeople.map(p => ({
					'이름': p.name,
					'성별': p.gender === 'male' ? '♂️' : '♀️',
					'가중치': p.weight ?? 0
				}));
				console.table(inactiveTable);
			} else {
				console.log('%c💤 미참가자: 없음', 'color: #999; font-style: italic;');
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
// getPersonDefaults는 제거됨(사용되지 않음). 필요 시 localStorage의 기본값을 직접 사용합니다.

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
	
	// 캐처 버튼 임시 비활성화 (원본 HTML은 변경 전에 저장)
	const btn = elements.captureBtn;
	const originalHTML = btn ? btn.innerHTML : '';
	if (btn) {
		btn.textContent = '캡처 중...';
		btn.disabled = true;
	}
	
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
		const AudioCtor = window.AudioContext || window.webkitAudioContext;
		if (!AudioCtor) throw new Error('AudioContext not supported');
		const audioContext = new AudioCtor();
		if (audioContext.state === 'suspended') audioContext.resume();

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

// 참가자 복사 기능 (Ctrl+C)
function handleParticipantCopy(e) {
	// Ctrl+C 또는 Cmd+C 감지 (Mac 지원)
	// e.key는 대소문자 구분하므로 소문자로 변환
	const key = e.key.toLowerCase();
	
	if ((e.ctrlKey || e.metaKey) && key === 'c') {
		// 텍스트 선택 여부 확인 - 텍스트가 선택되어 있으면 기본 복사 동작 유지
		const selection = window.getSelection();
		if (selection && selection.toString().length > 0) {
			return; // 텍스트가 선택되어 있으면 기본 복사 동작
		}
		
		// 입력창에 포커스가 있으면 기본 복사 동작 유지
		const activeElement = document.activeElement;
		if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
			return;
		}
		
		// 참가자가 없으면 아무것도 하지 않음
		if (state.people.length === 0) {
			return;
		}
		
		// 기본 동작 방지
		e.preventDefault();
		
		// 참가자 데이터를 문자열로 변환
		const participantString = convertParticipantsToString();
		
		// 클립보드에 복사
		copyToClipboard(participantString);
		
		// 플래시 효과 발생
		triggerParticipantFlash();
	}
}

// 참가자 데이터를 문자열로 변환
function convertParticipantsToString() {
	const result = [];
	const grouped = new Set();
	const groupMap = new Map();
	
	// 그룹 정보를 맵으로 저장
	state.requiredGroups.forEach((group, groupIndex) => {
		group.forEach(personId => {
			grouped.add(personId);
			groupMap.set(personId, groupIndex);
		});
	});
	
	const processedGroups = new Set();
	
	state.people.forEach(person => {
		const groupIndex = groupMap.get(person.id);
		
		if (groupIndex !== undefined && !processedGroups.has(groupIndex)) {
			// 그룹 처리
			processedGroups.add(groupIndex);
			const group = state.requiredGroups[groupIndex];
			const groupMembers = group.map(personId => {
				const groupPerson = state.people.find(p => p.id === personId);
				return groupPerson ? formatPersonString(groupPerson) : '';
			}).filter(s => s);
			
			result.push(groupMembers.join(','));
		} else if (groupIndex === undefined) {
			// 그룹에 속하지 않은 개별 항목
			result.push(formatPersonString(person));
		}
	});
	
	return result.join('/');
}

// 개별 참가자를 문자열로 포맷
function formatPersonString(person) {
	let result = person.name;
	
	const genderEnabled = state.genderBalanceEnabled;
	const weightEnabled = state.weightBalanceEnabled;
	
	// 둘 다 체크되어 있지 않으면 이름만
	if (!genderEnabled && !weightEnabled) {
		return result;
	}
	
	// 괄호 안에 들어갈 내용 구성
	let bracketContent = '';
	
	// 성별 추가 (체크되어 있을 때)
	if (genderEnabled) {
		const genderStr = person.gender === 'female' ? '여' : '남';
		bracketContent += genderStr;
	}
	
	// 가중치 추가 (체크되어 있을 때)
	if (weightEnabled) {
		const weightStr = person.weight || 0;
		bracketContent += weightStr;
	}
	
	result += `(${bracketContent})`;
	return result;
}

// 클립보드에 텍스트 복사
function copyToClipboard(text) {
	if (navigator.clipboard && navigator.clipboard.writeText) {
		navigator.clipboard.writeText(text).then(() => {
			console.log('참가자 데이터가 클립보드에 복사되었습니다:', text);
		}).catch(err => {
			console.error('클립보드 복사 실패:', err);
			fallbackCopyToClipboard(text);
		});
	} else {
		fallbackCopyToClipboard(text);
	}
}

// 클립보드 API가 지원되지 않을 때 대체 방법
function fallbackCopyToClipboard(text) {
	const textArea = document.createElement('textarea');
	textArea.value = text;
	textArea.style.position = 'fixed';
	textArea.style.left = '-9999px';
	document.body.appendChild(textArea);
	textArea.focus();
	textArea.select();
	
	try {
		document.execCommand('copy');
		console.log('참가자 데이터가 클립보드에 복사되었습니다:', text);
	} catch (err) {
		console.error('클립보드 복사 실패:', err);
	}
	
	document.body.removeChild(textArea);
}

// 참가자 영역에 플래시 효과 발생
function triggerParticipantFlash() {
	const peopleList = elements.peopleList;
	if (!peopleList) return;
	
	// 플래시 효과 클래스 추가
	peopleList.classList.add('capture-flash');
	
	// 찰칵 사운드 재생
	playCameraShutterSound();
	
	// 애니메이션 종료 후 클래스 제거
	setTimeout(() => {
		peopleList.classList.remove('capture-flash');
	}, 600);
}

function resetAll() {
	if (!confirm('모든 데이터를 초기화하시겠습니까?\n참고: 제약 설정(금지 제약)은 초기화되지 않습니다.')) {
		return;
	}

	// 적용된(id 기반) 제약을 이름 기반 보류 제약으로 변환하여 유지
	let converted = 0;
	state.forbiddenPairs.forEach(([a, b]) => {
		const pa = state.people.find(p => p.id === a);
		const pb = state.people.find(p => p.id === b);
		if (pa && pb) if (addPendingConstraint(pa.name, pb.name).ok) converted++;
	});
	if (converted > 0) {
		console.log(`초기화: 기존 제약 ${converted}개가 보류 제약으로 변환되어 유지됩니다.`);
		safeOpenForbiddenWindow();
	}
	
	// 모든 참가자를 미참가자 목록으로 이동
	state.people.forEach(person => {
		const normalized = normalizeName(person.name);
		const existingInactive = state.inactivePeople.find(p => normalizeName(p.name) === normalized);
		if (!existingInactive) {
			const inactivePerson = {
				name: person.name,
				gender: person.gender,
				weight: person.weight
			};
			state.inactivePeople.push(inactivePerson);
		}
	});
	
	// 참가자 및 그룹 목록 초기화(보류 제약은 유지)
	state.people = [];
	state.requiredGroups = [];
	state.nextId = 1;
	state.forbiddenPairs = []; // id 기반 제약 초기화(보류로 전환됨)
	state.forbiddenMap = {};
	elements.resultsSection.classList.remove('visible');
	// 캡처 버튼 컨테이너 숨기기
	if (elements.captureButtonContainer) elements.captureButtonContainer.style.display = 'none';
	// 리셋 시 FAQ 섹션 다시 표시
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
	
		// Fisher-Yates 셔플 알고리즘 (전체 참가자 배열)
		for (let i = state.people.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[state.people[i], state.people[j]] = [state.people[j], state.people[i]];
		}
		// 그룹 내부도 섞기
		state.requiredGroups = state.requiredGroups.map(group => {
			const arr = [...group];
			for (let i = arr.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[arr[i], arr[j]] = [arr[j], arr[i]];
			}
			return arr;
		});
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

	// 입력 내용에서 성별/가중치 패턴 감지하여 자동 체크
	autoDetectAndCheckOptions();

	// '/'로 분리하여 토큰 처리; '!'가 포함된 토큰은 제약, 아니면 이름/그룹으로 처리
	const tokens = input.split('/').map(t => t.trim()).filter(t => t !== '');

	if (tokens.length === 0) {
		alert('이름을 입력해주세요.');
		return;
	}

	let constraintsTouched = false;
	const duplicateHits = [];
	const pendingNamesData = []; // 등록 대기중인 이름 그룹들
	const allInputNames = []; // 입력된 모든 이름 (정규화된 형태)

	tokens.forEach(token => {
		if (token.includes('!')) {
			// 한 입력에서 여러 제약 처리: "A!B!C!D" 또는 "A!B,C!E"
			// 먼저 쉼표로 분리하여 "A!B,C!E" -> ["A!B", "C!E"] 형태로 처리
			const constraintParts = token.split(',').map(p => p.trim()).filter(p => p !== '');
			
			constraintParts.forEach(constraint => {
				// 제거 처리: A!!B
				if (constraint.includes('!!')) {
					const [left, right] = constraint.split('!!').map(s => s.trim());
					if (left && right) {
						const rres = removeForbiddenPairByNames(left, right);
						if (!rres.ok) console.log('보류/적용 제약 제거 실패:', rres.message);
						else { safeOpenForbiddenWindow(); constraintsTouched = true; }
					}
				}
				// 쌍 제약 처리: A!B!C!D -> 모든 조합 쌍 생성
				else if (constraint.includes('!')) {
					const names = constraint.split('!').map(s => s.trim()).filter(s => s !== '');
					
					// 모든 조합에 대해 쌍 제약 생성
					for (let i = 0; i < names.length; i++) {
						for (let j = i + 1; j < names.length; j++) {
							const ln = names[i];
							const rn = names[j];
							if (!ln || !rn) continue;
							
							const pa = findPersonByName(ln);
							const pb = findPersonByName(rn);
							if (pa && pb) {
								const res = addForbiddenPairByNames(ln, rn);
								// addForbiddenPairByNames가 영속화와 뷰 업데이트를 처리함
								if (res.ok) constraintsTouched = true;
								// 성공/실패 모두 자식창 표시
								safeOpenForbiddenWindow();
							} else {
								const pres = addPendingConstraint(ln, rn);
								if (pres.ok) constraintsTouched = true;
							}
						}
					}
				}
			});
		} else {
			// 일반 그룹/이름 토큰
			const names = token.split(',').map(n => n.trim()).filter(n => n !== '');
			if (names.length === 0) return;

			// 기존 참가자와의 중복 체크 (괄호 제거된 이름으로 비교)
			const groupDuplicates = [];
			names.forEach(name => {
				const normalized = normalizeName(name);
				const exists = state.people.some(p => normalizeName(p.name) === normalized);
				if (exists) groupDuplicates.push(name);
			});

			// 중복된 이름이 있으면 기록
			if (groupDuplicates.length > 0) duplicateHits.push(...groupDuplicates);

			// 등록 대기 데이터에 추가
			pendingNamesData.push({ names, hasDuplicates: groupDuplicates.length > 0 });
			
			// 모든 입력 이름을 수집 (정규화된 형태)
			names.forEach(name => {
				allInputNames.push(normalizeName(name));
			});
		}
	});

	// 여러 토큰에 걸친 입력 데이터 내 중복 체크 (예: "하/하")
	const inputNameCount = {};
	const duplicatesAcrossTokens = [];
	allInputNames.forEach(normalizedName => {
		inputNameCount[normalizedName] = (inputNameCount[normalizedName] || 0) + 1;
		if (inputNameCount[normalizedName] === 2) duplicatesAcrossTokens.push(normalizedName);
	});

	const hasInputDuplicates = duplicatesAcrossTokens.length > 0;

	// 제약 처리만 있었다면 입력창 초기화
	if (constraintsTouched && pendingNamesData.length === 0) {
		elements.nameInput.value = '';
		elements.nameInput.focus();
		return;
	}

	// 중복이 하나라도 있으면 모달 표시 (기존 참가자와 중복 또는 입력 내 중복)
	if (duplicateHits.length > 0 || hasInputDuplicates) {
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
	// renderPeople()이 입력창을 참조하지 않도록 먼저 초기화
	const tempInput = elements.nameInput.value;
	elements.nameInput.value = '';
	processAddPerson(pendingNamesData, null);
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
			if (existing) duplicateIds.push(existing.id);
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
					// 이름에서 괄호 패턴 분석: 이름(남), 이름(100), 이름(100남), 이름(여400) 등
					let actualName = name;
					let parsedGender = null;
					let parsedWeight = null;
					
					// 괄호가 있는지 확인
					const match = name.match(/^(.+?)\(([^)]+)\)$/);
					if (match) {
						actualName = match[1].trim();
						const content = match[2].trim();
						
						// 괄호 안 내용 분석
						// 패턴: 숫자만, 남/여만, 숫자+남/여 (순서 무관)
						const numberMatch = content.match(/\d+/);
						const genderMatch = content.match(/[남여]/);
						
						if (numberMatch) {
							parsedWeight = parseInt(numberMatch[0]);
						}
						if (genderMatch) {
							parsedGender = genderMatch[0] === '남' ? 'male' : 'female';
						}
					}
					
					// 기본값 설정
					let weight = 0;
					let gender = 'male';
					
					// 미참가자 목록에서 찾기
					const normalized = normalizeName(actualName);
					const inactivePerson = state.inactivePeople.find(p => normalizeName(p.name) === normalized);
					
					// 우선순위: 1. 명령어 입력값 (parsedGender/parsedWeight)
					//          2. 미참가자 목록 값
					//          3. 입력 필드 값 또는 기본값
					
					// 성별 결정
					if (parsedGender !== null) {
						// 1순위: 명령어로 지정된 성별
						gender = parsedGender;
					} else if (inactivePerson) {
						// 2순위: 미참가자 목록의 성별
						gender = inactivePerson.gender;
					}
					// else: 3순위 기본값 'male' 유지
					
					// 가중치 결정
					if (parsedWeight !== null) {
						// 1순위: 명령어로 지정된 가중치
						weight = Math.max(0, parsedWeight);
					} else if (inactivePerson) {
						// 2순위: 미참가자 목록의 가중치
						weight = inactivePerson.weight;
					} else if (state.weightBalanceEnabled) {
						// 3순위: 입력 필드 값
						let inputWeight = 0;
						const weightInputEl = document.getElementById('weightInput');
						if (weightInputEl) {
							inputWeight = parseInt(weightInputEl.value);
							if (isNaN(inputWeight)) inputWeight = 0;
						}
						weight = Math.max(0, inputWeight);
					}
					// else: 3순위 기본값 0 유지
					
					const person = {
						id: state.nextId++,
						name: actualName,
						gender: gender,
						weight: weight
					};
					state.people.push(person);
					newIds.push(person.id);
					addedAny = true;
					
					// 미참가자 목록에서 제거
					if (inactivePerson) {
						state.inactivePeople = state.inactivePeople.filter(p => normalizeName(p.name) !== normalized);
					}
				});
			if (newIds.length > 1) newGroupsToAdd.push(newIds);
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
		// 사람을 추가한 이후 보류 중인 텍스트 제약을 해결 시도
		tryResolvePendingConstraints();
	}
}

function removePerson(id) {
	const person = state.people.find(p => p.id === id);
	if (person) {
		// 미참가자 목록에 추가 (중복 확인)
		const normalized = normalizeName(person.name);
		const existingInactive = state.inactivePeople.find(p => normalizeName(p.name) === normalized);
		if (!existingInactive) {
			// id 제거하고 미참가자 목록에 추가
			const inactivePerson = {
				name: person.name,
				gender: person.gender,
				weight: person.weight
			};
			state.inactivePeople.push(inactivePerson);
		}
	}
	
	state.people = state.people.filter(p => p.id !== id);
	state.requiredGroups = state.requiredGroups.map(group => group.filter(pid => pid !== id));
	state.requiredGroups = state.requiredGroups.filter(group => group.length > 1);
	// 이 사람이 포함된 모든 금지(제약) 쌍 제거
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
		try { printParticipantConsole(); } catch (_) { /* no-op */ }
	}
}

function updatePersonWeight(id, weight) {
	const person = state.people.find(p => p.id === id);
	if (person) {
		person.weight = parseInt(weight) || 0;
		saveToLocalStorage();
		try { printParticipantConsole(); } catch (_) { /* no-op */ }
	}
}

// --- 제약 및 이름 정규화 관련 헬퍼 함수들 ---
function normalizeName(name) {
	// 괄호 패턴 제거: 이름(남100) -> 이름
	const withoutParentheses = (name || '').replace(/\([^)]*\)$/, '').trim();
	return withoutParentheses.toLowerCase();
}

function findPersonByName(name) {
	return state.people.find(p => normalizeName(p.name) === normalizeName(name));
}

function addForbiddenPairByNames(nameA, nameB) {
	const pa = findPersonByName(nameA);
	const pb = findPersonByName(nameB);
	if (!pa || !pb) {
		const msg = `등록된 사용자 중에 ${!pa ? nameA : nameB}을(를) 찾을 수 없습니다.`;
		// 실패 메시지는 UI 팝업에서 처리하므로 콘솔 로그는 제거
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
		// 업데이트가 있으면 콘솔 관리 뷰를 갱신하고 팝업을 연다
		try { printParticipantConsole(); } catch (_) { /* no-op */ }
		safeOpenForbiddenWindow();
	} else {
		// 이미 존재할 때의 디버그 로그 제거
		// 제약이 이미 존재하더라도 팝업을 열어 사용자가 확인/관리할 수 있도록 함
		safeOpenForbiddenWindow();
	}
	return { ok: true, added: !exists };
} 

// 이름 기반 보류 제약 추가 (참가자가 없어도 추가 가능)
function addPendingConstraint(leftName, rightName) {
	const l = normalizeName(leftName);
	const r = normalizeName(rightName);
	if (l === r) return { ok: false, message: '동일인 제약은 불가능합니다.' };
	// 보류 목록에서 중복 방지
	const existsPending = state.pendingConstraints.some(pc => pc.left === l && pc.right === r);
	if (existsPending) { safeOpenForbiddenWindow(); return { ok: true }; }
	state.pendingConstraints.push({ left: l, right: r });
	saveToLocalStorage();
	// 갱신된 상태를 콘솔에 반영
	try { printParticipantConsole(); } catch (_) { /* no-op */ }
	// 팝업이 열려 있으면 갱신(또는 팝업 열기)
		safeOpenForbiddenWindow();
	return { ok: true }; 
}

// 새 참가자 추가 시 보류 제약을 해결하려 시도
function tryResolvePendingConstraints() {
	if (!state.pendingConstraints.length) return;
	let changed = false;
	state.pendingConstraints = state.pendingConstraints.filter(pc => {
		const pa = findPersonByName(pc.left);
		const pb = findPersonByName(pc.right);
		if (pa && pb) {
			const res = addForbiddenPairByNames(pa.name, pb.name);
			// 과도한 로그를 피하기 위해; addForbiddenPairByNames가 콘솔을 갱신합니다
			changed = true;
			return false; // 보류 목록에서 제거
		}
		return true; // 보류 유지
	});
	if (changed) {
		buildForbiddenMap();
		saveToLocalStorage();
		try { printParticipantConsole(); } catch (_) { /* no-op */ }
		safeOpenForbiddenWindow();
	} 
}

// 로컬 보기(file:// 또는 localhost) 감지 — 개발 편의를 위해 동작을 조정
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
	// 애니메이션 지속시간(ms) 계산을 통일
	return Math.max(50, Math.round((state.teamDisplayDelay || 400) * 0.75));
}



// 이름으로 제약 제거 (적용된 id 기반 제약 또는 보류 제약 모두 지원). 순서는 무관합니다.
function removeForbiddenPairByNames(nameA, nameB) {
	const na = normalizeName(nameA);
	const nb = normalizeName(nameB);
	if (na === nb) {
		console.log('제약 제거 실패: 동일인 제약은 불가능합니다.');
		return { ok: false, message: '동일인 제약은 불가능합니다.' };
	}
	// 둘 다 존재하면 적용된(id 기반) 제약을 먼저 제거 시도
	const pa = findPersonByName(na);
	const pb = findPersonByName(nb);
	if (pa && pb) {
		const before = state.forbiddenPairs.length;
		state.forbiddenPairs = state.forbiddenPairs.filter(([a, b]) => !((a === pa.id && b === pb.id) || (a === pb.id && b === pa.id)));
		if (state.forbiddenPairs.length !== before) {
			buildForbiddenMap();
			saveToLocalStorage();
			try { printParticipantConsole(); } catch (_) { /* no-op */ }
			safeOpenForbiddenWindow();
			return { ok: true };
		}
	}
	// 적용된 제약을 찾지 못했거나 사람이 없으면 보류 중인 텍스트 제약(순서 무관)을 제거
	const beforePending = state.pendingConstraints.length;
	state.pendingConstraints = state.pendingConstraints.filter(pc => !( (pc.left === na && pc.right === nb) || (pc.left === nb && pc.right === na) ));
	if (state.pendingConstraints.length !== beforePending) {
		saveToLocalStorage();
		try { printParticipantConsole(); } catch (_) { /* no-op */ }
		safeOpenForbiddenWindow();
		return { ok: true };
	}
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

// --- 제약 연결 팝업 창 관련 헬퍼 ---
let forbiddenPopup = null;

function openForbiddenWindow() {
	const features = 'width=600,height=700,toolbar=0,location=0,status=0,menubar=0,scrollbars=1,resizable=1';
	try {
		// 팝업이 이미 존재하지만 크로스오리진 문제로 접근 불가해졌다면 닫고 다시 생성
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
			let doc;
			try {
				doc = forbiddenPopup.document;
			} catch (e) {
				console.warn('팝업에 접근할 수 없습니다 (크로스오리진 또는 차단됨):', e);
				// 반복되는 예외를 피하기 위해 참조를 제거
				try { forbiddenPopup.close(); } catch(_){ }
				forbiddenPopup = null;
				return;
			}
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
							if (parentWindow.blindDelay === null) modalDisabled = true;
							else if (Number.isFinite(parentWindow.blindDelay)) {
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
									if (parentWindow && parentWindow.clearAllConstraints) parentWindow.clearAllConstraints(); else {
										alert('부모 창 참조를 찾을 수 없습니다.');
									}
								} catch(e){ console.log('초기화 실패:', e); alert('초기화 실패: ' + e.message); }
							}
						});
					}
					
					function hideModal(){
						if (reShowTimeout) { clearTimeout(reShowTimeout); reShowTimeout = null; }
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
	let doc;
	try {
		doc = forbiddenPopup.document;
	} catch (e) {
		console.warn('팝업 문서에 접근할 수 없습니다 (크로스오리진):', e);
		try { forbiddenPopup.close(); } catch(_){}
		forbiddenPopup = null;
		return;
	}
	const appliedList = doc.getElementById('appliedList');
	const pendingList = doc.getElementById('pendingList');
	if (!appliedList || !pendingList) return;
	// 초기화
	appliedList.innerHTML = '';
	pendingList.innerHTML = '';
	// 적용된 제약
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
	// 대기중인 제약
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

// 팝업 헬퍼가 현재 스코프에 없을 때 ReferenceError를 방지하는 안전한 래퍼
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
	try { printParticipantConsole(); } catch (_) { /* no-op */ }
	renderForbiddenWindowContent();
}

// escapeHtml은 제거됨(참조되지 않음). 필요하면 DOM API 또는 간단한 인라인 헬퍼 사용

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
	if (groupIndex === -1) return state.ungroupedColor;
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
	
	if (state.genderBalanceEnabled) personTag.style.backgroundColor = person.gender === 'male' ? '#e0f2fe' : '#fce7f3';
	
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
		em.style.display = count === 0 ? 'none' : 'inline-flex';
		em.setAttribute('aria-hidden', count === 0 ? 'true' : 'false');
	}
}

// 콘솔에 현재 참가자 목록을 그룹 표시 순서대로 출력
function printParticipantConsole() {
	try {
		if (!console || !console.table) return;
		try { console.clear(); } catch (_) { /* 일부 환경에서 clear가 제한될 수 있음 */ }
		console.group('📋 참가자 관리 (실시간)');
		if (!state.people || state.people.length === 0) {
			console.log('%c👥 참가자: 없음', 'color: #999; font-style: italic;');
			console.groupEnd();
			return;
		}

		const groupLabelForIndex = (i) => {
			const base = String.fromCharCode(65 + (i % 26));
			return i < 26 ? base : base + Math.floor(i / 26).toString();
		};

		const personGroupMap = new Map();
		state.requiredGroups.forEach((group, gi) => {
			const label = groupLabelForIndex(gi);
			group.forEach(pid => personGroupMap.set(pid, label));
		});

		// 화면 표시 순서대로 정렬 (그룹 단위)
		const groupMap = new Map();
		state.requiredGroups.forEach((group, gi) => group.forEach(id => groupMap.set(id, gi)));
		const processed = new Set();
		const displaySeq = [];
		state.people.forEach(p => {
			const gi = groupMap.get(p.id);
			if (gi !== undefined && !processed.has(gi)) {
				processed.add(gi);
				const g = state.requiredGroups[gi];
				g.forEach(id => {
					const pp = state.people.find(x => x.id === id);
					if (pp) displaySeq.push(pp);
				});
			} else if (gi === undefined) {
				displaySeq.push(p);
			}
		});

		const peopleTable = displaySeq.map(p => {
			const row = {
				'이름': p.name,
				'성별': p.gender === 'male' ? '♂️' : '♀️',
				'가중치': typeof p.weight !== 'undefined' ? p.weight : 0
			};
			const grp = personGroupMap.get(p.id);
			if (grp) row['그룹'] = grp;
			return row;
		});

		console.table(peopleTable);

		// 미참가자 목록 출력
		if (state.inactivePeople && state.inactivePeople.length > 0) {
			console.log('%c💤 미참가자 목록', 'color: #999; font-weight: bold; font-size: 14px;');
			const inactiveTable = state.inactivePeople.map(p => ({
				'이름': p.name,
				'성별': p.gender === 'male' ? '♂️' : '♀️',
				'가중치': typeof p.weight !== 'undefined' ? p.weight : 0
			}));
			console.table(inactiveTable);
		} else {
			console.log('%c💤 미참가자: 없음', 'color: #999; font-style: italic;');
		}

		// 적용된 제약과 보류 제약도 함께 출력
		if (state.forbiddenPairs && state.forbiddenPairs.length > 0) {
			console.log('%c🚫 적용된 제약', 'color: #ef4444; font-weight: bold; font-size: 14px;');
			state.forbiddenPairs.forEach((pair, idx) => {
				const pa = state.people.find(p => p.id === pair[0]);
				const pb = state.people.find(p => p.id === pair[1]);
				const left = pa ? pa.name : `id:${pair[0]}`;
				const right = pb ? pb.name : `id:${pair[1]}`;
				console.log(`  ${idx + 1}. ${left} ↔ ${right}`);
			});
		} else {
			console.log('%c🚫 적용된 제약: 없음', 'color: #999; font-style: italic;');
		}

		if (state.pendingConstraints && state.pendingConstraints.length > 0) {
			console.log('%c⏳ 대기 중인 제약', 'color: #f59e0b; font-weight: bold; font-size: 14px;');
			state.pendingConstraints.forEach((pc, idx) => {
				console.log(`  ${idx + 1}. ${pc.left} ↔ ${pc.right}`);
			});
		} else {
			console.log('%c⏳ 대기 중인 제약: 없음', 'color: #999; font-style: italic;');
		}

		console.groupEnd();
	} catch (e) {
		try { console.error('printParticipantConsole 실패:', e); } catch (_) { /* no-op */ }
	}
}



function renderPeople() {
	updateParticipantCount();
	elements.peopleList.innerHTML = '';
    
	
	// 입력창에서 중복 체크를 위한 이름 목록 가져오기
	const potentialDuplicates = getPotentialDuplicatesFromInput();
	
	const grouped = new Set();
	const groupMap = new Map(); // personId -> groupIndex(그룹 인덱스)
	
	// 그룹 정보를 맵으로 저장
	state.requiredGroups.forEach((group, groupIndex) => {
		// 그룹 내부는 실제 배열 순서대로(셔플 반영)
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
			// 그룹 내부는 실제 배열 순서대로(셔플 반영)
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
		// 콘솔 업데이트
		try { printParticipantConsole(); } catch (_) { /* no-op */ }
        
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
	if (!teams) return; // generateTeams가 불가능할 경우 오류를 표시함
	
	// 검증된 팀 저장
	currentTeams = teams;
	isValidated = false;
	
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
	
	// 검증 루프 실행 후 최종 결과만 표시
	startValidationLoop(teams);
	
	// 팀 생성 시 콘솔의 참가자 관리 뷰도 갱신
	try { printParticipantConsole(); } catch (_) { /* no-op */ }
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
		// 비그룹 참가자만을 위한 Fisher-Yates 셔플
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

	// 팀 순서 배열에서 마지막 팀 인덱스를 항상 맨 뒤로 보낼지 결정하는 공통 로직
	function pushLastTeamToEndIfNeeded(teamOrder, teams) {
		if (state.maxTeamSizeEnabled && teamOrder.length > 1) {
			const lastIdx = teams.length - 1;
			const pos = teamOrder.indexOf(lastIdx);
			if (pos !== -1) {
				teamOrder.splice(pos, 1);
				teamOrder.push(lastIdx);
			}
		}
	}

	// 유효성 검사: 필수 그룹 내에 금지 제약 쌍이 포함되어 있으면 안 됨
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
	
	// 팀 인원수와 정확히 일치하는 그룹들을 미리 분리
	const completeTeamGroups = []; // 완성된 팀으로 사용할 그룹들
	const validGroups = state.requiredGroups.filter(group => 
		group.every(id => people.some(p => p.id === id))
	);
	
	const regularGroups = []; // 일반 그룹들
	const completeTeamMemberIds = new Set(); // 완성된 팀에 속한 멤버 ID들
	
	validGroups.forEach(group => {
		if (group.length === state.membersPerTeam) {
			completeTeamGroups.push(group);
			group.forEach(id => completeTeamMemberIds.add(id));
		} else {
			regularGroups.push(group);
		}
	});
	
	// 완성된 팀 그룹에 속하지 않은 사람들만 필터링
	const remainingPeople = people.filter(p => !completeTeamMemberIds.has(p.id));

	// 팀 수 계산 (완성된 팀 + 나머지 인원으로 만들 팀)
	const additionalTeamCount = remainingPeople.length > 0 
		? Math.max(1, Math.ceil(remainingPeople.length / state.membersPerTeam))
		: 0;
	const totalTeamCount = completeTeamGroups.length + additionalTeamCount;
	
	if (totalTeamCount === 0) {
		showError('팀을 구성할 수 없습니다.');
		return null;
	}
	
	const maxAttempts = 500;

	// 나머지 참가자에서 최소 성별(소수 성별) 계산
	const maleCount = remainingPeople.filter(p => p.gender === 'male').length;
	const femaleCount = remainingPeople.filter(p => p.gender === 'female').length;
	const minorityGender = maleCount === femaleCount ? null : (femaleCount < maleCount ? 'female' : 'male');
	const getTeamMinorityCount = (team) => {
		if (!minorityGender) return 0;
		return team.filter(p => p.gender === minorityGender).length;
	};

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		// 나머지 사람들만 셔플
		const shuffledPeople = [...remainingPeople].sort(() => Math.random() - 0.5);
		// 나머지 사람들로 만들 팀들만 생성
		const teams = Array.from({ length: additionalTeamCount }, () => []);
		const assigned = new Set();
		
		// 헬퍼 함수: 팀의 총 가중치 계산
		const calcTeamWeight = (team) => team.reduce((sum, p) => sum + (p.weight || 0), 0);

		// 일반 그룹들만 처리 (regularGroups 사용)
		// 가중치 균등이 활성화된 경우 그룹을 가중치 순으로 정렬 (높은 순)
		let processGroups;
		if (state.weightBalanceEnabled) {
			// 각 그룹의 평균 가중치 계산
			const groupsWithWeight = regularGroups.map(group => {
				const groupMembers = group.map(id => shuffledPeople.find(p => p.id === id)).filter(Boolean);
				const totalWeight = groupMembers.reduce((sum, p) => sum + (p.weight || 0), 0);
				const avgWeight = groupMembers.length > 0 ? totalWeight / groupMembers.length : 0;
				return { group, avgWeight };
			});
			// 가중치 내림차순 정렬
			groupsWithWeight.sort((a, b) => b.avgWeight - a.avgWeight);
			processGroups = groupsWithWeight.map(g => g.group);
		} else {
			// 가중치 균등이 없으면 셔플
			processGroups = [...regularGroups].sort(() => Math.random() - 0.5);
		}
		
		let groupFailed = false;

		for (const group of processGroups) {
			const groupMembers = group.map(id => shuffledPeople.find(p => p.id === id)).filter(Boolean);
			
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
				// 최대인원 모드일 때는 마지막 팀을 우선순위 맨 뒤로 보냄 (중복 로직을 헬퍼로 대체)
				pushLastTeamToEndIfNeeded(teamOrder, teams);
			} else {
				// 가중치 균등이 없으면 랜덤 순서
				teamOrder = teams.map((_, idx) => idx).sort(() => Math.random() - 0.5);
			}
			
			let selectedTeam = -1;
			
			// 가중치 낮은 팀부터 조건 확인
			for (const i of teamOrder) {
				// 체크 1: 인원 수 제약
				if (state.maxTeamSizeEnabled) {
					if (i < teams.length - 1 && teams[i].length + groupMembers.length > state.membersPerTeam) continue;
				} else {
					if (teams[i].length + groupMembers.length > state.membersPerTeam) continue;
				}
				
				// 체크 2: 충돌(금지 제약) 없음
				let hasConflict = false;
				for (const gm of groupMembers) {
					if (teams[i].some(tm => isForbidden(gm.id, tm.id))) {
						hasConflict = true;
						break;
					}
				}
				if (hasConflict) continue;
				
				// 체크 3: 성별 균형 - 활성화된 경우에만 적용
				if (state.genderBalanceEnabled && minorityGender) {
					const currentMinGender = getTeamMinorityCount(teams[i]);
					const allTeamMinGenders = teams.map(getTeamMinorityCount);
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

		// 개별 참가자 배치 - shuffledPeople 사용으로 매 시도마다 다른 순서 보장
		const unassignedPeople = shuffledPeople.filter(p => !assigned.has(p.id));
		
		// 가중치 균등이 활성화된 경우: 가중치별로 그룹화 후 각 그룹 내에서 랜덤
		if (state.weightBalanceEnabled) {
			// 1. 가중치별로 그룹화
			const weightGroups = new Map();
			unassignedPeople.forEach(p => {
				const w = p.weight || 0;
				if (!weightGroups.has(w)) weightGroups.set(w, []);
				weightGroups.get(w).push(p);
			});
			
			// 2. 각 가중치 그룹 내에서 랜덤 셔플
			weightGroups.forEach(group => {
				for (let i = group.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[group[i], group[j]] = [group[j], group[i]];
				}
			});
			
			// 3. 가중치 높은 순으로 재구성
			const sortedWeights = Array.from(weightGroups.keys()).sort((a, b) => b - a);
			unassignedPeople.length = 0;
			sortedWeights.forEach(w => {
				unassignedPeople.push(...weightGroups.get(w));
			});
		}
		
		let personFailed = false;

		for (const person of unassignedPeople) {
			const isMinorityPerson = minorityGender && person.gender === minorityGender;
			
			// 팀 순서 결정: 최대인원 모드, 일반 모드 + 가중치, 일반 모드 구분
			let teamOrder;
			if (state.maxTeamSizeEnabled) {
				// 최대인원 모드: 인덱스 순서
				teamOrder = teams.map((_, idx) => idx);
			} else if (state.weightBalanceEnabled) {
				// 가중치 균등 모드: 가중치 낮은 순 우선, 같으면 인원 수 작은 순
				teamOrder = teams.map((team, idx) => ({
					idx,
					size: team.length,
					weight: calcTeamWeight(team)
				})).sort((a, b) => {
					// 1. 가중치 낮은 순 (가중치 균등 우선)
					if (a.weight !== b.weight) return a.weight - b.weight;
					// 2. 가중치 같으면 팀 크기 작은 순
					if (a.size !== b.size) return a.size - b.size;
					return a.idx - b.idx;
				}).map(t => t.idx);
			} else {
				// 일반 모드 + 가중치 없음: 2 유닛 우선 로직
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
			
			// 우선순위 팀부터 조건 확인
			for (const i of teamOrder) {
				// 체크 1: 인원 수 제약
				if (state.maxTeamSizeEnabled) {
					if (i < teams.length - 1 && teams[i].length >= state.membersPerTeam) continue;
				} else {
					// 일반 모드: 최대 인원만 체크 (가중치 균등 시에도 동일)
					if (teams[i].length >= state.membersPerTeam) continue;
				}
				
				// 체크 2: 충돌(금지 제약) 없음
				if (teams[i].some(tm => isForbidden(tm.id, person.id))) continue;
				
				// 체크 3: 성별 균형 - 활성화된 경우에만 적용
				// 가중치 균등 모드에서는 가중치 우선, 성별 균형은 참고만
				if (state.genderBalanceEnabled && isMinorityPerson && !state.weightBalanceEnabled) {
					const currentMinGender = getTeamMinorityCount(teams[i]);
					const allTeamMinGenders = teams.map(getTeamMinorityCount);
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

		// 검증: 충돌 없음 및 팀당 최소 2개의 유닛 확보
		if (conflictExists(teams)) continue;
		
		// 각 팀이 최소 2개의 유닛을 갖추었는지 확인
		let allValid = true;
		for (let ti = 0; ti < teams.length; ti++) {
			const team = teams[ti];
			const groupSet = new Set();
			let ungroupedCount = 0;
			for (const member of team) {
				const gi = getPersonGroupIndex(member.id);
				if (gi === -1) ungroupedCount++;
				else groupSet.add(gi);
			}
			// 기본 규칙: 그룹 수 + 비그룹 수 >= 2
			if (groupSet.size + ungroupedCount < 2) {
				// 예외: 최대인원 모드이고 마지막 팀이며, 그 마지막 팀이 '비그룹 개인 1명'만 있는 경우 허용
				if (state.maxTeamSizeEnabled && ti === teams.length - 1 && groupSet.size === 0 && ungroupedCount === 1) {
					continue;
				}
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
				// 기존: 전체 팀을 정렬하면 작은 팀이 중간에 섞여 버려 원하는 "마지막 팀만 언더플로우" 결과가 나오지 않음.
				// 대신 마지막 팀에서 앞쪽 팀들을 채울 수 있으면 옮겨 채우도록 재분배한다.
				const lastIdx = teams.length - 1;
				const lastTeam = teams[lastIdx];
				for (let i = 0; i < lastIdx; i++) {
					while (teams[i].length < state.membersPerTeam && lastTeam.length > 0) {
						// 이동: 마지막 팀의 선두 멤버를 앞 팀으로 이동
						const member = lastTeam.shift();
						teams[i].push(member);
					}
					// 모든 앞팀이 채워졌으면 중단
					if (lastTeam.length === 0) break;
				}
				// 반영: teams[lastIdx]는 이미 레퍼런스로 수정됨
			}
		}
		
		// 결과 반환 전 셔플: 팀 순서 + 각 팀 내 블럭 순서
		// 1. 최대인원 모드인 경우 마지막 팀(나머지 팀)을 분리
		let lastTeamForShuffle = null;
		let teamsToShuffle = teams;
		if (state.maxTeamSizeEnabled && teams.length > 1) {
			const lastIdx = teams.length - 1;
			// 마지막 팀이 나머지 팀인지 확인 (인원이 기준보다 적은 경우)
			if (teams[lastIdx].length < state.membersPerTeam) {
				lastTeamForShuffle = teams[lastIdx];
				teamsToShuffle = teams.slice(0, lastIdx);
			}
		}
		
		// 2. 팀 순서 셔플 (Fisher-Yates)
		for (let i = teamsToShuffle.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[teamsToShuffle[i], teamsToShuffle[j]] = [teamsToShuffle[j], teamsToShuffle[i]];
		}
		
		// 3. 각 팀 내에서 블럭 단위로 셔플 (개인은 그대로, 그룹만 셔플)
		const allTeamsIncludingLast = lastTeamForShuffle ? [...teamsToShuffle, lastTeamForShuffle] : teamsToShuffle;
		for (const team of allTeamsIncludingLast) {
			// 팀 멤버를 블럭 단위로 분해
			const blocks = [];
			const processed = new Set();
			
			for (const person of team) {
				if (processed.has(person.id)) continue;
				
				const gi = getPersonGroupIndex(person.id);
				if (gi === -1) {
					// 개인: 단일 블럭
					blocks.push([person]);
					processed.add(person.id);
				} else {
					// 그룹: 같은 그룹의 모든 멤버를 하나의 블럭으로
					const groupBlock = team.filter(p => {
						const pgi = getPersonGroupIndex(p.id);
						return pgi === gi;
					});
					groupBlock.forEach(p => processed.add(p.id));
					blocks.push(groupBlock);
				}
			}
			
			// 블럭 순서 셔플 (Fisher-Yates)
			for (let i = blocks.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[blocks[i], blocks[j]] = [blocks[j], blocks[i]];
			}
			
			// 팀 재구성
			team.length = 0;
			blocks.forEach(block => team.push(...block));
		}
		
		// 4. 완성된 팀 그룹들을 랜덤 위치에 끼워넣기
		if (completeTeamGroups.length > 0) {
			// 완성된 팀들을 person 객체 배열로 변환하고 내부 팀원 순서 셔플
			const completeTeams = completeTeamGroups.map(group => {
				const team = group.map(id => people.find(p => p.id === id)).filter(Boolean);
				// 팀원 순서 셔플 (Fisher-Yates)
				for (let i = team.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[team[i], team[j]] = [team[j], team[i]];
				}
				return team;
			});
			
			// 완성된 팀들을 랜덤하게 섞기
			for (let i = completeTeams.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[completeTeams[i], completeTeams[j]] = [completeTeams[j], completeTeams[i]];
			}
			
			// 최대인원 모드일 때는 마지막 팀을 제외하고 끼워넣기
			if (lastTeamForShuffle) {
				// 마지막 팀 제외한 배열에 끼워넣기
				completeTeams.forEach(completeTeam => {
					const insertPosition = Math.floor(Math.random() * (teamsToShuffle.length + 1));
					teamsToShuffle.splice(insertPosition, 0, completeTeam);
				});
				// 마지막 팀 다시 추가
				return [...teamsToShuffle, lastTeamForShuffle];
			} else {
				// 일반 모드: 모든 팀 사이에 랜덤하게 끼워넣기
				completeTeams.forEach(completeTeam => {
					const insertPosition = Math.floor(Math.random() * (allTeamsIncludingLast.length + 1));
					allTeamsIncludingLast.splice(insertPosition, 0, completeTeam);
				});
				return allTeamsIncludingLast;
			}
		}
		
		return allTeamsIncludingLast;
	}

	showError('제약 조건으로 팀 배치가 불가능합니다. 다시 시도해주세요.');
	return null;
}

async function displayTeams(teams) {
	// 컨테이너 축소로 인한 레이아웃 점프를 방지하기 위해 기존 높이를 유지
	const prevContainerHeight = elements.teamsDisplay.offsetHeight || 0;
	if (prevContainerHeight > 0) {
		elements.teamsDisplay.style.minHeight = prevContainerHeight + 'px';
	}
	// 팀 표시 시 FAQ 섹션 숨기기
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
		const canUseCapture = typeof html2canvas !== 'undefined' && navigator.clipboard && navigator.clipboard.write;
		elements.captureButtonContainer.style.display = canUseCapture ? 'block' : 'none';
	}
	
	// 2단계: 모든 팀에 돌아가면서 인원을 추가 (라운드 로빈)
	const maxMembers = Math.max(...teams.map(t => t.length));

	// 팀원 추가 애니메이션 동안 카드 높이 흔들림 방지를 위해
	// 각 팀 카드의 리스트 영역(ul)과 카드 전체에 maxMembers 기준의 min-height를 설정
	try {
		const uls = Array.from(elements.teamsDisplay.querySelectorAll('.team-card ul'));
		const cards = Array.from(elements.teamsDisplay.querySelectorAll('.team-card'));
		const headers = Array.from(elements.teamsDisplay.querySelectorAll('.team-card h3'));
		if (uls.length && cards.length && headers.length) {
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

			// 카드 전체 높이도 고정 (헤더 + 리스트 + 카드 패딩)
			const headerH = headers[0].offsetHeight || 32;
			const cardCS = window.getComputedStyle(cards[0]);
			const padT = parseFloat(cardCS.paddingTop) || 0;
			const padB = parseFloat(cardCS.paddingBottom) || 0;
			const minCardHeight = headerH + minListHeight + padT + padB;
			cards.forEach(card => { card.style.minHeight = minCardHeight + 'px'; });
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

			// 최종 렌더 완료 후 컨테이너 min-height 해제
			try { elements.teamsDisplay.style.minHeight = ''; } catch (_) { /* no-op */ }
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
	let totalDelays = Math.max(0, teamChunks.reduce((sum, chunks) => sum + chunks.length, 0) - 1);
	
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
					const li = createResultListItem(person);
					list.appendChild(li);
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
				const li = createResultListItem(person);
				list.appendChild(li);
				teamCardData.currentCount += 1;
				if (state.weightBalanceEnabled) addedWeight += person.weight || 0;
			}
			if (chunk.length) pulseTeamCard(teamCardData.card);
			if (state.weightBalanceEnabled) {
				teamCardData.currentWeight += addedWeight;
				// 0명이 아니면 인원 수 표시
				title.textContent = `팀 ${pick + 1} (${teamCardData.currentCount}명/${teamCardData.currentWeight})`;
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

// teamsDisplay의 높이를 계산·저장하여 레이아웃 공간을 유지 (사용 중)


// 멤버가 추가될 때 팀 카드 테두리를 잠깐 펄스 애니메이션
function pulseTeamCard(card) {
	if (!card) return;
	const base = getTeamAnimDurationMs();
	const dur = base * 1.7; // CSS 펄스 지속시간 배수와 일치시킴
	if (card._pulseTimer) {
		clearTimeout(card._pulseTimer);
		card._pulseTimer = null;
	}
	card.classList.remove('team-card-pulse');
	// 애니메이션 재시작을 위해 강제 리플로우
	void card.offsetWidth;
	card.classList.add('team-card-pulse');
	card._pulseTimer = setTimeout(() => {
		card.classList.remove('team-card-pulse');
		card._pulseTimer = null;
	}, dur + 50);
}

// 팀 결과 표시 시 재사용하는 결과 리스트 항목 생성(중복 코드 방지)
function createResultListItem(person) {
	const li = document.createElement('li');
	let displayText = person.name;
	if (state.weightBalanceEnabled) displayText += ` (${person.weight ?? 0})`;
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
	li.addEventListener('animationend', () => li.classList.remove('jelly-in'), { once: true });
	return li;
}

// 검증 루프 시작
async function startValidationLoop(initialTeams) {
	let currentTeams = initialTeams.map(team => [...team]);
	const maxIterations = 20; // 무한루프 방지
	let iteration = 0;
	
	while (iteration < maxIterations) {
		iteration++;
		let hasChanges = false;
		
		// 1. 팀 인원 균형 검증 (최대인원 모드가 아닐 때만) - 가장 먼저 실행
		if (!state.maxTeamSizeEnabled) {
			const beforeTeamSize = currentTeams.map(team => [...team]);
			currentTeams = validateAndFixTeamSizeBalance(currentTeams);
			
			const sizeChanged = JSON.stringify(beforeTeamSize) !== JSON.stringify(currentTeams);
			if (sizeChanged) {
				hasChanges = true;
				if (SHOW_VALIDATION_COMPARISON) {
					await showValidationStep(beforeTeamSize, currentTeams, '팀 인원 균형');
					// 다음 검증을 위해 잠시 대기
					await new Promise(resolve => setTimeout(resolve, 500));
				}
			}
		}
		
		// 2. 성비 블록 균형 검증
		if (state.genderBalanceEnabled) {
			const beforeGender = currentTeams.map(team => [...team]);
			currentTeams = validateAndFixGenderBlockBalance(currentTeams);
			
			const genderChanged = JSON.stringify(beforeGender) !== JSON.stringify(currentTeams);
			if (genderChanged) {
				hasChanges = true;
				if (SHOW_VALIDATION_COMPARISON) {
					await showValidationStep(beforeGender, currentTeams, '성비 블록 균형');
					// 다음 검증을 위해 잠시 대기
					await new Promise(resolve => setTimeout(resolve, 500));
				}
			}
		}
		
		// 3. 가중치 균형 검증
		if (state.weightBalanceEnabled) {
			const beforeWeight = currentTeams.map(team => [...team]);
			currentTeams = validateAndFixWeightBalance(currentTeams);
			
			const weightChanged = JSON.stringify(beforeWeight) !== JSON.stringify(currentTeams);
			if (weightChanged) {
				hasChanges = true;
				if (SHOW_VALIDATION_COMPARISON) {
					await showValidationStep(beforeWeight, currentTeams, '가중치 균형');
					// 다음 검증을 위해 잠시 대기
					await new Promise(resolve => setTimeout(resolve, 500));
				}
			}
		}
		
		// 변경사항이 없으면 검증 완료
		if (!hasChanges) {
			break;
		}
	}
	
	// 최종 검증 완료
	isValidated = true;
	// 최종 팀으로 업데이트
	window.currentTeams = currentTeams;
	
	// 최종 검증된 팀을 결과창에 표시
	await displayTeams(currentTeams);
}

// 검증 단계 비교 화면 표시
async function showValidationStep(beforeTeams, afterTeams, validationType) {
	return new Promise((resolve) => {
		// 비교 컨테이너 생성
		const comparisonContainer = document.createElement('div');
		comparisonContainer.id = 'comparisonContainer';
		comparisonContainer.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background: rgba(0, 0, 0, 0.95);
			z-index: 10000;
			display: flex;
			flex-direction: column;
			padding: 40px;
			overflow-y: auto;
		`;
		
		// 헤더
		const header = document.createElement('div');
		header.style.cssText = `
			text-align: center;
			color: white;
			margin-bottom: 30px;
		`;
		
		header.innerHTML = `
			<h2 style="font-size: 32px; margin-bottom: 10px;">검증 단계</h2>
			<p style="font-size: 16px; opacity: 0.8;">${validationType} 조정</p>
		`;
		comparisonContainer.appendChild(header);
		
		// 비교 영역
		const comparisonWrapper = document.createElement('div');
		comparisonWrapper.style.cssText = `
			display: grid;
			grid-template-columns: 1fr auto 1fr;
			gap: 40px;
			max-width: 1400px;
			margin: 0 auto;
			width: 100%;
		`;
		
		// 색상 맵 미리 생성 (전/후 화면에서 공유)
		const colorMap = createColorMapForComparison(beforeTeams, afterTeams);
		
		// 전 (Before)
		const beforeSection = document.createElement('div');
		beforeSection.innerHTML = '<h3 style="color: #ef4444; text-align: center; margin-bottom: 20px; font-size: 24px;">조정 전</h3>';
		const beforeDisplay = createComparisonTeamsDisplay(beforeTeams, afterTeams, colorMap);
		beforeSection.appendChild(beforeDisplay);
		
		// 화살표
		const arrow = document.createElement('div');
		arrow.style.cssText = `
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 48px;
			color: #22c55e;
		`;
		arrow.textContent = '→';
		
		// 후 (After)
		const afterSection = document.createElement('div');
		afterSection.innerHTML = '<h3 style="color: #22c55e; text-align: center; margin-bottom: 20px; font-size: 24px;">조정 후</h3>';
		const afterDisplay = createComparisonTeamsDisplay(afterTeams, beforeTeams, colorMap);
		afterSection.appendChild(afterDisplay);
		
		comparisonWrapper.appendChild(beforeSection);
		comparisonWrapper.appendChild(arrow);
		comparisonWrapper.appendChild(afterSection);
		comparisonContainer.appendChild(comparisonWrapper);
		
		// 닫기 버튼
		const closeBtn = document.createElement('button');
		closeBtn.textContent = '다음';
		closeBtn.style.cssText = `
			margin: 30px auto 0;
			padding: 15px 40px;
			background: #3b82f6;
			color: white;
			border: none;
			border-radius: 8px;
			font-size: 18px;
			font-weight: 600;
			cursor: pointer;
			transition: background 0.2s;
		`;
		closeBtn.onmouseover = () => closeBtn.style.background = '#2563eb';
		closeBtn.onmouseout = () => closeBtn.style.background = '#3b82f6';
		
		const closeComparison = () => {
			comparisonContainer.remove();
			resolve();
		};
		
		closeBtn.onclick = closeComparison;
		comparisonContainer.appendChild(closeBtn);
		
		document.body.appendChild(comparisonContainer);
	});
}

// 스페이스바 안내 메시지 표시
function showValidationHint() {
	if (!state.genderBalanceEnabled) return;
	
	const hint = document.createElement('div');
	hint.id = 'validationHint';
	hint.style.cssText = `
		position: fixed;
		bottom: 30px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(59, 130, 246, 0.95);
		color: white;
		padding: 12px 24px;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		z-index: 10000;
		animation: fadeInUp 0.3s ease-out;
	`;
	hint.textContent = '스페이스바를 눌러 성비 블록 균형을 검증하세요';
	
	document.body.appendChild(hint);
	
	// 5초 후 자동 제거
	setTimeout(() => {
		if (hint.parentNode) {
			hint.style.animation = 'fadeOut 0.3s ease-out';
			setTimeout(() => hint.remove(), 300);
		}
	}, 5000);
}

// 검증 및 재표시
async function validateAndRedisplayTeams() {
	if (!currentTeams || isValidated) return;
	
	// 검증 로직 실행
	const validatedTeams = validateAndFixGenderBlockBalance(currentTeams);
	
	// 검증된 팀으로 업데이트
	currentTeams = validatedTeams;
	isValidated = true;
	
	// 검증된 팀으로 바로 표시
	await displayTeams(validatedTeams);
}

// 변경사항 없음 메시지 (자동 검증 시에는 표시하지 않음)
function showNoChangesMessage() {
	// 자동 검증이므로 메시지 표시 없이 그냥 리턴
	isValidated = true;
}

// 전/후 비교 화면 표시
async function showBeforeAfterComparison(beforeTeams, afterTeams) {
	// 비교 컨테이너 생성
	const comparisonContainer = document.createElement('div');
	comparisonContainer.id = 'comparisonContainer';
	comparisonContainer.style.cssText = `
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.95);
		z-index: 10000;
		display: flex;
		flex-direction: column;
		padding: 40px;
		overflow-y: auto;
	`;
	
	// 헤더
	const header = document.createElement('div');
	header.style.cssText = `
		text-align: center;
		color: white;
		margin-bottom: 30px;
	`;
	
	const titleParts = [];
	if (state.weightBalanceEnabled) titleParts.push('가중치 균형');
	
	header.innerHTML = `
		<h2 style="font-size: 32px; margin-bottom: 10px;">검증 결과</h2>
		<p style="font-size: 16px; opacity: 0.8;">${titleParts.length ? titleParts.join(' 및 ') + '이 조정되었습니다' : '팀이 조정되었습니다'}</p>
	`;
	comparisonContainer.appendChild(header);
	
	// 비교 영역
	const comparisonWrapper = document.createElement('div');
	comparisonWrapper.style.cssText = `
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 40px;
		max-width: 1400px;
		margin: 0 auto;
		width: 100%;
	`;
	
	// 색상 맵 미리 생성 (전/후 화면에서 공유)
	const colorMap = createColorMapForComparison(beforeTeams, afterTeams);
	
	// 전 (Before)
	const beforeSection = document.createElement('div');
	beforeSection.innerHTML = '<h3 style="color: #ef4444; text-align: center; margin-bottom: 20px; font-size: 24px;">검증 전</h3>';
	const beforeDisplay = createComparisonTeamsDisplay(beforeTeams, afterTeams, colorMap);
	beforeSection.appendChild(beforeDisplay);
	
	// 화살표
	const arrow = document.createElement('div');
	arrow.style.cssText = `
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 48px;
		color: #22c55e;
	`;
	arrow.textContent = '→';
	
	// 후 (After)
	const afterSection = document.createElement('div');
	afterSection.innerHTML = '<h3 style="color: #22c55e; text-align: center; margin-bottom: 20px; font-size: 24px;">검증 후</h3>';
	const afterDisplay = createComparisonTeamsDisplay(afterTeams, beforeTeams, colorMap);
	afterSection.appendChild(afterDisplay);
	
	comparisonWrapper.appendChild(beforeSection);
	comparisonWrapper.appendChild(arrow);
	comparisonWrapper.appendChild(afterSection);
	comparisonContainer.appendChild(comparisonWrapper);
	
	// 닫기 버튼
	const closeBtn = document.createElement('button');
	closeBtn.textContent = '확인';
	closeBtn.style.cssText = `
		margin: 30px auto 0;
		padding: 15px 40px;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 18px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	`;
	closeBtn.onmouseover = () => closeBtn.style.background = '#2563eb';
	closeBtn.onmouseout = () => closeBtn.style.background = '#3b82f6';
	
	const closeComparison = () => {
		comparisonContainer.remove();
		// 검증된 팀으로 재표시
		displayTeams(afterTeams);
	};
	
	closeBtn.onclick = closeComparison;
	comparisonContainer.appendChild(closeBtn);
	
	document.body.appendChild(comparisonContainer);
}

// 색상 맵 생성 함수 (전/후 화면에서 공유)
function createColorMapForComparison(beforeTeams, afterTeams) {
	const changedMemberColors = new Map();
	
	const beforeMembers = beforeTeams.map(team => new Set(team.map(p => p.id)));
	const afterMembers = afterTeams.map(team => new Set(team.map(p => p.id)));
	
	// 변경된 모든 멤버 수집 (ID 순으로 정렬하여 일관성 유지)
	const changedMembersSet = new Set();
	
	afterTeams.forEach((team, teamIdx) => {
		team.forEach(person => {
			if (!beforeMembers[teamIdx].has(person.id)) {
				changedMembersSet.add(person.id);
			}
		});
	});
	
	// ID로 정렬하여 일관된 색상 할당
	const changedMembers = Array.from(changedMembersSet).sort((a, b) => a - b);
	
	// 각 변경된 멤버에게 groupColors에서 색상 할당 (파스텔 톤으로 투명도 추가)
	changedMembers.forEach((personId, index) => {
		const colorIndex = index % state.groupColors.length;
		const baseColor = state.groupColors[colorIndex];
		// 핵사코드에 투명도 추가 (40 = 약 25% 불투명도로 파스텔 톤)
		const pastelColor = baseColor + '40';
		changedMemberColors.set(personId, pastelColor);
	});
	
	return changedMemberColors;
}

// 비교용 팀 표시 생성
function createComparisonTeamsDisplay(teams, compareTeams = null, changedMemberColors = null) {
	const container = document.createElement('div');
	container.style.cssText = `
		display: flex;
		flex-direction: column;
		gap: 15px;
	`;
	
	// 비교를 위한 팀 멤버 맵 생성
	let compareTeamMembers = null;
	if (compareTeams) {
		compareTeamMembers = compareTeams.map(team => 
			new Set(team.map(p => p.id))
		);
	}
	
	teams.forEach((team, index) => {
		const teamCard = document.createElement('div');
		teamCard.style.cssText = `
			background: white;
			border-radius: 12px;
			padding: 20px;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		`;
		
		// 팀 헤더
		const teamHeader = document.createElement('h4');
		teamHeader.style.cssText = `
			margin: 0 0 15px 0;
			font-size: 20px;
			color: #1e293b;
		`;
		
		let headerText = `팀 ${index + 1} (${team.length}명`;
		if (state.weightBalanceEnabled) {
			const totalWeight = team.reduce((sum, p) => sum + (p.weight || 0), 0);
			headerText += `/${totalWeight}`;
		}
		headerText += ')';
		
		teamHeader.textContent = headerText;
		teamCard.appendChild(teamHeader);
		
		// 멤버 리스트
		const membersList = document.createElement('ul');
		membersList.style.cssText = `
			list-style: none;
			padding: 0;
			margin: 0;
			display: flex;
			flex-direction: column;
			gap: 8px;
		`;
		
		team.forEach(person => {
			const li = document.createElement('li');
			
			// 비교 대상이 있을 때 변경된 멤버 확인
			let isChanged = false;
			let highlightColor = null;
			if (compareTeamMembers) {
				// 현재 팀에 있지만 같은 위치의 비교 팀에 없으면 변경된 것
				const compareTeamSet = compareTeamMembers[index];
				if (compareTeamSet && !compareTeamSet.has(person.id)) {
					isChanged = true;
					highlightColor = changedMemberColors.get(person.id);
				}
			}
			
			li.style.cssText = `
				padding: 8px 12px;
				background: ${isChanged && highlightColor ? highlightColor : '#f8fafc'};
				border-radius: 6px;
				font-size: 14px;
				${isChanged ? 'font-weight: 600;' : ''}
			`;
			
			let displayText = person.name;
			if (state.weightBalanceEnabled) displayText += ` (${person.weight ?? 0})`;
			
			if (state.genderBalanceEnabled) {
				const genderColor = person.gender === 'male' ? '#3b82f6' : '#ec4899';
				li.style.borderLeft = `4px solid ${genderColor}`;
			}
			
			const groupIndex = getPersonGroupIndex(person.id);
			if (groupIndex !== -1) {
				displayText = '● ' + displayText;
			}
			
			li.textContent = displayText;
			membersList.appendChild(li);
		});
		
		teamCard.appendChild(membersList);
		container.appendChild(teamCard);
	});
	
	return container;
}

// 성별 블록 균형 검증 및 수정
function validateAndFixGenderBlockBalance(teams) {
	if (!state.genderBalanceEnabled) return teams;
	
	// 소수 성별 파악
	const allPeople = teams.flat();
	const maleCount = allPeople.filter(p => p.gender === 'male').length;
	const femaleCount = allPeople.filter(p => p.gender === 'female').length;
	
	if (maleCount === femaleCount || maleCount === 0 || femaleCount === 0) {
		return teams; // 성비가 동일하거나 한쪽만 있으면 검증 불필요
	}
	
	const minorityGender = femaleCount < maleCount ? 'female' : 'male';
	
	// 최대 10번 반복 (무한루프 방지)
	let iterations = 0;
	const maxIterations = 10;
	let modified = true;
	
	while (modified && iterations < maxIterations) {
		modified = false;
		iterations++;
		
		// 각 팀의 소수성별 블록 수 계산
		const teamBlockCounts = teams.map((team, idx) => ({
			teamIdx: idx,
			blocks: getTeamGenderBlockInfo(team, minorityGender).totalBlocks
		}));
		
		// 최대/최소 블록 팀 찾기
		const maxBlockTeam = teamBlockCounts.reduce((max, curr) => 
			curr.blocks > max.blocks ? curr : max
		);
		const minBlockTeam = teamBlockCounts.reduce((min, curr) => 
			curr.blocks < min.blocks ? curr : min
		);
		
		// 차이가 2 이상이면 교체
		if (maxBlockTeam.blocks - minBlockTeam.blocks >= 2) {
			const swapResult = swapToBalanceBlocks(
				teams,
				maxBlockTeam.teamIdx,
				minBlockTeam.teamIdx,
				minorityGender
			);
			
			if (swapResult) {
				modified = true;
			}
		}
	}
	
	return teams;
}

// 가중치 균형 검증 및 수정
function validateAndFixWeightBalance(teams) {
	if (!state.weightBalanceEnabled) return teams;
	
	// 최대 10번 반복 (무한루프 방지)
	let iterations = 0;
	const maxIterations = 10;
	let modified = true;
	
	while (modified && iterations < maxIterations) {
		modified = false;
		iterations++;
		
		// 각 팀의 총 가중치 계산
		const teamWeights = teams.map((team, idx) => ({
			teamIdx: idx,
			totalWeight: team.reduce((sum, p) => sum + (p.weight || 0), 0),
			team: team
		}));
		
		// 가중치 기준 정렬
		teamWeights.sort((a, b) => a.totalWeight - b.totalWeight);
		
		// 가장 낮은 팀과 가장 높은 팀
		const minWeightTeam = teamWeights[0];
		const maxWeightTeam = teamWeights[teamWeights.length - 1];
		
		// 가장 낮은 팀의 최고 점수 팀원
		const minTeamMaxPerson = minWeightTeam.team.reduce((max, p) => 
			(p.weight || 0) > (max.weight || 0) ? p : max
		);
		
		// 가장 높은 팀의 최저 점수 팀원
		const maxTeamMinPerson = maxWeightTeam.team.reduce((min, p) => 
			(p.weight || 0) < (min.weight || 0) ? p : min
		);
		
		// 조건 확인: 낮은 팀의 최고 점수 <= 높은 팀의 최저 점수
		if ((minTeamMaxPerson.weight || 0) <= (maxTeamMinPerson.weight || 0)) {
			// 교체 로직 실행
			const swapResult = swapToBalanceWeight(
				teams,
				teamWeights,
				minWeightTeam.teamIdx,
				maxWeightTeam.teamIdx
			);
			
			if (swapResult) {
				modified = true;
			} else {
				// 첫 번째 교체 실패 시, 두 번째로 높은 팀과 시도
				if (teamWeights.length > 2) {
					const secondMaxWeightTeam = teamWeights[teamWeights.length - 2];
					const swapResult2 = swapToBalanceWeight(
						teams,
						teamWeights,
						minWeightTeam.teamIdx,
						secondMaxWeightTeam.teamIdx
					);
					if (swapResult2) modified = true;
				}
			}
		}
	}
	
	return teams;
}

// 가중치 균형을 위한 팀원 교체
function swapToBalanceWeight(teams, teamWeights, minTeamIdx, maxTeamIdx) {
	const minTeam = teams[minTeamIdx];
	const maxTeam = teams[maxTeamIdx];
	
	// 전체 팀 중 최대 소수성별 블록 수 계산
	let maxMinorityBlocks = 0;
	let minorityGender = null;
	
	if (state.genderBalanceEnabled) {
		const allPeople = teams.flat();
		const maleCount = allPeople.filter(p => p.gender === 'male').length;
		const femaleCount = allPeople.filter(p => p.gender === 'female').length;
		
		if (maleCount !== femaleCount && maleCount !== 0 && femaleCount !== 0) {
			minorityGender = femaleCount < maleCount ? 'female' : 'male';
			
			// 모든 팀의 소수성별 블록 수 계산
			teams.forEach(team => {
				const blockInfo = getTeamGenderBlockInfo(team, minorityGender);
				if (blockInfo.totalBlocks > maxMinorityBlocks) {
					maxMinorityBlocks = blockInfo.totalBlocks;
				}
			});
		}
	}
	
	// 1. 낮은 팀의 최고 점수 팀원 찾기 (그룹이 아닌 개인만)
	const minTeamIndividuals = minTeam.filter(person => {
		const groupIndex = getPersonGroupIndex(person.id);
		return groupIndex === -1;
	});
	
	if (minTeamIndividuals.length === 0) {
		return false; // 교체할 개인이 없음
	}
	
	// 최고 점수 팀원
	const minTeamMaxPerson = minTeamIndividuals.reduce((max, p) => 
		(p.weight || 0) > (max.weight || 0) ? p : max
	);
	
	// 2. 높은 팀에서 최고 가중치 팀원 찾기 (그룹이 아닌 개인만)
	const maxTeamIndividuals = maxTeam.filter(person => {
		const groupIndex = getPersonGroupIndex(person.id);
		return groupIndex === -1;
	});
	
	if (maxTeamIndividuals.length === 0) {
		return false; // 교체할 개인이 없음
	}
	
	// 후보들을 가중치 높은 순으로 정렬
	const candidates = maxTeamIndividuals.sort((a, b) => (b.weight || 0) - (a.weight || 0));
	
	// 각 후보에 대해 교체 가능성 검사
	for (const maxTeamTargetPerson of candidates) {
		// 제약 확인
		if (isForbidden(minTeamMaxPerson.id, maxTeamTargetPerson.id)) {
			continue;
		}
		
		// 점수가 동일한지 확인
		if ((minTeamMaxPerson.weight || 0) === (maxTeamTargetPerson.weight || 0)) {
			continue; // 동일하면 교체 불필요
		}
		
		// 성비 균등이 활성화된 경우, 교체 후 블록 수 검증
		if (minorityGender && state.genderBalanceEnabled) {
			// 교체 후 시뮬레이션
			const minTeamAfter = minTeam.map(p => 
				p.id === minTeamMaxPerson.id ? maxTeamTargetPerson : p
			);
			const maxTeamAfter = maxTeam.map(p => 
				p.id === maxTeamTargetPerson.id ? minTeamMaxPerson : p
			);
			
			// 교체 후 양 팀의 소수성별 블록 수 계산
			const minTeamBlocksAfter = getTeamGenderBlockInfo(minTeamAfter, minorityGender).totalBlocks;
			const maxTeamBlocksAfter = getTeamGenderBlockInfo(maxTeamAfter, minorityGender).totalBlocks;
			
			// 양 팀 모두 최대 블록 수를 넘지 않으면 교체 가능
			if (minTeamBlocksAfter > maxMinorityBlocks || maxTeamBlocksAfter > maxMinorityBlocks) {
				continue; // 블록 수가 초과되면 다음 후보로
			}
		}
		
		// 교체 실행
		const minPersonIdx = minTeam.indexOf(minTeamMaxPerson);
		const maxPersonIdx = maxTeam.indexOf(maxTeamTargetPerson);
		
		if (minPersonIdx !== -1 && maxPersonIdx !== -1) {
			// 배열에서 교체
			[teams[minTeamIdx][minPersonIdx], teams[maxTeamIdx][maxPersonIdx]] = 
			[teams[maxTeamIdx][maxPersonIdx], teams[minTeamIdx][minPersonIdx]];
			
			return true;
		}
	}
	
	return false;
}

// 팀 인원 균형 검증 및 수정 (최대인원 모드가 아닐 때)
function validateAndFixTeamSizeBalance(teams) {
	if (state.maxTeamSizeEnabled) return teams;
	
	// 최대 10번 반복 (무한루프 방지)
	let iterations = 0;
	const maxIterations = 10;
	let modified = true;
	
	while (modified && iterations < maxIterations) {
		modified = false;
		iterations++;
		
		// 각 팀의 인원 수 계산
		const teamSizes = teams.map((team, idx) => ({
			teamIdx: idx,
			size: team.length
		}));
		
		// 최대/최소 인원 팀 찾기
		const maxSizeTeam = teamSizes.reduce((max, curr) => 
			curr.size > max.size ? curr : max
		);
		const minSizeTeam = teamSizes.reduce((min, curr) => 
			curr.size < min.size ? curr : min
		);
		
		// 차이가 2명 이상이면 조정
		if (maxSizeTeam.size - minSizeTeam.size >= 2) {
			// 받는 팀이 이미 최고 가중치 팀인지 확인
			let isMinTeamMaxWeight = false;
			if (state.weightBalanceEnabled) {
				const allWeights = teams.map(team => 
					team.reduce((sum, p) => sum + (p.weight || 0), 0)
				);
				const maxWeight = Math.max(...allWeights);
				const minTeamWeight = teams[minSizeTeam.teamIdx].reduce((sum, p) => sum + (p.weight || 0), 0);
				isMinTeamMaxWeight = (minTeamWeight === maxWeight);
			}
			
			let bestCandidate = null;
			let bestSourceTeamIdx = -1;
			
			if (isMinTeamMaxWeight) {
				// 받는 팀이 이미 최고 가중치 팀 -> 가장 점수가 낮은 개인을 찾되, 성비 블록만 체크
				let lowestWeight = Infinity;
				
				for (let sourceTeamIdx = 0; sourceTeamIdx < teams.length; sourceTeamIdx++) {
					const sourceTeam = teams[sourceTeamIdx];
					
					// 최소 인원 팀이거나 인원이 2명 이하면 스킵
					if (sourceTeamIdx === minSizeTeam.teamIdx || sourceTeam.length <= 2) {
						continue;
					}
					
					// 이 팀의 개인 멤버들 (그룹이 아닌)
					const individuals = sourceTeam.filter(person => {
						const groupIndex = getPersonGroupIndex(person.id);
						return groupIndex === -1;
					});
					
					// 각 후보에 대해 검증
					for (const candidate of individuals) {
						const candidateWeight = candidate.weight || 0;
						
						// 제약 확인
						let hasConstraint = false;
						for (const teamMember of teams[minSizeTeam.teamIdx]) {
							if (isForbidden(candidate.id, teamMember.id)) {
								hasConstraint = true;
								break;
							}
						}
						if (hasConstraint) continue;
						
						// 성비 블록만 체크
						if (canMoveMemberToTeamGenderOnly(teams, candidate, sourceTeamIdx, minSizeTeam.teamIdx)) {
							if (candidateWeight < lowestWeight) {
								lowestWeight = candidateWeight;
								bestCandidate = candidate;
								bestSourceTeamIdx = sourceTeamIdx;
							}
						}
					}
				}
			} else {
				// 받는 팀이 최고 가중치 팀이 아님 -> 기존 로직 (전체 조건 체크)
				for (let sourceTeamIdx = 0; sourceTeamIdx < teams.length; sourceTeamIdx++) {
					const sourceTeam = teams[sourceTeamIdx];
					
					// 최소 인원 팀이거나 인원이 2명 이하면 스킵
					if (sourceTeamIdx === minSizeTeam.teamIdx || sourceTeam.length <= 2) {
						continue;
					}
					
					// 이 팀의 개인 멤버들 (그룹이 아닌)
					const individuals = sourceTeam.filter(person => {
						const groupIndex = getPersonGroupIndex(person.id);
						return groupIndex === -1;
					});
					
					// 각 후보에 대해 검증
					for (const candidate of individuals) {
						if (canMoveMemberToTeam(teams, candidate, sourceTeamIdx, minSizeTeam.teamIdx)) {
							bestCandidate = candidate;
							bestSourceTeamIdx = sourceTeamIdx;
							break;
						}
					}
					
					if (bestCandidate) break;
				}
			}
			
			// 적합한 후보를 찾았으면 이동
			if (bestCandidate && bestSourceTeamIdx !== -1) {
				const candidateIdx = teams[bestSourceTeamIdx].indexOf(bestCandidate);
				if (candidateIdx !== -1) {
					// 멤버를 다른 팀으로 이동
					const member = teams[bestSourceTeamIdx].splice(candidateIdx, 1)[0];
					teams[minSizeTeam.teamIdx].push(member);
					modified = true;
				}
			}
		}
	}
	
	return teams;
}

// 멤버를 다른 팀으로 이동 가능한지 검증 (성비만)
function canMoveMemberToTeamGenderOnly(teams, member, fromTeamIdx, toTeamIdx) {
	const toTeam = teams[toTeamIdx];
	
	// 성비 균형 확인만
	if (state.genderBalanceEnabled) {
		const allPeople = teams.flat();
		const maleCount = allPeople.filter(p => p.gender === 'male').length;
		const femaleCount = allPeople.filter(p => p.gender === 'female').length;
		
		if (maleCount !== femaleCount && maleCount !== 0 && femaleCount !== 0) {
			const minorityGender = femaleCount < maleCount ? 'female' : 'male';
			
			// 이동 후 시뮬레이션
			const simulatedToTeam = [...toTeam, member];
			
			// 이동 후 받는 팀의 블록 수
			const toTeamBlocksAfter = getTeamGenderBlockInfo(simulatedToTeam, minorityGender).totalBlocks;
			
			// 모든 팀의 현재 블록 수 계산
			const allBlockCounts = teams.map((team, idx) => {
				if (idx === toTeamIdx) {
					return toTeamBlocksAfter;
				}
				return getTeamGenderBlockInfo(team, minorityGender).totalBlocks;
			});
			
			const maxBlocks = Math.max(...allBlockCounts);
			const minBlocks = Math.min(...allBlockCounts);
			
			// 최대-최소 차이가 2 이상이면 안됨
			if (maxBlocks - minBlocks >= 2) {
				return false;
			}
		}
	}
	
	return true;
}

// 멤버를 다른 팀으로 이동 가능한지 검증
function canMoveMemberToTeam(teams, member, fromTeamIdx, toTeamIdx) {
	const toTeam = teams[toTeamIdx];
	
	// 1. 제약 조건 확인
	for (const teamMember of toTeam) {
		if (isForbidden(member.id, teamMember.id)) {
			return false;
		}
	}
	
	// 2. 성비 균형 확인
	if (state.genderBalanceEnabled) {
		const allPeople = teams.flat();
		const maleCount = allPeople.filter(p => p.gender === 'male').length;
		const femaleCount = allPeople.filter(p => p.gender === 'female').length;
		
		if (maleCount !== femaleCount && maleCount !== 0 && femaleCount !== 0) {
			const minorityGender = femaleCount < maleCount ? 'female' : 'male';
			
			// 이동 후 시뮬레이션
			const simulatedToTeam = [...toTeam, member];
			
			// 이동 후 받는 팀의 블록 수
			const toTeamBlocksAfter = getTeamGenderBlockInfo(simulatedToTeam, minorityGender).totalBlocks;
			
			// 모든 팀의 현재 블록 수 계산
			const allBlockCounts = teams.map((team, idx) => {
				if (idx === toTeamIdx) {
					return toTeamBlocksAfter;
				}
				return getTeamGenderBlockInfo(team, minorityGender).totalBlocks;
			});
			
			const maxBlocks = Math.max(...allBlockCounts);
			const minBlocks = Math.min(...allBlockCounts);
			
			// 최대-최소 차이가 2 이상이면 안됨
			if (maxBlocks - minBlocks >= 2) {
				return false;
			}
		}
	}
	
	// 3. 가중치 균형 확인
	if (state.weightBalanceEnabled) {
		// 이동 후 받는 팀의 총 가중치
		const toTeamWeightAfter = toTeam.reduce((sum, p) => sum + (p.weight || 0), 0) + (member.weight || 0);
		
		// 모든 팀의 가중치 계산 (이동 후 시뮬레이션)
		const allWeights = teams.map((team, idx) => {
			if (idx === toTeamIdx) {
				return toTeamWeightAfter;
			} else if (idx === fromTeamIdx) {
				// 출발 팀은 해당 멤버 제외
				return team.reduce((sum, p) => sum + (p.weight || 0), 0) - (member.weight || 0);
			}
			return team.reduce((sum, p) => sum + (p.weight || 0), 0);
		});
		
		const maxWeight = Math.max(...allWeights);
		
		// 받는 팀이 최고 가중치 팀이 되면 안됨
		if (toTeamWeightAfter >= maxWeight && toTeamIdx !== teams.findIndex(t => 
			t.reduce((sum, p) => sum + (p.weight || 0), 0) === maxWeight
		)) {
			return false;
		}
	}
	
	return true;
}

// 팀의 성별 블록 정보 계산
function getTeamGenderBlockInfo(team, targetGender = null) {
	// targetGender가 없으면 소수 성별 자동 파악
	if (!targetGender) {
		const maleCount = team.filter(p => p.gender === 'male').length;
		const femaleCount = team.filter(p => p.gender === 'female').length;
		if (maleCount === femaleCount) return { totalBlocks: 0, groupBlocks: 0, individualBlocks: 0 };
		targetGender = femaleCount < maleCount ? 'female' : 'male';
	}
	
	let groupBlocks = 0;
	let individualBlocks = 0;
	const processedGroups = new Set();
	
	team.forEach(person => {
		const groupIndex = getPersonGroupIndex(person.id);
		
		if (groupIndex !== -1) {
			// 그룹에 속한 경우
			if (!processedGroups.has(groupIndex)) {
				processedGroups.add(groupIndex);
				// 이 그룹에 targetGender가 있는지 확인
				const group = state.requiredGroups[groupIndex];
				const hasTargetGender = group.some(memberId => {
					const member = team.find(p => p.id === memberId);
					return member && member.gender === targetGender;
				});
				if (hasTargetGender) groupBlocks++;
			}
		} else {
			// 개인인 경우
			if (person.gender === targetGender) {
				individualBlocks++;
			}
		}
	});
	
	return {
		totalBlocks: groupBlocks + individualBlocks,
		groupBlocks,
		individualBlocks
	};
}

// 블록 균형을 위한 팀원 교체
function swapToBalanceBlocks(teams, maxTeamIdx, minTeamIdx, minorityGender) {
	const maxTeam = teams[maxTeamIdx];
	const minTeam = teams[minTeamIdx];
	
	// 1. 최대 블록 팀에서 소수성별 개인 찾기
	const maxTeamIndividuals = maxTeam.filter(person => {
		const groupIndex = getPersonGroupIndex(person.id);
		return groupIndex === -1 && person.gender === minorityGender;
	});
	
	if (maxTeamIndividuals.length === 0) {
		return false; // 교체할 개인이 없음
	}
	
	// 2. 최소 블록 팀에서 교체 대상 찾기
	let targetPerson = null;
	
	if (state.weightBalanceEnabled) {
		// 가중치가 가장 비슷한 사람 찾기
		let minWeightDiff = Infinity;
		
		maxTeamIndividuals.forEach(maxPerson => {
			minTeam.forEach(minPerson => {
				// 그룹이 아니고, 제약이 없는 경우만
				const groupIndex = getPersonGroupIndex(minPerson.id);
				if (groupIndex !== -1) return;
				if (isForbidden(maxPerson.id, minPerson.id)) return;
				
				const weightDiff = Math.abs((maxPerson.weight || 0) - (minPerson.weight || 0));
				if (weightDiff < minWeightDiff) {
					minWeightDiff = weightDiff;
					targetPerson = { from: maxPerson, to: minPerson };
				}
			});
		});
	} else {
		// 랜덤 선택
		const minTeamIndividuals = minTeam.filter(person => {
			const groupIndex = getPersonGroupIndex(person.id);
			return groupIndex === -1;
		});
		
		if (minTeamIndividuals.length > 0) {
			const maxPerson = maxTeamIndividuals[Math.floor(Math.random() * maxTeamIndividuals.length)];
			const minPerson = minTeamIndividuals[Math.floor(Math.random() * minTeamIndividuals.length)];
			
			// 제약 확인
			if (!isForbidden(maxPerson.id, minPerson.id)) {
				targetPerson = { from: maxPerson, to: minPerson };
			}
		}
	}
	
	if (!targetPerson) {
		return false; // 교체 가능한 쌍이 없음
	}
	
	// 3. 교체 실행
	const maxPersonIdx = maxTeam.indexOf(targetPerson.from);
	const minPersonIdx = minTeam.indexOf(targetPerson.to);
	
	if (maxPersonIdx !== -1 && minPersonIdx !== -1) {
		// 배열에서 교체
		[teams[maxTeamIdx][maxPersonIdx], teams[minTeamIdx][minPersonIdx]] = 
		[teams[minTeamIdx][minPersonIdx], teams[maxTeamIdx][maxPersonIdx]];
		
		return true;
	}
	
	return false;
}

// 전역 변수: 현재 표시된 팀과 검증 상태
let currentTeams = null;
let isValidated = false;

// 초기화 실행
init();

