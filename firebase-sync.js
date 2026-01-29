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
		
		if (typeof firebase !== 'undefined' && firebaseConfig.apiKey !== "YOUR_API_KEY") {
			firebaseApp = firebase.initializeApp(firebaseConfig);
			database = firebase.database();
			console.log('✅ Firebase 초기화 완료');
			
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

// 실시간 동기화 설정
function setupRealtimeSync() {
	if (!database || !currentRoomKey) return;
	if (realtimeSyncActive) return; // 이미 활성화되어 있으면 다시 설정하지 않음
	
	realtimeSyncActive = true;
	database.ref(`rooms/${currentRoomKey}`).on('value', (snapshot) => {
		const data = snapshot.val();
		if (data && data.timestamp) {
			// 자신이 저장한 것이 아닌 경우에만 로드
			const timeDiff = Date.now() - data.timestamp;
			if (timeDiff > 1000) { // 1초 이상 차이나면 다른 사용자의 변경
				loadStateFromData(data);
			}
		}
	});
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
