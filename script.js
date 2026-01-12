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
						else safeOpenForbiddenWindow();
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
									safeOpenForbiddenWindow();
								}
							} else {
								const pres = addPendingConstraint(ln, rn);
								if (!pres.ok) console.log('보류 제약 추가 실패:', pres.message);
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
				safeOpenForbiddenWindow();
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
			safeOpenForbiddenWindow();
			return { ok: true }; 
		}
	}
	// If no applied pair found (or persons not present), remove matching pending textual constraints (either order)
	const beforePending = state.pendingConstraints.length;
	state.pendingConstraints = state.pendingConstraints.filter(pc => !( (pc.left === na && pc.right === nb) || (pc.left === nb && pc.right === na) ));
	if (state.pendingConstraints.length !== beforePending) {
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
				header{background:linear-gradient(135deg,var(--accent) 0%, #764ba2 100%);color:#fff;padding:14px;border-radius:8px;margin-bottom:12px}
				h1{margin:0;font-size:18px}
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
			<header><h1>제약 연결</h1></header>
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
					let reShowTimeout = null;
					// 로컬(파일/localhost) 환경에서는 보기 모달을 자동으로 숨김 처리
					const isLocal = (function(){
						try { return !!parentWindow && typeof parentWindow.isLocalView === 'function' && parentWindow.isLocalView(); }
						catch(e){ return false; }
					})();
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
					// 로컬 환경에서는 초기 모달을 즉시 숨김 처리
					if (isLocal) { hideModal(); }
					function scheduleModalShow(){
						if (reShowTimeout) clearTimeout(reShowTimeout);
						reShowTimeout = setTimeout(()=>{
							modal.style.display = '';
							modal.classList.add('visible');
							document.getElementById('appliedSection').style.display = 'none';
							document.getElementById('pendingSection').style.display = 'none';
							showWarn.style.display = '';
						}, 1000);
					}
					function cancelModalShow(){ if (reShowTimeout){ clearTimeout(reShowTimeout); reShowTimeout = null; } }
					// 로컬 환경에서는 모달 재노출 이벤트 비활성화
					if (!isLocal) {
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

	const teamCount = Math.max(1, Math.ceil(people.length / state.membersPerTeam));
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

		// Shuffle groups and assign randomly
		const shuffledGroups = [...validGroups].sort(() => Math.random() - 0.5);
		let groupFailed = false;

		for (const group of shuffledGroups) {
			const groupMembers = group.map(id => people.find(p => p.id === id)).filter(Boolean);
			
			// Count minimum gender in this group
			const groupMinGender = isFemaleLess ? 
				groupMembers.filter(p => p.gender === 'female').length :
				groupMembers.filter(p => p.gender === 'male').length;
			
			// Find valid teams
			let validTeams = [];
			for (let i = 0; i < teams.length; i++) {
				// Check 1: Size constraint
				if (teams[i].length + groupMembers.length > state.membersPerTeam) continue;
				
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
					const futureMinGender = currentMinGender + groupMinGender;
					
					// Find the team with the LEAST minimum gender
					const allTeamMinGenders = teams.map(t => 
						isFemaleLess ? 
							t.filter(p => p.gender === 'female').length :
							t.filter(p => p.gender === 'male').length
					);
					const globalMinGender = Math.min(...allTeamMinGenders);
					
					// Only allow if this team currently has the minimum OR would not exceed balance
					if (currentMinGender > globalMinGender) continue;
				}
				
				validTeams.push(i);
			}
			
			if (validTeams.length === 0) {
				groupFailed = true;
				break;
			}
			
			// Randomly pick from valid teams
			const selectedTeam = validTeams[Math.floor(Math.random() * validTeams.length)];
			teams[selectedTeam].push(...groupMembers);
			groupMembers.forEach(m => assigned.add(m.id));
		}

		if (groupFailed) continue;

		// Assign individual people
		const unassignedPeople = people.filter(p => !assigned.has(p.id));
		let personFailed = false;

		for (const person of unassignedPeople) {
			const personMinGender = (isFemaleLess && person.gender === 'female') || 
			                        (!isFemaleLess && person.gender === 'male') ? 1 : 0;
			
			// Find valid teams
			let validTeams = [];
			for (let i = 0; i < teams.length; i++) {
				// Check 1: Size constraint
				if (teams[i].length >= state.membersPerTeam) continue;
				
				// Check 2: No conflicts
				if (teams[i].some(tm => isForbidden(tm.id, person.id))) continue;
				
				// Check 3: Gender balance - only if enabled
				if (state.genderBalanceEnabled && personMinGender === 1) {
					const currentMinGender = isFemaleLess ? 
						teams[i].filter(p => p.gender === 'female').length :
						teams[i].filter(p => p.gender === 'male').length;
					
					// Find the team with the LEAST minimum gender
					const allTeamMinGenders = teams.map(t => 
						isFemaleLess ? 
							t.filter(p => p.gender === 'female').length :
							t.filter(p => p.gender === 'male').length
					);
					const globalMinGender = Math.min(...allTeamMinGenders);
					
					// Only allow if this team currently has the minimum
					if (currentMinGender > globalMinGender) continue;
				}
				
				validTeams.push(i);
			}
			
			if (validTeams.length === 0) {
				personFailed = true;
				break;
			}
			
			// Priority 1: Teams with only 1 unit (need 2nd unit)
			const teamUnits = validTeams.map(idx => {
				const groupSet = new Set();
				let ungroupedCount = 0;
				for (const member of teams[idx]) {
					const gi = getPersonGroupIndex(member.id);
					if (gi === -1) ungroupedCount++;
					else groupSet.add(gi);
				}
				return { idx, units: groupSet.size + ungroupedCount, size: teams[idx].length };
			});
			
			const needUnit = teamUnits.filter(t => t.units < 2);
			let candidateTeams = needUnit.length > 0 ? needUnit : teamUnits;
			
			// Priority 2: Among candidates, always prefer smallest teams
			const minSize = Math.min(...candidateTeams.map(t => t.size));
			candidateTeams = candidateTeams.filter(t => t.size === minSize);
			
			// Priority 3: Weight balance (if enabled)
			let selectedTeam;
			if (state.weightBalanceEnabled && candidateTeams.length > 1) {
				const teamWeights = candidateTeams.map(t => ({
					...t,
					weight: teams[t.idx].reduce((sum, p) => sum + (p.weight || 0), 0)
				}));
				const minWeight = Math.min(...teamWeights.map(t => t.weight));
				const lightestTeams = teamWeights.filter(t => t.weight === minWeight);
				selectedTeam = lightestTeams[Math.floor(Math.random() * lightestTeams.length)].idx;
			} else {
				selectedTeam = candidateTeams[Math.floor(Math.random() * candidateTeams.length)].idx;
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
		
		if (allValid) return teams;
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
