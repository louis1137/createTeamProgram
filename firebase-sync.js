// ==================== 실시간 동기화 시스템 ====================

// Firebase 설정
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

let firebaseApp = null;
let database = null;
let currentProfileKey = null;
let currentProfileSource = 'profiles';
let currentUserCode = null;
let syncEnabled = false;
let authenticatedPassword = ''; // 인증된 비밀번호 저장

const GLOBAL_APP_PASSWORD_PATH = 'admin/password';
const LEGACY_GLOBAL_APP_PASSWORD_PATHS = [
	'settings/globalPassword',
	'profiles/__global_admin__/password',
	'profile/__global_admin__/password'
];
const DEFAULT_GLOBAL_APP_PASSWORD = 'admin1234';

function normalizeReservations(value) {
	const toRow = (item) => {
		if (Array.isArray(item)) {
			return item.map((name) => String(name ?? '').trim()).filter((name) => name.length > 0);
		}
		if (typeof item === 'string') {
			return item.split(',').map((name) => name.trim()).filter((name) => name.length > 0);
		}
		return [];
	};
	if (Array.isArray(value)) {
		return value.map(toRow).filter((row) => row.length > 0);
	}
	if (value && typeof value === 'object') {
		return Object.values(value).map(toRow).filter((row) => row.length > 0);
	}
	return [];
}

function setCurrentProfileSource(source) {
	if (source === 'users' || source === 'profile' || source === 'profiles') {
		currentProfileSource = source;
		return;
	}
	currentProfileSource = 'profiles';
}

function getCurrentProfileSource() {
	return currentProfileSource;
}

function getGlobalAppPassword() {
	if (!database) {
		return Promise.resolve(DEFAULT_GLOBAL_APP_PASSWORD);
	}
	return database.ref(GLOBAL_APP_PASSWORD_PATH).once('value')
		.then((snapshot) => {
			const value = snapshot.val();
			if (typeof value === 'string' && value.length > 0) {
				return value;
			}
			const readLegacyAt = (index) => {
				if (index >= LEGACY_GLOBAL_APP_PASSWORD_PATHS.length) {
					return Promise.resolve(DEFAULT_GLOBAL_APP_PASSWORD);
				}
				const path = LEGACY_GLOBAL_APP_PASSWORD_PATHS[index];
				return database.ref(path).once('value')
					.then((legacySnapshot) => {
						const legacyValue = legacySnapshot.val();
						if (typeof legacyValue === 'string' && legacyValue.length > 0) {
							return legacyValue;
						}
						return readLegacyAt(index + 1);
					})
					.catch(() => readLegacyAt(index + 1));
			};
			return readLegacyAt(0);
		})
		.catch(() => DEFAULT_GLOBAL_APP_PASSWORD);
}

function setGlobalAppPassword(newPassword) {
	if (!database) {
		return Promise.reject(new Error('Firebase not initialized'));
	}
	const nextPassword = String(newPassword ?? '');
	return database.ref(GLOBAL_APP_PASSWORD_PATH).set(nextPassword)
		.then(() => nextPassword);
}

function resolveProfileRecord(profileKey) {
	if (!database || !profileKey) {
		return Promise.resolve({ exists: false, source: 'profiles', data: null });
	}

	return Promise.all([
		database.ref(`profile/${profileKey}`).once('value'),
		database.ref(`profiles/${profileKey}`).once('value'),
		database.ref(`users/${profileKey}`).once('value')
	]).then(([legacyProfileSnapshot, profileSnapshot, userSnapshot]) => {
		const legacyProfileData = legacyProfileSnapshot.val();
		const profileData = profileSnapshot.val();
		const userData = userSnapshot.val();

		if (legacyProfileData !== null) {
			setCurrentProfileSource('profile');
			return { exists: true, source: 'profile', data: legacyProfileData };
		}

		if (profileData !== null) {
			setCurrentProfileSource('profiles');
			return { exists: true, source: 'profiles', data: profileData };
		}

		if (userData !== null) {
			setCurrentProfileSource('users');
			return { exists: true, source: 'users', data: userData };
		}

		setCurrentProfileSource('profiles');
		return { exists: false, source: 'profiles', data: null };
	});
}

// 6자리 영숫자 userCode 생성
function generateUserCode() {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	let code = '';
	for (let i = 0; i < 6; i++) {
		code += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return code;
}

// userCode 가져오기/생성 (localStorage key: userCode)
function getUserCode() {
	const storageKey = 'userCode';
	let userCode = localStorage.getItem(storageKey);
	
	// 이전 키 마이그레이션
	if (!userCode) {
		const legacyUserCode = localStorage.getItem('teamMakerUserCode');
		if (legacyUserCode) {
			userCode = legacyUserCode;
			localStorage.setItem(storageKey, userCode);
			localStorage.removeItem('teamMakerUserCode');
		}
	}
	
	if (!userCode) {
		userCode = generateUserCode();
		localStorage.setItem(storageKey, userCode);
	}
	
	return userCode;
}

// DB 저장용 타임스탬프 포맷: YYYY-MM-DD HH:mm:ss
function getCurrentDbTimestamp() {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const seconds = String(now.getSeconds()).padStart(2, '0');
	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// users/{userCode} 레코드 보장
function ensureUserRecord() {
	if (!database || !currentUserCode) return Promise.resolve(false);
	const userRef = database.ref(`users/${currentUserCode}`);
	const now = getCurrentDbTimestamp();
	
	return userRef.once('value')
		.then((snapshot) => {
			if (!snapshot.exists()) {
				return userRef.set({ createdAt: now, lastAccess: now });
			}
			return userRef.update({ lastAccess: now });
		})
		.catch((error) => {
			console.error('❌ user 레코드 저장 실패:', error);
		});
}

// URL 파라미터에서 key 읽기
function getProfileKeyFromURL() {
	const params = new URLSearchParams(window.location.search);
	return params.get('key');
}

// Firebase 초기화
function initFirebase() {
	try {
		// 이미 초기화되었는지 확인
		if (database) {
			if (!currentUserCode) currentUserCode = getUserCode();
			ensureUserRecord();
			return true;
		}
		
		if (typeof firebase !== 'undefined') {
			firebaseApp = firebase.initializeApp(firebaseConfig);
			database = firebase.database();
			const originalRef = database.ref.bind(database);
			database.ref = (path) => {
				if (typeof path !== 'string') return originalRef(path);
				if (currentProfileKey) {
					const profilePrefix = `profiles/${currentProfileKey}`;
					if (currentProfileSource === 'users') {
						if (path === profilePrefix) {
							return originalRef(`users/${currentProfileKey}`);
						}
						if (path.startsWith(`${profilePrefix}/`)) {
							return originalRef(`users/${currentProfileKey}/${path.slice(profilePrefix.length + 1)}`);
						}
					}
					if (currentProfileSource === 'profile') {
						if (path === profilePrefix) {
							return originalRef(`profile/${currentProfileKey}`);
						}
						if (path.startsWith(`${profilePrefix}/`)) {
							return originalRef(`profile/${currentProfileKey}/${path.slice(profilePrefix.length + 1)}`);
						}
					}
				}
				return originalRef(path);
			};
			console.log('✅ Firebase 초기화 완료');
			console.log('⚙️ 참가자 입력란에 \'cmd\' 또는 \'command\'를 입력하면 다양한 기능을 사용할 수 있습니다.');
			
			// URL에서 프로필 키 읽기
			currentProfileKey = getProfileKeyFromURL();
			setCurrentProfileSource('profiles');
			currentUserCode = getUserCode();
			ensureUserRecord();

			// user 파라미터는 노출하지 않음
			const url = new URL(window.location.href);
			if (url.searchParams.has('user')) {
				url.searchParams.delete('user');
				window.history.replaceState({}, '', url);
			}
			
			return true;
		} else {
			console.log('⚠️ Firebase 설정이 필요합니다. firebase-sync.js의 firebaseConfig를 설정하세요.');
			return false;
		}
	} catch (error) {
		console.error('❌ Firebase 초기화 실패:', error);
		return false;
	}
}

// 실시간 동기화 활성화 상태
let realtimeSyncActive = false;
let lastSyncTrigger = 0;
let syncListenerAttached = false; // 리스너 중복 등록 방지
let syncTriggerInitialized = false;
let lastSyncSignature = '';

function getSyncSignature(syncTrigger) {
	if (syncTrigger && typeof syncTrigger === 'object') {
		if (syncTrigger.tick) {
			return `tick:${syncTrigger.tick}`;
		}
		return JSON.stringify(syncTrigger);
	}
	return String(syncTrigger ?? '');
}

// 실시간 동기화 설정
function setupRealtimeSync() {
	if (!database || (!currentProfileKey && !currentUserCode)) return;
	
	// 이미 리스너가 등록되어 있으면 중복 등록 방지
	if (syncListenerAttached) return;
	
	// 실시간 동기화 시작 전에 현재 UI 초기화 (이미 로드된 데이터가 있으면 초기화하지 않음)
	if (!state.people || state.people.length === 0) {
		clearState();
	}
	
	realtimeSyncActive = true;
	syncListenerAttached = true;
	
	const triggerPaths = currentProfileKey
		? [
			`profiles/${currentProfileKey}/syncTrigger`,
			`users/${currentProfileKey}/syncTrigger`,
			`profile/${currentProfileKey}/syncTrigger`
		]
		: [`users/${currentUserCode}/syncTrigger`];

	const handleSyncTrigger = (syncTrigger) => {
		const signature = getSyncSignature(syncTrigger);
		const hasChanged = Boolean(syncTrigger) && signature !== lastSyncSignature;
		const hasTick = Boolean(syncTrigger && typeof syncTrigger === 'object' && syncTrigger.tick);
		if ((syncTriggerInitialized || hasTick) && syncTrigger && hasChanged) {
			const syncType = typeof syncTrigger === 'object' ? syncTrigger.type : 'all';
			if (typeof commandConsole !== 'undefined' && commandConsole.log) {
				commandConsole.log('🔄 동기화 중...');
			}
			loadDataByType(syncType)
				.then(() => {
					if (typeof commandConsole !== 'undefined' && commandConsole.log) {
						commandConsole.log('✅ 동기화가 완료되었습니다.');
					}
				})
				.catch((error) => {
					if (typeof commandConsole !== 'undefined' && commandConsole.error) {
						commandConsole.error(`동기화 실패: ${error.message}`);
					}
				});
		}
		lastSyncTrigger = syncTrigger;
		if (syncTrigger) {
			lastSyncSignature = signature;
		}
		syncTriggerInitialized = true;
	};

	// syncTrigger 감시 - 명시적으로 동기화 명령어를 실행했을 때만 감지
	triggerPaths.forEach((path) => {
		database.ref(path).on('value', (snapshot) => {
		const syncTrigger = snapshot.val();
			handleSyncTrigger(syncTrigger);
		});
	});
}

// 동기화 타입에 따라 선택적으로 데이터 로드
function loadDataByType(type) {
	if (!currentProfileKey && currentUserCode) {
		return database.ref(`users/${currentUserCode}`).once('value')
			.then((snapshot) => {
				const data = snapshot.val();
				if (data) {
					loadStateFromData(data);
				}
			});
	}

	switch(type) {
		case 'rule':
			// 규칙만 로드
			return Promise.all([
				database.ref(`profiles/${currentProfileKey}/hiddenGroups`).once('value'),
				database.ref(`profiles/${currentProfileKey}/hiddenGroupChains`).once('value'),
				database.ref(`profiles/${currentProfileKey}/pendingHiddenGroups`).once('value'),
				database.ref(`profiles/${currentProfileKey}/pendingHiddenGroupChains`).once('value'),
				database.ref(`profiles/${currentProfileKey}/probabilisticForbiddenPairs`).once('value')
			]).then(([hiddenGroupsSnap, hiddenGroupChainsSnap, pendingHiddenGroupsSnap, pendingHiddenGroupChainsSnap, probabilisticForbiddenPairsSnap]) => {
				state.hiddenGroups = hiddenGroupsSnap.val() || [];
				state.hiddenGroupChains = hiddenGroupChainsSnap.val() || [];
				state.pendingHiddenGroups = pendingHiddenGroupsSnap.val() || [];
				state.pendingHiddenGroupChains = pendingHiddenGroupChainsSnap.val() || [];
				state.probabilisticForbiddenPairs = probabilisticForbiddenPairsSnap.val() || [];
				state.activeProbabilisticForbiddenPairs = [];
			});
		
		case 'option':
			// 옵션만 로드
			return Promise.all([
				database.ref(`profiles/${currentProfileKey}/maxTeamSizeEnabled`).once('value'),
				database.ref(`profiles/${currentProfileKey}/genderBalanceEnabled`).once('value'),
				database.ref(`profiles/${currentProfileKey}/weightBalanceEnabled`).once('value'),
				database.ref(`profiles/${currentProfileKey}/membersPerTeam`).once('value')
			]).then(([maxTeamSizeSnap, genderBalanceSnap, weightBalanceSnap, membersPerTeamSnap]) => {
				state.maxTeamSizeEnabled = maxTeamSizeSnap.val() || false;
				state.genderBalanceEnabled = genderBalanceSnap.val() || false;
				state.weightBalanceEnabled = weightBalanceSnap.val() || false;
				state.membersPerTeam = membersPerTeamSnap.val() || 4;
				
				if (elements.maxTeamSizeCheckbox) elements.maxTeamSizeCheckbox.checked = state.maxTeamSizeEnabled;
				if (elements.genderBalanceCheckbox) elements.genderBalanceCheckbox.checked = state.genderBalanceEnabled;
				if (elements.weightBalanceCheckbox) elements.weightBalanceCheckbox.checked = state.weightBalanceEnabled;
				if (elements.teamSizeInput) elements.teamSizeInput.value = state.membersPerTeam;
				
				// 옵션 변경에 따라 참가자 UI 업데이트
				renderPeople();
			});
		
		case 'member':
			// 참가자만 로드
			return Promise.all([
				database.ref(`profiles/${currentProfileKey}/people`).once('value'),
				database.ref(`profiles/${currentProfileKey}/inactivePeople`).once('value'),
				database.ref(`profiles/${currentProfileKey}/nextId`).once('value')
			]).then(([peopleSnap, inactivePeopleSnap, nextIdSnap]) => {
				state.people = peopleSnap.val() || [];
				state.inactivePeople = inactivePeopleSnap.val() || [];
				state.nextId = nextIdSnap.val() || 1;
				
				buildForbiddenMap();
				renderPeople();
			});
		
		case 'people':
			// 미참가자만 로드
			return database.ref(`profiles/${currentProfileKey}/inactivePeople`).once('value')
				.then((snapshot) => {
					state.inactivePeople = snapshot.val() || [];
					renderPeople();
				});
		
		case 'constraint':
			// 제약만 로드
			return Promise.all([
				database.ref(`profiles/${currentProfileKey}/requiredGroups`).once('value'),
				database.ref(`profiles/${currentProfileKey}/forbiddenPairs`).once('value'),
				database.ref(`profiles/${currentProfileKey}/pendingConstraints`).once('value')
			]).then(([requiredGroupsSnap, forbiddenPairsSnap, pendingConstraintsSnap]) => {
				state.requiredGroups = requiredGroupsSnap.val() || [];
				state.forbiddenPairs = forbiddenPairsSnap.val() || [];
				state.pendingConstraints = pendingConstraintsSnap.val() || [];
				
				buildForbiddenMap();
				renderPeople();
			});
		
		case 'reservation':
		// 예약만 로드 (동기화 예약 명령어로 실행된 경우)
		const oldReservationCount = state.reservations ? state.reservations.length : 0;
		return database.ref(`profiles/${currentProfileKey}/reservations`).once('value')
			.then((snapshot) => {
				const newReservations = normalizeReservations(snapshot.val());
				const newCount = newReservations.length;
				
				// 예약 개수가 변경된 경우 알림 표시
				if (oldReservationCount !== newCount) {
					if (newCount > oldReservationCount) {
						const addedCount = newCount - oldReservationCount;
						// 인증이 되었을 경우에만 메시지 표시
						if (authenticatedPassword && typeof commandConsole !== 'undefined' && commandConsole.log) {
								commandConsole.log(`📢 예약 ${addedCount}개가 추가되었습니다.`);
						}
					}
				}
				
				state.reservations = newReservations;
				saveToLocalStorage();
			});
		
		case 'all':
		default:
			// 전체 데이터 로드
			return database.ref(`profiles/${currentProfileKey}`).once('value')
				.then((snapshot) => {
					const data = snapshot.val();
					if (data) {
						loadStateFromData(data);
					}
				});
	}
}

// 데이터에서 state 로드
function loadStateFromData(data) {
	state.people = data.people || [];
	state.inactivePeople = data.inactivePeople || [];
	state.requiredGroups = data.requiredGroups || [];
	state.nextId = data.nextId || 1;
	state.forbiddenPairs = data.forbiddenPairs || [];
	state.pendingConstraints = data.pendingConstraints || [];
	state.hiddenGroups = data.hiddenGroups || [];
	state.hiddenGroupChains = data.hiddenGroupChains || [];
	state.pendingHiddenGroups = data.pendingHiddenGroups || [];
	state.pendingHiddenGroupChains = data.pendingHiddenGroupChains || [];
	state.probabilisticForbiddenPairs = data.probabilisticForbiddenPairs || [];
	state.activeProbabilisticForbiddenPairs = [];
	state.reservations = normalizeReservations(data.reservations);
	state.maxTeamSizeEnabled = data.maxTeamSizeEnabled || false;
	state.genderBalanceEnabled = data.genderBalanceEnabled || false;
	state.weightBalanceEnabled = data.weightBalanceEnabled || false;
	state.membersPerTeam = data.membersPerTeam || 4;
	
	// UI 업데이트
	if (elements.maxTeamSizeCheckbox) elements.maxTeamSizeCheckbox.checked = state.maxTeamSizeEnabled;
	if (elements.genderBalanceCheckbox) elements.genderBalanceCheckbox.checked = state.genderBalanceEnabled;
	if (elements.weightBalanceCheckbox) elements.weightBalanceCheckbox.checked = state.weightBalanceEnabled;
	if (elements.teamSizeInput) elements.teamSizeInput.value = state.membersPerTeam;
	
	buildForbiddenMap();
	renderPeople();
}

// state를 완전 초기화
function clearState() {
	state.people = [];
	state.inactivePeople = [];
	state.requiredGroups = [];
	state.nextId = 1;
	state.forbiddenPairs = [];
	state.pendingConstraints = [];
	state.forbiddenMap = {};
	state.hiddenGroups = [];
	state.hiddenGroupChains = [];
	state.pendingHiddenGroups = [];
	state.pendingHiddenGroupChains = [];
	state.probabilisticForbiddenPairs = [];
	state.activeProbabilisticForbiddenPairs = [];
	state.reservations = [];
	state.activeHiddenGroupMap = {};
	state.activeHiddenGroupChainInfo = {};
	state.maxTeamSizeEnabled = false;
	state.genderBalanceEnabled = false;
	state.weightBalanceEnabled = false;
	state.membersPerTeam = 4;
	
	// UI 업데이트
	if (elements.maxTeamSizeCheckbox) elements.maxTeamSizeCheckbox.checked = false;
	if (elements.genderBalanceCheckbox) elements.genderBalanceCheckbox.checked = false;
	if (elements.weightBalanceCheckbox) elements.weightBalanceCheckbox.checked = false;
	if (elements.teamSizeInput) elements.teamSizeInput.value = 4;
	
	renderPeople();
}

// 페이지 로드 시 Firebase 초기화
initFirebase();
