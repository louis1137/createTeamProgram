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
let currentRoomKey = null;
let syncEnabled = false;
let authenticatedPassword = ''; // 인증된 비밀번호 저장

// URL 파라미터에서 key 읽기
function getRoomKeyFromURL() {
	const params = new URLSearchParams(window.location.search);
	return params.get('key');
}

// Firebase 초기화
function initFirebase() {
	try {
		// 이미 초기화되었는지 확인
		if (database) return true;
		
		if (typeof firebase !== 'undefined') {
			firebaseApp = firebase.initializeApp(firebaseConfig);
			database = firebase.database();
			console.log('✅ Firebase 초기화 완료');
			console.log('⚙️ 참가자 입력란에 \'cmd\' 또는 \'command\'를 입력하면 명령 콘솔이 열립니다.');
			
			// URL에서 프로필 키 읽기
			currentRoomKey = getRoomKeyFromURL();
			
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

// 실시간 동기화 설정
function setupRealtimeSync() {
	if (!database || !currentRoomKey) return;
	
	// 이미 리스너가 등록되어 있으면 중복 등록 방지
	if (syncListenerAttached) return;
	
	// 실시간 동기화 시작 전에 현재 UI 초기화 (이미 로드된 데이터가 있으면 초기화하지 않음)
	if (!state.people || state.people.length === 0) {
		clearState();
	}
	
	realtimeSyncActive = true;
	syncListenerAttached = true;
	
	// syncTrigger 감시 - 다른 창에서 동기화 명령어를 실행했을 때 감지
	database.ref(`rooms/${currentRoomKey}/syncTrigger`).on('value', (snapshot) => {
		const syncTrigger = snapshot.val();
		if (syncTrigger && syncTrigger !== lastSyncTrigger && lastSyncTrigger !== 0) {
			// 새로운 동기화 트리거 감지
			const syncType = typeof syncTrigger === 'object' ? syncTrigger.type : 'all';
			const syncTimestamp = typeof syncTrigger === 'object' ? syncTrigger.timestamp : syncTrigger;
			
			if (typeof commandConsole !== 'undefined' && commandConsole.log) {
				commandConsole.log('🔄 동기화 중...');
			}
			
			// 동기화 타입에 따라 선택적으로 데이터 로드
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
	});
}

// 동기화 타입에 따라 선택적으로 데이터 로드
function loadDataByType(type) {
	switch(type) {
		case 'rule':
			// 규칙만 로드
			return Promise.all([
				database.ref(`rooms/${currentRoomKey}/hiddenGroups`).once('value'),
				database.ref(`rooms/${currentRoomKey}/hiddenGroupChains`).once('value'),
				database.ref(`rooms/${currentRoomKey}/pendingHiddenGroups`).once('value'),
				database.ref(`rooms/${currentRoomKey}/pendingHiddenGroupChains`).once('value')
			]).then(([hiddenGroupsSnap, hiddenGroupChainsSnap, pendingHiddenGroupsSnap, pendingHiddenGroupChainsSnap]) => {
				state.hiddenGroups = hiddenGroupsSnap.val() || [];
				state.hiddenGroupChains = hiddenGroupChainsSnap.val() || [];
				state.pendingHiddenGroups = pendingHiddenGroupsSnap.val() || [];
				state.pendingHiddenGroupChains = pendingHiddenGroupChainsSnap.val() || [];
			});
		
		case 'option':
			// 옵션만 로드
			return Promise.all([
				database.ref(`rooms/${currentRoomKey}/maxTeamSizeEnabled`).once('value'),
				database.ref(`rooms/${currentRoomKey}/genderBalanceEnabled`).once('value'),
				database.ref(`rooms/${currentRoomKey}/weightBalanceEnabled`).once('value'),
				database.ref(`rooms/${currentRoomKey}/membersPerTeam`).once('value')
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
				database.ref(`rooms/${currentRoomKey}/people`).once('value'),
				database.ref(`rooms/${currentRoomKey}/nextId`).once('value')
			]).then(([peopleSnap, nextIdSnap]) => {
				state.people = peopleSnap.val() || [];
				state.nextId = nextIdSnap.val() || 1;
				
				buildForbiddenMap();
				renderPeople();
			});
		
		case 'people':
			// 미참가자만 로드
			return database.ref(`rooms/${currentRoomKey}/inactivePeople`).once('value')
				.then((snapshot) => {
					state.inactivePeople = snapshot.val() || [];
					renderPeople();
				});
		
		case 'constraint':
			// 제약만 로드
			return Promise.all([
				database.ref(`rooms/${currentRoomKey}/requiredGroups`).once('value'),
				database.ref(`rooms/${currentRoomKey}/forbiddenPairs`).once('value'),
				database.ref(`rooms/${currentRoomKey}/pendingConstraints`).once('value')
			]).then(([requiredGroupsSnap, forbiddenPairsSnap, pendingConstraintsSnap]) => {
				state.requiredGroups = requiredGroupsSnap.val() || [];
				state.forbiddenPairs = forbiddenPairsSnap.val() || [];
				state.pendingConstraints = pendingConstraintsSnap.val() || [];
				
				buildForbiddenMap();
				renderPeople();
			});
		
		case 'all':
		default:
			// 전체 데이터 로드
			return database.ref(`rooms/${currentRoomKey}`).once('value')
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
